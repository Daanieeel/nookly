use crate::db::views::{self, View};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_view(
    state: State<DbState>,
    space_id: String,
    title: String,
    module: String,
    config: String,
    icon: Option<String>,
) -> AppResult<View> {
    let conn = state.0.lock().unwrap();
    views::create_view(&conn, space_id, title, module, config, icon)
}

#[tauri::command]
pub fn list_views(
    state: State<DbState>,
    space_id: String,
    module: Option<String>,
) -> AppResult<Vec<View>> {
    let conn = state.0.lock().unwrap();
    views::list_views(&conn, &space_id, module.as_deref())
}

#[tauri::command]
pub fn reorder_views(
    state: State<DbState>,
    space_id: String,
    module: String,
    ids: Vec<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    views::reorder_views(&conn, &space_id, &module, &ids)
}

#[tauri::command]
pub fn get_view(state: State<DbState>, entity_id: String) -> AppResult<View> {
    let conn = state.0.lock().unwrap();
    views::get_view(&conn, &entity_id)
}

#[tauri::command]
pub fn update_view_config(
    state: State<DbState>,
    entity_id: String,
    config: String,
) -> AppResult<View> {
    let conn = state.0.lock().unwrap();
    views::update_view_config(&conn, &entity_id, config)
}
