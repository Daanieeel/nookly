use crate::db::search::{self, SearchHit};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

/// Deliberately not Space-scoped by default (§6) — pass `space_id` only for an
/// in-Space search UI, never as the default behavior for the global Cmd+K search.
#[tauri::command]
pub fn search(
    state: State<DbState>,
    query: String,
    space_id: Option<String>,
) -> AppResult<Vec<SearchHit>> {
    let conn = state.0.lock().unwrap();
    search::search(&conn, &query, space_id.as_deref())
}

/// Notes pages rendered inline on another entity's page (Course/Semester Notes).
#[tauri::command]
pub fn list_embedded_page_ids(state: State<DbState>) -> AppResult<Vec<String>> {
    let conn = state.0.lock().unwrap();
    search::list_embedded_page_ids(&conn)
}
