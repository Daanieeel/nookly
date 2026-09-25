//! iCloud over CalDAV (via `libdav`), authenticated with an app specific
//! password. Only `PROPFIND` and `REPORT` requests are ever sent.

use super::{
    ics, remote_error, secrets, sync_window, Connection, ExternalCalendarState, ExternalEvent,
    Fetched, Provider, RemoteCalendar,
};
use crate::error::AppResult;
use http::Uri;
use hyper_rustls::HttpsConnectorBuilder;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use libdav::caldav::{
    CalendarComponent, FindCalendarHomeSet, FindCalendars, GetCalendarResources,
    GetSupportedComponents, ListCalendarResources, TimeRange, UtcTimestamp,
};
use libdav::dav::{GetProperty, WebDavClient};
use libdav::{names, CalDavClient};
use tower_http::auth::AddAuthorization;

const ICLOUD_URL: &str = "https://caldav.icloud.com/";

/// How many resources one `calendar-multiget` asks for.
const MULTIGET_CHUNK: usize = 100;

type Http = AddAuthorization<Client<hyper_rustls::HttpsConnector<HttpConnector>, String>>;

fn http(apple_id: &str, password: &str) -> Http {
    let connector = HttpsConnectorBuilder::new()
        .with_webpki_roots()
        .https_only()
        .enable_http1()
        .build();
    let client = Client::builder(TokioExecutor::new()).build(connector);
    AddAuthorization::basic(client, apple_id, password)
}

fn caldav(base: Uri, apple_id: &str, password: &str) -> CalDavClient<Http> {
    CalDavClient::new(WebDavClient::new(base, http(apple_id, password)))
}

/// A user facing message for a failed CalDAV request.
fn describe(e: impl std::fmt::Display) -> String {
    let text = e.to_string();
    if text.contains("401") {
        "Apple rejected the Apple ID or app specific password. Generate a new password and reconnect."
            .into()
    } else if text.contains("client error") || text.contains("http request failed") {
        "Couldn't reach iCloud.".into()
    } else {
        format!("iCloud request failed: {text}")
    }
}

/// Finds the account's event calendars, returning a client pointed at the host
/// that serves them together with each calendar's collection href as its id.
async fn discover(
    apple_id: &str,
    password: &str,
) -> Result<(CalDavClient<Http>, Vec<RemoteCalendar>), String> {
    let root_url: Uri = ICLOUD_URL.parse().map_err(describe)?;
    let root = caldav(root_url, apple_id, password);
    let principal = root
        .find_current_user_principal()
        .await
        .map_err(describe)?
        .ok_or("iCloud found no calendars for this Apple ID.")?;
    let home = root
        .request(FindCalendarHomeSet::new(principal.path()))
        .await
        .map_err(describe)?
        .home_sets
        .into_iter()
        .next()
        .ok_or("iCloud found no calendars for this Apple ID.")?;

    // iCloud serves each account from its own host (`pNN-caldav.icloud.com`).
    let client = match (home.scheme(), home.authority()) {
        (Some(scheme), Some(authority)) => {
            let base = Uri::builder()
                .scheme(scheme.clone())
                .authority(authority.clone())
                .path_and_query("/")
                .build()
                .map_err(describe)?;
            caldav(base, apple_id, password)
        }
        _ => root,
    };

    let found = client
        .request(FindCalendars::new(home.path()))
        .await
        .map_err(describe)?
        .calendars;
    let mut calendars = Vec::new();
    for collection in found {
        // Reminders lists are calendars too, but hold only tasks.
        let components = client
            .request(GetSupportedComponents::new(&collection.href))
            .await
            .map(|r| r.components)
            .unwrap_or_default();
        if !components.is_empty() && !components.contains(&CalendarComponent::VEvent) {
            continue;
        }
        let name = client
            .request(GetProperty::new(&collection.href, &names::DISPLAY_NAME))
            .await
            .ok()
            .and_then(|r| r.value);
        let color = client
            .request(GetProperty::new(&collection.href, &names::CALENDAR_COLOUR))
            .await
            .ok()
            .and_then(|r| r.value)
            // Apple writes `#RRGGBBAA`; the overlay only needs the color.
            .map(|c| c.chars().take(7).collect::<String>());
        calendars.push(RemoteCalendar {
            name: name.unwrap_or_else(|| "Calendar".into()),
            id: collection.href,
            color,
            selected: false,
        });
    }
    Ok((client, calendars))
}

/// Checks the credentials by listing the calendars, then stores the password.
pub async fn connect(
    state: &ExternalCalendarState,
    apple_id: &str,
    password: &str,
) -> AppResult<Connection> {
    let apple_id = apple_id.trim();
    // Apple shows app specific passwords as `abcd-efgh-ijkl-mnop`; spaces sneak in on paste.
    let password: String = password.chars().filter(|c| !c.is_whitespace()).collect();
    let (_, calendars) = discover(apple_id, &password).await.map_err(remote_error)?;
    secrets::set(Provider::Icloud, &password)?;
    state
        .upsert_connection(Connection {
            provider: Provider::Icloud,
            account: apple_id.to_string(),
            calendars,
            last_synced_at: None,
            last_error: None,
        })
        .await
}

pub async fn fetch(connection: &Connection) -> Result<Fetched, String> {
    let password = secrets::get(Provider::Icloud)
        .map_err(|e| e.to_string())?
        .ok_or("iCloud needs to be reconnected.")?;
    let (client, calendars) = discover(&connection.account, &password).await?;
    let (from, to) = sync_window();
    let stamp = |dt: chrono::DateTime<chrono::Utc>| {
        dt.format("%Y%m%dT%H%M%SZ")
            .to_string()
            .parse::<UtcTimestamp>()
            .map_err(|_| "invalid sync window".to_string())
    };
    let range = TimeRange::Between(stamp(from)?, stamp(to)?);

    let mut events = Vec::new();
    for calendar in &calendars {
        let selected = connection
            .calendars
            .iter()
            .any(|c| c.selected && c.id == calendar.id);
        if !selected {
            continue;
        }
        let hrefs: Vec<String> = client
            .request(
                ListCalendarResources::new(&calendar.id)
                    .with_component_and_time_range(CalendarComponent::VEvent, range.clone()),
            )
            .await
            .map_err(describe)?
            .resources
            .into_iter()
            .filter(|r| !r.resource_type.is_collection)
            .map(|r| r.href)
            .collect();
        for chunk in hrefs.chunks(MULTIGET_CHUNK) {
            let resources = client
                .request(GetCalendarResources::new(&calendar.id).with_hrefs(chunk))
                .await
                .map_err(describe)?
                .resources;
            for resource in resources {
                let Ok(content) = resource.content else {
                    continue;
                };
                events.extend(ics::expand(&content.data, from, to).into_iter().map(|o| {
                    ExternalEvent {
                        id: format!("icloud:{}:{}", calendar.id, o.key),
                        provider: Provider::Icloud,
                        calendar_id: calendar.id.clone(),
                        calendar_name: calendar.name.clone(),
                        color: calendar.color.clone(),
                        title: o.title,
                        location: o.location,
                        all_day: o.all_day,
                        start: o.start,
                        end: o.end,
                    }
                }));
            }
        }
    }
    Ok(Fetched { calendars, events })
}
