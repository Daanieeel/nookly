use crate::db::spaces::{self, Space, SpacePatch};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_space(
    state: State<DbState>,
    name: String,
    icon: Option<String>,
    color: String,
) -> AppResult<Space> {
    let conn = state.0.lock().unwrap();
    spaces::create_space(&conn, name, icon, color)
}

#[tauri::command]
pub fn list_spaces(state: State<DbState>) -> AppResult<Vec<Space>> {
    let conn = state.0.lock().unwrap();
    spaces::list_spaces(&conn)
}

#[tauri::command]
pub fn update_space(state: State<DbState>, id: String, patch: SpacePatch) -> AppResult<Space> {
    let conn = state.0.lock().unwrap();
    spaces::update_space(&conn, &id, patch)
}
