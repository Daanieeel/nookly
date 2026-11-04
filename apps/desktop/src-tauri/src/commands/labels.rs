use crate::db::labels::{self, Label};
use crate::db::DbState;
use crate::error::AppResult;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn create_label(
    state: State<DbState>,
    space_id: String,
    name: String,
    color: String,
) -> AppResult<Label> {
    let conn = state.conn()?;
    labels::create_label(&conn, space_id, name, color)
}

#[tauri::command]
pub async fn list_labels(state: State<'_, DbState>, space_id: String) -> AppResult<Vec<Label>> {
    let conn = state.conn()?;
    labels::list_labels(&conn, &space_id)
}

#[tauri::command]
pub fn update_label(
    state: State<DbState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
) -> AppResult<Label> {
    let conn = state.conn()?;
    labels::update_label(&conn, &id, name, color)
}

#[tauri::command]
pub fn delete_label(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    labels::delete_label(&conn, &id)
}

#[tauri::command]
pub fn attach_label(state: State<DbState>, entity_id: String, label_id: String) -> AppResult<()> {
    let conn = state.conn()?;
    labels::attach_label(&conn, &entity_id, &label_id)
}

#[tauri::command]
pub fn detach_label(state: State<DbState>, entity_id: String, label_id: String) -> AppResult<()> {
    let conn = state.conn()?;
    labels::detach_label(&conn, &entity_id, &label_id)
}

#[tauri::command]
pub async fn list_labels_for_entity(
    state: State<'_, DbState>,
    entity_id: String,
) -> AppResult<Vec<Label>> {
    let conn = state.conn()?;
    labels::list_labels_for_entity(&conn, &entity_id)
}

#[tauri::command]
pub async fn list_entity_label_ids(
    state: State<'_, DbState>,
    space_id: String,
) -> AppResult<HashMap<String, Vec<String>>> {
    let conn = state.conn()?;
    labels::list_entity_label_ids(&conn, &space_id)
}
