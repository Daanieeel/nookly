//! Moodle through the calendar export feed every Moodle site offers (Calendar,
//! Import or export calendars, Export). The feed is a plain iCalendar file behind
//! a per user token in its URL, so it works with single sign on too, where a
//! username and password login would not. Only `GET` requests are ever sent.
//!
//! The URL carries the token, so it lives in the OS keychain, and no error
//! message built here may contain it.

use super::{
    ics, remote_error, secrets, sync_window, Connection, ExternalCalendarState, ExternalEvent,
    Fetched, Provider, RemoteCalendar,
};
use crate::error::AppResult;
use std::time::Duration;
use url::Url;

/// The one calendar a Moodle site offers: its whole feed.
const CALENDAR_ID: &str = "moodle";

/// A feed larger than this is not a Moodle calendar.
const MAX_FEED_BYTES: usize = 20 * 1024 * 1024;

const BAD_URL: &str = "That doesn't look like a Moodle calendar link. In Moodle, open Calendar, \
choose Import or export calendars, then Export calendar, and copy the link it gives you.";

/// Checks the pasted link and turns `webcal://` into `https://`. Feeds with a
/// token must not travel over plain `http`.
fn normalize_url(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    let trimmed = match trimmed.get(..9) {
        Some(prefix) if prefix.eq_ignore_ascii_case("webcal://") => {
            format!("https://{}", &trimmed[9..])
        }
        _ => trimmed.to_string(),
    };
    let url = Url::parse(&trimmed).map_err(|_| BAD_URL.to_string())?;
    let has_token = url
        .query_pairs()
        .any(|(key, value)| key == "authtoken" && !value.is_empty());
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.path().ends_with("/export_execute.php")
        || !has_token
    {
        return Err(BAD_URL.to_string());
    }
    Ok(url)
}

/// The site name shown next to the connection: the link's host.
fn site_name(url: &Url) -> String {
    url.host_str().unwrap_or("Moodle").to_string()
}

/// Moodle writes a deadline as an event that starts and ends at the same
/// moment, and names its course in `CATEGORIES`, which the overlay has no use
/// for. Each occurrence becomes one overlay event.
fn events_from_ics(data: &str, calendar: &RemoteCalendar) -> Vec<ExternalEvent> {
    let (from, to) = sync_window();
    ics::expand(data, from, to)
        .into_iter()
        .map(|o| ExternalEvent {
            id: format!("moodle:{}:{}", calendar.id, o.key),
            provider: Provider::Moodle,
            calendar_id: calendar.id.clone(),
            calendar_name: calendar.name.clone(),
            color: calendar.color.clone(),
            title: o.title,
            location: o.location,
            all_day: o.all_day,
            start: o.start,
            end: o.end,
        })
        .collect()
}

async fn download(url: &Url) -> Result<String, String> {
    // Never follow a redirect off https, so the token can't leak in the clear.
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.url().scheme() == "https" && attempt.previous().len() < 5 {
            attempt.follow()
        } else {
            attempt.stop()
        }
    });
    let client = reqwest::Client::builder()
        .redirect(policy)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Couldn't reach Moodle.".to_string())?;
    // `without_url` keeps the token out of the message.
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|e| describe_transport(&e))?;
    let status = response.status();
    if !status.is_success() {
        return Err(if status.as_u16() == 403 || status.as_u16() == 404 {
            "Moodle rejected the calendar link. Export a new one and reconnect.".into()
        } else {
            format!("Moodle answered with an error ({}).", status.as_u16())
        });
    }
    let body = response.bytes().await.map_err(|e| describe_transport(&e))?;
    if body.len() > MAX_FEED_BYTES {
        return Err("That link is not a Moodle calendar.".into());
    }
    let text = String::from_utf8_lossy(&body).into_owned();
    if !text.trim_start().starts_with("BEGIN:VCALENDAR") {
        return Err("That link is not a Moodle calendar.".into());
    }
    Ok(text)
}

fn describe_transport(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "Moodle took too long to answer.".into()
    } else {
        "Couldn't reach Moodle.".into()
    }
}

