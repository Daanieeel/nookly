use crate::db::files::{self, FileEntity};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn import_file(
    app: AppHandle,
    state: State<DbState>,
    space_id: String,
    source_path: String,
) -> AppResult<FileEntity> {
    let files_dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Db(e.to_string()))?
        .join("files");
    let conn = state.0.lock().unwrap();
    files::import_file(
        &conn,
        &files_dir,
        space_id,
        std::path::Path::new(&source_path),
    )
}

#[tauri::command]
pub fn create_file_link(
    state: State<DbState>,
    space_id: String,
    title: String,
    url: String,
) -> AppResult<FileEntity> {
    let conn = state.0.lock().unwrap();
    files::create_file_link(&conn, space_id, title, url)
}

#[tauri::command]
pub fn list_files(state: State<DbState>, space_id: String) -> AppResult<Vec<FileEntity>> {
    let conn = state.0.lock().unwrap();
    files::list_files(&conn, &space_id)
}
