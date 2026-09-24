use crate::db::entities::Entity;
use crate::db::sessions::{
    self, BriefingSession, OccurrenceOverride, SeriesPatch, SessionOccurrence, SessionPages,
};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_session_template(
    state: State<DbState>,
    space_id: String,
    title: String,
    course_id: String,
    weekday: i64,
    start_time: String,
    end_time: String,
    location: Option<String>,
    anchor_date: String,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    sessions::create_session_template(
        &conn,
        space_id,
        title,
        course_id,
        weekday,
        start_time,
        end_time,
        location,
        anchor_date,
    )
}

#[tauri::command]
pub fn generate_occurrences(
    state: State<DbState>,
    template_id: String,
    until_date: String,
) -> AppResult<Vec<SessionOccurrence>> {
    let conn = state.0.lock().unwrap();
    sessions::generate_occurrences(&conn, &template_id, &until_date)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_one_off_session(
    state: State<DbState>,
    space_id: String,
    title: String,
    course_id: String,
    date: String,
    start_time: String,
    end_time: String,
    location: Option<String>,
) -> AppResult<SessionOccurrence> {
    let conn = state.0.lock().unwrap();
    sessions::create_one_off_session(
        &conn, space_id, title, course_id, date, start_time, end_time, location,
    )
}

#[tauri::command]
pub fn override_occurrence(
    state: State<DbState>,
    entity_id: String,
    patch: OccurrenceOverride,
) -> AppResult<SessionOccurrence> {
    let conn = state.0.lock().unwrap();
    sessions::override_occurrence(&conn, &entity_id, patch)
}

#[tauri::command]
pub fn list_sessions(state: State<DbState>, space_id: String) -> AppResult<Vec<SessionOccurrence>> {
    let conn = state.0.lock().unwrap();
    sessions::list_sessions(&conn, &space_id)
}

#[tauri::command]
pub fn list_sessions_today(state: State<DbState>) -> AppResult<Vec<BriefingSession>> {
    let conn = state.0.lock().unwrap();
    sessions::list_sessions_today(&conn)
}

#[tauri::command]
pub fn list_sessions_between(
    state: State<DbState>,
    from: String,
    to: String,
) -> AppResult<Vec<BriefingSession>> {
    let conn = state.0.lock().unwrap();
    sessions::list_sessions_between(&conn, &from, &to)
}

#[tauri::command]
pub fn update_session_series(
    state: State<DbState>,
    template_id: String,
    from_date: String,
    patch: SeriesPatch,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    sessions::update_session_series(&conn, &template_id, &from_date, patch)
}

#[tauri::command]
pub fn delete_session_series(
    state: State<DbState>,
    template_id: String,
    from_date: String,
) -> AppResult<usize> {
    let conn = state.0.lock().unwrap();
    sessions::delete_session_series(&conn, &template_id, &from_date)
}

#[tauri::command]
pub fn get_session_pages(state: State<DbState>, session_id: String) -> AppResult<SessionPages> {
    let conn = state.0.lock().unwrap();
    sessions::get_session_pages(&conn, &session_id)
}

#[tauri::command]
pub fn create_session_page(
    state: State<DbState>,
    session_id: String,
    kind: String,
    title: String,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    sessions::create_session_page(&conn, &session_id, &kind, title)
}

#[tauri::command]
pub fn link_session_page(
    state: State<DbState>,
    session_id: String,
    kind: String,
    page_id: String,
) -> AppResult<bool> {
    let conn = state.0.lock().unwrap();
    sessions::link_session_page(&conn, &session_id, &kind, &page_id)
}
