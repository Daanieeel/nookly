use crate::db::spaces::{self, Space, SpacePatch};
use crate::db::{space_modules, DbState};
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

#[tauri::command]
pub fn delete_space(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    spaces::delete_space(&conn, &id)
}

#[tauri::command]
pub fn reorder_spaces(state: State<DbState>, ordered_ids: Vec<String>) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    spaces::reorder_spaces(&conn, ordered_ids)
}

#[tauri::command]
pub fn list_space_modules(state: State<DbState>, space_id: String) -> AppResult<Vec<String>> {
    let conn = state.0.lock().unwrap();
    space_modules::list_space_modules(&conn, &space_id)
}

#[tauri::command]
pub fn add_space_module(
    state: State<DbState>,
    space_id: String,
    module_key: String,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    space_modules::add_space_module(&conn, &space_id, &module_key)
}

#[tauri::command]
pub fn reorder_space_modules(
    state: State<DbState>,
    space_id: String,
    ordered_keys: Vec<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    space_modules::reorder_space_modules(&conn, &space_id, ordered_keys)
}
