//! The commands the shared sync engine runs on the desktop (see `crate::sync`).

use crate::db::DbState;
use crate::error::AppResult;
use crate::sync::batch::{self, BatchOutcome, Statement};
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub fn sync_query(state: State<DbState>, sql: String, params: Vec<Value>) -> AppResult<Vec<Value>> {
    let conn = state.0.lock().unwrap();
    batch::run_query(&conn, &sql, &params)
}

#[tauri::command]
pub fn sync_batch(state: State<DbState>, statements: Vec<Statement>) -> AppResult<BatchOutcome> {
    let mut conn = state.0.lock().unwrap();
    batch::run_batch(&mut conn, &statements)
}

#[tauri::command]
pub fn sync_reindex(state: State<DbState>, entity_ids: Vec<String>) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    crate::sync::reindex(&conn, &entity_ids)
}

#[tauri::command]
pub async fn sync_refresh_token() -> AppResult<Option<String>> {
    crate::sync::secrets::get()
}

#[tauri::command]
pub async fn sync_set_refresh_token(token: Option<String>) -> AppResult<()> {
    match token {
        Some(token) => crate::sync::secrets::set(&token),
        None => crate::sync::secrets::delete(),
    }
}
