//! The sync account's session token: in the OS keychain for a release build. A
//! debug build keeps it in a file in its own data folder (`.dev-data`), so it never
//! touches the installed app's keychain entry and never asks for the keychain
//! password after every rebuild.

use crate::error::{AppError, AppResult};

pub(crate) const SERVICE: &str = "nookly-sync";
const USER: &str = "refresh-token";
const DEV_FILE: &str = "sync-token.dev";

fn dev_path() -> AppResult<std::path::PathBuf> {
    let dir = crate::db::standalone_app_data_dir().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join(DEV_FILE))
}

pub fn set(token: &str) -> AppResult<()> {
    if cfg!(debug_assertions) {
        let path = dev_path()?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
        }
        return std::fs::write(path, token).map_err(|e| AppError::Io(e.to_string()));
    }
    crate::keychain::set(SERVICE, USER, token)
}

pub fn get() -> AppResult<Option<String>> {
    if cfg!(debug_assertions) {
        return match std::fs::read_to_string(dev_path()?) {
            Ok(token) if !token.trim().is_empty() => Ok(Some(token.trim().to_string())),
            Ok(_) => Ok(None),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(AppError::Io(e.to_string())),
        };
    }
    crate::keychain::get(SERVICE, USER)
}

pub fn delete() -> AppResult<()> {
    if cfg!(debug_assertions) {
        return match std::fs::remove_file(dev_path()?) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(AppError::Io(e.to_string())),
            _ => Ok(()),
        };
    }
    crate::keychain::delete(SERVICE, USER)
}
