use crate::backup::{self, BackupInfo, Manifest};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(crate::db::resolve_app_data_dir(
        app.path()
            .app_data_dir()
            .map_err(|e| AppError::Io(e.to_string()))?,
    ))
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}

/// Backs up the whole app (database and every stored file) into `folder`, then
/// keeps only the newest `keep` backups there.
#[tauri::command]
pub async fn create_backup(app: AppHandle, folder: String, keep: usize) -> AppResult<BackupInfo> {
    let data_dir = data_dir(&app)?;
    blocking(move || {
        // The database lock is held only for the snapshot, not while files are zipped.
        let snapshot = {
            let state = app.state::<DbState>();
            let conn = state.0.lock().unwrap();
            backup::snapshot(&conn)?
        };
        backup::create_backup(snapshot, &data_dir, &PathBuf::from(folder), keep)
    })
    .await
}

#[tauri::command]
pub async fn list_backups(folder: String) -> AppResult<Vec<BackupInfo>> {
    blocking(move || backup::list_backups(&PathBuf::from(folder))).await
}

/// Checks a backup file end to end and reads what it holds.
#[tauri::command]
pub async fn inspect_backup(path: String) -> AppResult<Manifest> {
    blocking(move || backup::inspect_backup(&PathBuf::from(path))).await
}

/// Stages a restore. Nothing live changes until the app restarts, which the
/// caller does right after.
#[tauri::command]
pub async fn restore_backup(app: AppHandle, path: String) -> AppResult<Manifest> {
    let data_dir = data_dir(&app)?;
    blocking(move || backup::stage_restore(&data_dir, &PathBuf::from(path))).await
}
