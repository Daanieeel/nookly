//! Opens `settings.json` in the user's editor. The file is the one the settings store
//! plugin reads and writes, so it is looked up the way that plugin does.

use crate::error::{AppError, AppResult};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const FILE: &str = "settings.json";

/// Makes sure the file exists, with an empty object when it is new. An existing file
/// is never opened for writing, so what the user has is never replaced.
pub fn ensure_settings_file(dir: &Path) -> AppResult<PathBuf> {
    std::fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
    let path = dir.join(FILE);
    match OpenOptions::new().write(true).create_new(true).open(&path) {
        Ok(mut file) => file
            .write_all(b"{}\n")
            .map_err(|e| AppError::Io(e.to_string()))?,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(e) => return Err(AppError::Io(e.to_string())),
    }
    Ok(path)
}

/// Opens `settings.json` in the default app. Not `db::resolve_app_data_dir`: the store
/// plugin resolves its files against the platform app data folder in every build, so a
/// debug build reads the same file as the installed app.
#[tauri::command]
pub fn open_settings_file(app: AppHandle) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let path = ensure_settings_file(&dir)?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("nookly-settings-file-{}", crate::db::new_id()))
    }

    #[test]
    fn creates_an_empty_object_when_the_file_is_missing() {
        let dir = temp_dir();
        let path = ensure_settings_file(&dir).unwrap();
        assert_eq!(path, dir.join("settings.json"));
        let value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(value, serde_json::json!({}));
    }

    #[test]
    fn leaves_an_existing_file_untouched() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let content = "{\"appearance.theme\": \"dark\"}";
        std::fs::write(dir.join("settings.json"), content).unwrap();
        ensure_settings_file(&dir).unwrap();
        ensure_settings_file(&dir).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("settings.json")).unwrap(),
            content
        );
    }

    #[test]
    fn leaves_an_unreadable_file_alone_for_the_store_guard() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), b"{\"a\": ").unwrap();
        ensure_settings_file(&dir).unwrap();
        assert_eq!(
            std::fs::read(dir.join("settings.json")).unwrap(),
            b"{\"a\": "
        );
    }
}
