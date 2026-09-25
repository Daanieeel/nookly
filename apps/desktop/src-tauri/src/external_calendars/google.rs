//! Google Calendar over its REST API v3, signed in with the OAuth 2 flow for
//! installed apps: the system browser, a loopback redirect, and PKCE. Only the
//! read only calendar list and events scopes are requested.

use super::{
    remote_error, secrets, sync_window, Connection, ExternalCalendarState, ExternalEvent, Fetched,
    Provider, RemoteCalendar,
};
use crate::error::AppResult;
use base64::Engine as _;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri_plugin_opener::OpenerExt;

/// Set at build time. Without them the Google connection is unavailable in
/// that build. For installed apps Google does not treat the secret as secret.
const CLIENT_ID: Option<&str> = option_env!("NOOKLY_GOOGLE_CLIENT_ID");
const CLIENT_SECRET: Option<&str> = option_env!("NOOKLY_GOOGLE_CLIENT_SECRET");

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const API_URL: &str = "https://www.googleapis.com/calendar/v3";
const SCOPES: &str = "https://www.googleapis.com/auth/calendar.calendarlist.readonly \
                      https://www.googleapis.com/auth/calendar.events.readonly";

/// How long the browser sign in may take before giving up.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

pub struct AccessToken {
    token: String,
    expires_at: Instant,
}

fn client_id() -> Option<&'static str> {
    CLIENT_ID.filter(|id| !id.is_empty())
}

pub fn available() -> bool {
    client_id().is_some()
}

/// Runs the browser sign in, stores the refresh token, and returns the new
/// connection with its calendars, none of them selected yet.
pub async fn connect(
    state: &ExternalCalendarState,
    app: &tauri::AppHandle,
) -> AppResult<Connection> {
    let client_id = client_id()
        .ok_or_else(|| remote_error("This build of Nookly has no Google client configured."))?;
    state
        .google_connect_cancelled
        .store(false, Ordering::SeqCst);

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| remote_error(format!("Couldn't start the sign in listener: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| remote_error(e.to_string()))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let verifier = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(Sha256::digest(verifier.as_bytes()));
    let csrf = uuid::Uuid::new_v4().simple().to_string();
    let auth_url = url::Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", SCOPES),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("state", csrf.as_str()),
            ("access_type", "offline"),
            // Always ask, so Google hands out a refresh token on every connect.
            ("prompt", "consent"),
        ],
    )
    .map_err(|e| remote_error(e.to_string()))?;
    app.opener()
        .open_url(auth_url.as_str(), None::<&str>)
        .map_err(|e| remote_error(format!("Couldn't open the browser: {e}")))?;

    let cancelled = Arc::clone(&state.google_connect_cancelled);
    let code =
        tauri::async_runtime::spawn_blocking(move || wait_for_code(&listener, &csrf, &cancelled))
            .await
            .map_err(|e| remote_error(e.to_string()))??;

    let mut params = vec![
        ("code", code.as_str()),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier.as_str()),
    ];
    if let Some(secret) = CLIENT_SECRET {
        params.push(("client_secret", secret));
    }
    let token = token_request(&params).await.map_err(remote_error)?;
    let refresh_token = token.refresh_token.clone().ok_or_else(|| {
        remote_error("Google didn't return a refresh token. Try connecting again.")
    })?;
    secrets::set(Provider::Google, &refresh_token)?;
    let access = token.access_token.clone();
    *state.google_token.lock().await = Some(token.into());

    let client = reqwest::Client::new();
    let entries = list_calendars(&client, &access)
        .await
        .map_err(remote_error)?;
    let account = entries
        .iter()
        .find(|e| e.primary == Some(true))
        .map_or_else(|| "Google account".to_string(), |e| e.id.clone());
    state
        .upsert_connection(Connection {
            provider: Provider::Google,
            account,
            calendars: entries.into_iter().map(RemoteCalendar::from).collect(),
            last_synced_at: None,
            last_error: None,
        })
        .await
}

pub fn cancel_connect(state: &ExternalCalendarState) {
    state.google_connect_cancelled.store(true, Ordering::SeqCst);
}

/// Waits for the browser to land on the loopback redirect and returns the
/// authorization code from it.
fn wait_for_code(listener: &TcpListener, csrf: &str, cancelled: &AtomicBool) -> AppResult<String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| remote_error(e.to_string()))?;
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    loop {
        if cancelled.load(Ordering::SeqCst) {
            return Err(remote_error("Google sign in was cancelled."));
        }
        if Instant::now() > deadline {
            return Err(remote_error("Google sign in timed out. Try again."));
        }
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(result) = handle_redirect(stream, csrf) {
                    return result;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(remote_error(e.to_string())),
        }
    }
}

