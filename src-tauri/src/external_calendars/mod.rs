//! Read-only overlay of external calendars (Google Calendar, iCloud) on the
//! Sessions calendar.
//!
//! Nothing here is an entity: external events have no `space_id`, take no part
//! in relationships, never require a Course, and live outside `nookly.db` in
//! their own cache file. Nookly only ever reads from the providers. There is no
//! code path that creates, edits, or deletes an event on either side.

pub mod google;
pub mod icloud;
mod ics;
mod secrets;

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Where the cached events and connection settings live, next to `nookly.db`.
const STORE_FILE: &str = "external-calendars.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Google,
    Icloud,
}

/// One calendar on a connected account. Only `selected` ones are fetched and
/// overlaid; none are selected right after connecting.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCalendar {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub provider: Provider,
    /// The Google account email or the Apple ID, for display only.
    pub account: String,
    pub calendars: Vec<RemoteCalendar>,
    pub last_synced_at: Option<String>,
    /// Why the last sync failed, cleared by the next successful one. The overlay
    /// keeps showing the cached events meanwhile.
    pub last_error: Option<String>,
}

/// One occurrence of an external event, already expanded from any recurrence.
/// Timed events carry UTC RFC 3339 instants; all day events carry `YYYY-MM-DD`
/// dates with an exclusive `end`, as both providers define them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalEvent {
    pub id: String,
    pub provider: Provider,
    pub calendar_id: String,
    pub calendar_name: String,
    pub color: Option<String>,
    pub title: String,
    pub location: Option<String>,
    pub all_day: bool,
    pub start: String,
    pub end: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct StoreData {
    connections: Vec<Connection>,
    events: Vec<ExternalEvent>,
}

pub struct ExternalCalendarState {
    path: PathBuf,
    data: Mutex<StoreData>,
    /// Serializes syncs, so a poll and a manual refresh never interleave.
    sync_lock: Mutex<()>,
    google_token: Mutex<Option<google::AccessToken>>,
    /// Set by `cancel_google_connect` to stop waiting on the browser sign in.
    google_connect_cancelled: Arc<AtomicBool>,
}

