use crate::db::labels::{self, Label};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_label(
    state: State<DbState>,
    space_id: String,
    name: String,
    color: String,
) -> AppResult<Label> {
    let conn = state.0.lock().unwrap();
    labels::create_label(&conn, space_id, name, color)
}

#[tauri::command]
pub fn list_labels(state: State<DbState>, space_id: String) -> AppResult<Vec<Label>> {
    let conn = state.0.lock().unwrap();
    labels::list_labels(&conn, &space_id)
}

#[tauri::command]
pub fn delete_label(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    labels::delete_label(&conn, &id)
}

#[tauri::command]
pub fn attach_label(state: State<DbState>, entity_id: String, label_id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    labels::attach_label(&conn, &entity_id, &label_id)
}

#[tauri::command]
pub fn detach_label(state: State<DbState>, entity_id: String, label_id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    labels::detach_label(&conn, &entity_id, &label_id)
}

#[tauri::command]
pub fn list_labels_for_entity(state: State<DbState>, entity_id: String) -> AppResult<Vec<Label>> {
    let conn = state.0.lock().unwrap();
    labels::list_labels_for_entity(&conn, &entity_id)
}