/// `None` for unrelated requests such as the browser asking for a favicon.
fn handle_redirect(mut stream: TcpStream, csrf: &str) -> Option<AppResult<String>> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 8192];
    let mut len = 0;
    while len < buf.len() {
        match stream.read(&mut buf[len..]) {
            Ok(0) | Err(_) => break,
            Ok(n) => len += n,
        }
        if buf[..len].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }
    let request = String::from_utf8_lossy(&buf[..len]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    let param = |name: &str| {
        url.query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.into_owned())
    };
    let (code, error) = (param("code"), param("error"));
    if code.is_none() && error.is_none() {
        let _ = stream
            .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return None;
    }
    let result = if error.is_some() {
        Err(remote_error("Google sign in was declined."))
    } else if param("state").as_deref() != Some(csrf) {
        Err(remote_error(
            "Google sign in returned an unexpected response. Try again.",
        ))
    } else {
        code.ok_or_else(|| remote_error("Google sign in failed."))
    };
    let message = if result.is_ok() {
        "Nookly is connected to Google Calendar. You can close this tab."
    } else {
        "Nookly couldn't connect to Google Calendar. You can close this tab and try again."
    };
    let body = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>Nookly</title>\
         <body style=\"font:15px system-ui;display:grid;place-items:center;height:90vh;margin:0\">\
         <p>{message}</p></body>"
    );
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    Some(result)
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
}

impl From<TokenResponse> for AccessToken {
    fn from(token: TokenResponse) -> Self {
        AccessToken {
            token: token.access_token,
            // A minute early, so a token never expires mid sync.
            expires_at: Instant::now() + Duration::from_secs(token.expires_in.saturating_sub(60)),
        }
    }
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
}

async fn token_request(params: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let response = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(params)
        .send()
        .await
        .map_err(|_| "Couldn't reach Google.".to_string())?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|_| "Couldn't reach Google.".to_string())?;
    if status.is_success() {
        return serde_json::from_str(&body)
            .map_err(|_| "Google sent an unexpected response.".into());
    }
    match serde_json::from_str::<TokenError>(&body) {
        Ok(e) if e.error == "invalid_grant" => {
            Err("Google access was revoked or expired. Reconnect Google Calendar.".into())
        }
        Ok(e) => Err(format!("Google refused the sign in ({}).", e.error)),
        Err(_) => Err(format!("Google refused the sign in ({status}).")),
    }
}

