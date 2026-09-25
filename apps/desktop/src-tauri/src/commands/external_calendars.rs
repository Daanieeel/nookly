use crate::error::AppResult;
use crate::external_calendars::{
    google, icloud, Connection, ExternalCalendarState, ExternalEvent, Provider,
};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalCalendarStatus {
    /// False when this build has no Google OAuth client configured.
    google_available: bool,
    connections: Vec<Connection>,
}

#[tauri::command]
pub async fn external_calendar_status(
    state: State<'_, ExternalCalendarState>,
) -> AppResult<ExternalCalendarStatus> {
    Ok(ExternalCalendarStatus {
        google_available: google::available(),
        connections: state.connections().await,
    })
}

#[tauri::command]
pub async fn connect_google_calendar(
    app: tauri::AppHandle,
    state: State<'_, ExternalCalendarState>,
) -> AppResult<Connection> {
    google::connect(&state, &app).await
}

#[tauri::command]
pub fn cancel_google_calendar_connect(state: State<'_, ExternalCalendarState>) {
    google::cancel_connect(&state);
}

#[tauri::command]
pub async fn connect_icloud_calendar(
    state: State<'_, ExternalCalendarState>,
    apple_id: String,
    app_password: String,
) -> AppResult<Connection> {
    icloud::connect(&state, &apple_id, &app_password).await
}

#[tauri::command]
pub async fn set_external_calendar_selected(
    state: State<'_, ExternalCalendarState>,
    provider: Provider,
    calendar_id: String,
    selected: bool,
) -> AppResult<Connection> {
    state.set_selected(provider, &calendar_id, selected).await
}

#[tauri::command]
pub async fn disconnect_external_calendar(
    state: State<'_, ExternalCalendarState>,
    provider: Provider,
) -> AppResult<()> {
    state.disconnect(provider).await
}

/// Never fails as a whole: each connection records its own error and keeps
/// its cached events.
#[tauri::command]
pub async fn sync_external_calendars(
    state: State<'_, ExternalCalendarState>,
) -> AppResult<Vec<Connection>> {
    Ok(state.sync().await)
}

/// Cached events only, so the calendar never waits on the network.
#[tauri::command]
pub async fn list_external_events(
    state: State<'_, ExternalCalendarState>,
    from: String,
    to: String,
) -> AppResult<Vec<ExternalEvent>> {
    Ok(state.events_between(&from, &to).await)
}
