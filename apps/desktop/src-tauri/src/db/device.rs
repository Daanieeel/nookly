//! Which device this is. A file path means something on one device only, so the places a
//! reference points to are remembered per device (`reference_device_paths`).
//!
//! The id lives in a file of its own in the data folder, next to the database but never
//! inside it, and is left out of backups and restores (`backup::is_excluded`). Restoring a
//! backup on the same computer keeps the paths it knew; restoring it on another computer
//! gives that one a new id, so the paths from the first read "Not on this device" there.

use std::path::Path;
use std::sync::OnceLock;

/// The file in the data folder that holds this device's id.
pub const DEVICE_ID_FILE: &str = "device-id";

static CURRENT: OnceLock<String> = OnceLock::new();

/// The id stored in `dir`, made first if there is none. An unreadable or empty file is
/// replaced; a file that cannot be written leaves the id for this run only.
pub fn id_in(dir: &Path) -> String {
    let path = dir.join(DEVICE_ID_FILE);
    if let Some(id) = std::fs::read_to_string(&path)
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|id| !id.is_empty())
    {
        return id;
    }
    let id = super::new_id();
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(&path, &id);
    id
}

/// Remembers which device the running app is on. Called once, where the data folder is
/// known (`db::connect`); later calls change nothing.
pub fn set_current(id: &str) {
    let _ = CURRENT.set(id.to_string());
}

/// The device the running app is on. Tests all share one fixed id, so a path stored for
/// "another device" is any other string.
pub fn current() -> String {
    #[cfg(test)]
    {
        TEST_DEVICE.to_string()
    }
    #[cfg(not(test))]
    {
        CURRENT.get().cloned().unwrap_or_else(|| {
            let id = super::standalone_app_data_dir()
                .map(|dir| id_in(&dir))
                .unwrap_or_else(|_| super::new_id());
            set_current(&id);
            CURRENT.get().cloned().unwrap_or(id)
        })
    }
}

/// The device id every unit test runs as.
#[cfg(test)]
pub const TEST_DEVICE: &str = "this-device";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_id_is_made_once_and_then_kept() {
        let dir = std::env::temp_dir().join(format!("nookly-device-{}", super::super::new_id()));
        let first = id_in(&dir);
        assert!(!first.is_empty());
        assert_eq!(id_in(&dir), first);
        assert_eq!(
            std::fs::read_to_string(dir.join(DEVICE_ID_FILE)).unwrap(),
            first
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn an_empty_file_is_replaced() {
        let dir = std::env::temp_dir().join(format!("nookly-device-{}", super::super::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(DEVICE_ID_FILE), "  \n").unwrap();
        let id = id_in(&dir);
        assert!(!id.trim().is_empty());
        assert_eq!(id_in(&dir), id);
        std::fs::remove_dir_all(dir).ok();
    }
}
