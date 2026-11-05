//! The "Nookly closed unexpectedly" dialog reads its report here (`crash_report.rs`).

use crate::crash_report::{self, CrashReport};
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(crate::db::resolve_app_data_dir(base))
}

/// The newest crash the person has not dismissed yet, or none.
#[tauri::command]
pub fn latest_crash_report(app: AppHandle) -> AppResult<Option<CrashReport>> {
    Ok(crash_report::latest_unseen(
        &data_dir(&app)?,
        env!("CARGO_PKG_VERSION"),
    ))
}

/// Marks the crash at `occurred_at` (and every older one) as dealt with.
#[tauri::command]
pub fn dismiss_crash_report(app: AppHandle, occurred_at: String) -> AppResult<()> {
    crash_report::dismiss(&data_dir(&app)?, &occurred_at)
}