/// A valid access token, refreshed from the keychain's refresh token when the
/// cached one ran out.
async fn access_token(state: &ExternalCalendarState) -> Result<String, String> {
    let mut cached = state.google_token.lock().await;
    if let Some(token) = cached.as_ref().filter(|t| t.expires_at > Instant::now()) {
        return Ok(token.token.clone());
    }
    let client_id = client_id().ok_or("This build of Nookly has no Google client configured.")?;
    let refresh_token = secrets::get(Provider::Google)
        .map_err(|e| e.to_string())?
        .ok_or("Google Calendar needs to be reconnected.")?;
    let mut params = vec![
        ("client_id", client_id),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if let Some(secret) = CLIENT_SECRET {
        params.push(("client_secret", secret));
    }
    let token: AccessToken = token_request(&params).await?.into();
    let value = token.token.clone();
    *cached = Some(token);
    Ok(value)
}

/// Best effort; the keychain entry is removed either way.
pub async fn revoke(refresh_token: &str) {
    let _ = reqwest::Client::new()
        .post(REVOKE_URL)
        .form(&[("token", refresh_token)])
        .send()
        .await;
}

pub async fn fetch(
    state: &ExternalCalendarState,
    connection: &Connection,
) -> Result<Fetched, String> {
    let token = access_token(state).await?;
    let client = reqwest::Client::new();
    let entries = list_calendars(&client, &token).await?;
    let (from, to) = sync_window();
    let mut events = Vec::new();
    for entry in &entries {
        let selected = connection
            .calendars
            .iter()
            .any(|c| c.selected && c.id == entry.id);
        if selected {
            events.extend(list_events(&client, &token, entry, from, to).await?);
        }
    }
    Ok(Fetched {
        calendars: entries.into_iter().map(RemoteCalendar::from).collect(),
        events,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Page<T> {
    #[serde(default = "Vec::new")]
    items: Vec<T>,
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarListEntry {
    id: String,
    summary: Option<String>,
    summary_override: Option<String>,
    background_color: Option<String>,
    primary: Option<bool>,
}

impl CalendarListEntry {
    fn name(&self) -> String {
        self.summary_override
            .clone()
            .or_else(|| self.summary.clone())
            .unwrap_or_else(|| self.id.clone())
    }
}

impl From<CalendarListEntry> for RemoteCalendar {
    fn from(entry: CalendarListEntry) -> Self {
        RemoteCalendar {
            name: entry.name(),
            id: entry.id,
            color: entry.background_color,
            selected: false,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleEvent {
    id: String,
    status: Option<String>,
    summary: Option<String>,
    location: Option<String>,
    start: Option<EventTime>,
    end: Option<EventTime>,
    event_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventTime {
    date_time: Option<String>,
    date: Option<String>,
}

async fn get_json<T: DeserializeOwned>(
    client: &reqwest::Client,
    url: url::Url,
    token: &str,
) -> Result<T, String> {
    let response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "Couldn't reach Google Calendar.".to_string())?;
    match response.status().as_u16() {
        200..=299 => response
            .json::<T>()
            .await
            .map_err(|_| "Google Calendar sent an unexpected response.".into()),
        401 => Err("Google rejected the sign in. Reconnect Google Calendar.".into()),
        403 => Err("Google denied access to a calendar.".into()),
        status => Err(format!("Google Calendar request failed ({status}).")),
    }
}

async fn paged<T: DeserializeOwned>(
    client: &reqwest::Client,
    base: url::Url,
    token: &str,
) -> Result<Vec<T>, String> {
    let mut items = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut url = base.clone();
        if let Some(page) = &page_token {
            url.query_pairs_mut().append_pair("pageToken", page);
        }
        let page: Page<T> = get_json(client, url, token).await?;
        items.extend(page.items);
        match page.next_page_token {
            Some(next) => page_token = Some(next),
            None => return Ok(items),
        }
    }
}

async fn list_calendars(
    client: &reqwest::Client,
    token: &str,
) -> Result<Vec<CalendarListEntry>, String> {
    let url =
        url::Url::parse(&format!("{API_URL}/users/me/calendarList")).map_err(|e| e.to_string())?;
    paged(client, url, token).await
}

async fn list_events(
    client: &reqwest::Client,
    token: &str,
    calendar: &CalendarListEntry,
    from: chrono::DateTime<chrono::Utc>,
    to: chrono::DateTime<chrono::Utc>,
) -> Result<Vec<ExternalEvent>, String> {
    let mut url = url::Url::parse(API_URL).map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|()| "invalid Google Calendar URL".to_string())?
        .extend(["calendars", calendar.id.as_str(), "events"]);
    url.query_pairs_mut()
        // Google expands recurring events into their occurrences.
        .append_pair("singleEvents", "true")
        .append_pair("maxResults", "2500")
        .append_pair("timeMin", &from.to_rfc3339())
        .append_pair("timeMax", &to.to_rfc3339());
    let events: Vec<GoogleEvent> = paged(client, url, token).await?;
    let name = calendar.name();
    Ok(events
        .into_iter()
        .filter(|e| e.status.as_deref() != Some("cancelled"))
        // Working location markers are not events on anyone's day.
        .filter(|e| e.event_type.as_deref() != Some("workingLocation"))
        .filter_map(|e| {
            let (all_day, start, end) = match (e.start?, e.end?) {
                (
                    EventTime {
                        date: Some(start), ..
                    },
                    EventTime {
                        date: Some(end), ..
                    },
                ) => (true, start, end),
                (
                    EventTime {
                        date_time: Some(start),
                        ..
                    },
                    EventTime {
                        date_time: Some(end),
                        ..
                    },
                ) => (false, utc(&start)?, utc(&end)?),
                _ => return None,
            };
            Some(ExternalEvent {
                id: format!("google:{}:{}", calendar.id, e.id),
                provider: Provider::Google,
                calendar_id: calendar.id.clone(),
                calendar_name: name.clone(),
                color: calendar.background_color.clone(),
                title: e.summary.unwrap_or_default(),
                location: e.location.filter(|l| !l.is_empty()),
                all_day,
                start,
                end,
            })
        })
        .collect())
}

fn utc(rfc3339: &str) -> Option<String> {
    chrono::DateTime::parse_from_rfc3339(rfc3339)
        .ok()
        .map(|dt| {
            dt.with_timezone(&chrono::Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        })
}