/// Checks the link by downloading the feed, then stores it in the keychain.
pub async fn connect(state: &ExternalCalendarState, link: &str) -> AppResult<Connection> {
    let url = normalize_url(link).map_err(remote_error)?;
    download(&url).await.map_err(remote_error)?;
    secrets::set(Provider::Moodle, url.as_str())?;
    let site = site_name(&url);
    state
        .upsert_connection(Connection {
            provider: Provider::Moodle,
            account: site.clone(),
            calendars: vec![RemoteCalendar {
                id: CALENDAR_ID.into(),
                name: site,
                color: None,
                // The only calendar there is, so there is nothing to pick.
                selected: true,
            }],
            last_synced_at: None,
            last_error: None,
        })
        .await
}

pub async fn fetch(connection: &Connection) -> Result<Fetched, String> {
    let link = secrets::get(Provider::Moodle)
        .map_err(|e| e.to_string())?
        .ok_or("Moodle needs to be reconnected.")?;
    let url = normalize_url(&link).map_err(|_| "Moodle needs to be reconnected.".to_string())?;
    let calendars = connection.calendars.clone();
    let mut events = Vec::new();
    for calendar in calendars.iter().filter(|c| c.selected) {
        let data = download(&url).await?;
        events.extend(events_from_ics(&data, calendar));
    }
    Ok(Fetched { calendars, events })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LINK: &str = "https://moodle.uni.edu/calendar/export_execute.php?userid=7&authtoken=abc123&preset_what=all&preset_time=recentupcoming";

    fn calendar() -> RemoteCalendar {
        RemoteCalendar {
            id: CALENDAR_ID.into(),
            name: "moodle.uni.edu".into(),
            color: None,
            selected: true,
        }
    }

    #[test]
    fn accepts_the_export_link() {
        assert_eq!(normalize_url(LINK).unwrap().as_str(), LINK);
        assert_eq!(
            normalize_url(&format!("  {LINK}\n")).unwrap().as_str(),
            LINK
        );
    }

    #[test]
    fn turns_webcal_into_https() {
        let webcal = LINK.replacen("https://", "webcal://", 1);
        assert_eq!(normalize_url(&webcal).unwrap().as_str(), LINK);
        let upper = LINK.replacen("https://", "WEBCAL://", 1);
        assert_eq!(normalize_url(&upper).unwrap().as_str(), LINK);
    }

    #[test]
    fn accepts_a_site_in_a_subfolder() {
        let link = "https://uni.edu/moodle/calendar/export_execute.php?userid=7&authtoken=abc";
        assert!(normalize_url(link).is_ok());
    }

    #[test]
    fn refuses_links_that_are_not_a_moodle_export() {
        for bad in [
            "",
            "moodle.uni.edu",
            "https://moodle.uni.edu/",
            "https://moodle.uni.edu/my/",
            // No token.
            "https://moodle.uni.edu/calendar/export_execute.php?userid=7",
            "https://moodle.uni.edu/calendar/export_execute.php?userid=7&authtoken=",
            // The token must not travel in the clear.
            "http://moodle.uni.edu/calendar/export_execute.php?userid=7&authtoken=abc",
            "file:///calendar/export_execute.php?authtoken=abc",
        ] {
            assert_eq!(normalize_url(bad).unwrap_err(), BAD_URL, "{bad}");
        }
    }

    #[test]
    fn names_the_site_by_its_host() {
        assert_eq!(site_name(&normalize_url(LINK).unwrap()), "moodle.uni.edu");
    }

    #[test]
    fn a_deadline_becomes_an_overlay_event() {
        let (from, _) = sync_window();
        let due = (from + chrono::Duration::weeks(30)).format("%Y%m%dT100000Z");
        let ics = format!(
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Moodle//EN\r\n\
             BEGIN:VEVENT\r\nUID:42@moodle.uni.edu\r\nSUMMARY:Essay is due\r\n\
             CATEGORIES:Course: Maths\r\nDTSTART:{due}\r\nDTEND:{due}\r\nEND:VEVENT\r\n\
             END:VCALENDAR\r\n"
        );
        let events = events_from_ics(&ics, &calendar());
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event.title, "Essay is due");
        assert_eq!(event.provider, Provider::Moodle);
        assert_eq!(event.calendar_id, CALENDAR_ID);
        assert_eq!(event.calendar_name, "moodle.uni.edu");
        assert!(event.id.starts_with("moodle:moodle:"), "{}", event.id);
        assert!(!event.all_day);
    }

    #[test]
    fn a_feed_that_does_not_parse_has_no_events() {
        assert!(events_from_ics("not a calendar", &calendar()).is_empty());
    }
}