impl ExternalCalendarState {
    pub fn load(app_data_dir: &std::path::Path) -> Self {
        let path = app_data_dir.join(STORE_FILE);
        // A missing or unreadable cache is just an empty one: it only holds data
        // that the next sync fetches again.
        let data = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        Self {
            path,
            data: Mutex::new(data),
            sync_lock: Mutex::new(()),
            google_token: Mutex::new(None),
            google_connect_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn save(&self, data: &StoreData) -> AppResult<()> {
        let json = serde_json::to_string(data).map_err(|e| AppError::Io(e.to_string()))?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| AppError::Io(e.to_string()))?;
        std::fs::rename(&tmp, &self.path).map_err(|e| AppError::Io(e.to_string()))
    }

    pub async fn connections(&self) -> Vec<Connection> {
        self.data.lock().await.connections.clone()
    }

    /// Cached events of selected calendars touching `from..=to` (`YYYY-MM-DD`).
    /// Timed events compare by their UTC date, so callers pad the range by a day.
    pub async fn events_between(&self, from: &str, to: &str) -> Vec<ExternalEvent> {
        let data = self.data.lock().await;
        data.events
            .iter()
            .filter(|e| {
                data.connections.iter().any(|c| {
                    c.provider == e.provider
                        && c.calendars
                            .iter()
                            .any(|cal| cal.selected && cal.id == e.calendar_id)
                })
            })
            .filter(|e| date_part(&e.start) <= to && date_part(&e.end) >= from)
            .cloned()
            .collect()
    }

    /// Adds or replaces the connection for its provider, keeping the calendar
    /// selection of a previous connection to the same account.
    async fn upsert_connection(&self, mut connection: Connection) -> AppResult<Connection> {
        let mut data = self.data.lock().await;
        if let Some(existing) = data
            .connections
            .iter()
            .find(|c| c.provider == connection.provider && c.account == connection.account)
        {
            merge_selection(&mut connection.calendars, &existing.calendars);
        }
        data.connections
            .retain(|c| c.provider != connection.provider);
        data.connections.push(connection.clone());
        self.save(&data)?;
        Ok(connection)
    }

    pub async fn set_selected(
        &self,
        provider: Provider,
        calendar_id: &str,
        selected: bool,
    ) -> AppResult<Connection> {
        let mut data = self.data.lock().await;
        let connection = data
            .connections
            .iter_mut()
            .find(|c| c.provider == provider)
            .ok_or_else(|| AppError::NotFound(format!("{provider:?} connection")))?;
        let calendar = connection
            .calendars
            .iter_mut()
            .find(|c| c.id == calendar_id)
            .ok_or_else(|| AppError::NotFound(format!("calendar {calendar_id}")))?;
        calendar.selected = selected;
        let updated = connection.clone();
        if !selected {
            data.events
                .retain(|e| !(e.provider == provider && e.calendar_id == calendar_id));
        }
        self.save(&data)?;
        Ok(updated)
    }

    pub async fn disconnect(&self, provider: Provider) -> AppResult<()> {
        {
            let mut data = self.data.lock().await;
            data.connections.retain(|c| c.provider != provider);
            data.events.retain(|e| e.provider != provider);
            self.save(&data)?;
        }
        if provider == Provider::Google {
            if let Ok(Some(refresh_token)) = secrets::get(Provider::Google) {
                google::revoke(&refresh_token).await;
            }
            *self.google_token.lock().await = None;
        }
        secrets::delete(provider)
    }

    /// Refreshes every connection's calendar list and the events of its selected
    /// calendars. A failing provider keeps its cached events and records why.
    pub async fn sync(&self) -> Vec<Connection> {
        let _guard = self.sync_lock.lock().await;
        let connections = self.connections().await;
        for connection in connections {
            let result = match connection.provider {
                Provider::Google => google::fetch(self, &connection).await,
                Provider::Icloud => icloud::fetch(&connection).await,
            };
            let mut data = self.data.lock().await;
            // Disconnected while the fetch ran: drop the result.
            let Some(current) = data
                .connections
                .iter_mut()
                .find(|c| c.provider == connection.provider)
            else {
                continue;
            };
            match result {
                Ok(Fetched {
                    mut calendars,
                    events,
                }) => {
                    merge_selection(&mut calendars, &current.calendars);
                    current.calendars = calendars;
                    current.last_synced_at = Some(crate::db::now());
                    current.last_error = None;
                    let provider = current.provider;
                    let selected: Vec<String> = current
                        .calendars
                        .iter()
                        .filter(|c| c.selected)
                        .map(|c| c.id.clone())
                        .collect();
                    data.events.retain(|e| e.provider != provider);
                    data.events.extend(
                        events
                            .into_iter()
                            .filter(|e| selected.contains(&e.calendar_id)),
                    );
                }
                Err(message) => current.last_error = Some(message),
            }
            let _ = self.save(&data);
        }
        self.connections().await
    }
}

/// What one provider returned in a sync.
pub struct Fetched {
    pub calendars: Vec<RemoteCalendar>,
    pub events: Vec<ExternalEvent>,
}

/// The period each sync caches: far enough back and ahead to browse a
/// semester in either direction offline.
pub fn sync_window() -> (chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>) {
    let now = chrono::Utc::now();
    (
        now - chrono::Duration::weeks(26),
        now + chrono::Duration::weeks(52),
    )
}

fn merge_selection(calendars: &mut [RemoteCalendar], previous: &[RemoteCalendar]) {
    for calendar in calendars {
        calendar.selected = previous.iter().any(|p| p.id == calendar.id && p.selected);
    }
}

fn date_part(value: &str) -> &str {
    value.get(..10).unwrap_or(value)
}

/// A user facing message for a failed provider request.
fn remote_error(message: impl Into<String>) -> AppError {
    AppError::Remote(message.into())
}
