//! The log file's two commands: the interface writes to it, and Settings opens its folder.

use crate::error::{AppError, AppResult};
use crate::logging;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Writes one line from the interface to the log. Never fails: logging a problem must not
/// become a second one.
#[tauri::command]
pub fn log_frontend(level: String, scope: String, message: String) {
    logging::log_frontend(&level, &scope, &message);
}

/// The folder with the log files, created when it does not exist yet.
pub fn ensure_log_dir(app_data_dir: &Path) -> AppResult<PathBuf> {
    let dir = logging::log_dir(app_data_dir);
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir)
}

/// Opens the folder with the log files in the system's file manager.
#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let dir = ensure_log_dir(&crate::db::resolve_app_data_dir(base))?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}
