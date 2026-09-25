pub mod ascii_frame;
pub mod assignments;
pub mod block_types;
pub mod bookmarks;
pub mod courses;
pub mod decks;
pub mod entities;
pub mod exams;
pub mod files;
pub mod labels;
mod migrations;
pub mod notes;
pub mod relationships;
pub mod schema;
pub mod search;
pub mod sessions;
pub mod space_modules;
pub mod spaces;
pub mod study_blocks;
pub mod tasks;

use rusqlite::Connection;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};

pub struct DbState(pub Mutex<Connection>);

/// Emitted when another process (the CLI, usually an agent) committed to the
/// database, so the frontend refetches instead of showing stale data.
pub const EXTERNAL_CHANGE_EVENT: &str = "db:external-change";

const EXTERNAL_CHANGE_POLL: Duration = Duration::from_millis(500);

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    let conn = connect(&app_data_dir)?;
    app.manage(DbState(Mutex::new(conn)));
    watch_external_changes(app.handle().clone());
    Ok(())
}

/// SQLite bumps `PRAGMA data_version` on a connection only when a *different*
/// connection commits, so polling it on the app's own connection detects exactly
/// the writes the GUI didn't make itself, with no change feed or file watcher.
fn watch_external_changes(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<i64> = None;
        loop {
            std::thread::sleep(EXTERNAL_CHANGE_POLL);
            let state = app.state::<DbState>();
            let version = match state.0.lock() {
                Ok(conn) => conn
                    .query_row("PRAGMA data_version", [], |row| row.get::<_, i64>(0))
                    .ok(),
                Err(_) => None,
            };
            let Some(version) = version else { continue };
            if last.is_some_and(|prev| prev != version) {
                let _ = app.emit(EXTERNAL_CHANGE_EVENT, ());
            }
            last = Some(version);
        }
    });
}

/// Opens (creating if needed) the same `nookly.db` the GUI uses, and brings it
/// to the latest schema. Shared by both the Tauri app (`setup`, above) and the
/// CLI (`crate::cli`), so there is exactly one code path that decides where
/// the database lives and how it's migrated.
pub fn connect(app_data_dir: &std::path::Path) -> Result<Connection, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(app_data_dir)?;
    let db_path = app_data_dir.join("nookly.db");
    let mut conn = Connection::open(db_path)?;
    migrations::MIGRATIONS.to_latest(&mut conn)?;
    Ok(conn)
}

/// Resolves the app data directory without a running Tauri `App` instance —
/// used by the CLI, which never boots the GUI. Mirrors Tauri v2's own
/// `BaseDirectory::AppData` resolution (`dirs::data_dir()` + bundle
/// identifier), so both entry points land on the identical path and the CLI
/// reads/writes the exact same database the GUI does.
///
/// `NOOKLY_DATA_DIR`, if set, overrides this — lets the CLI be pointed at an
/// isolated database (CI, scripted testing, a scratch profile) without
/// touching the real one.
pub fn standalone_app_data_dir() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    if let Ok(dir) = std::env::var("NOOKLY_DATA_DIR") {
        return Ok(std::path::PathBuf::from(dir));
    }
    let base = dirs::data_dir().ok_or("could not resolve platform data directory")?;
    Ok(base.join("com.nookly.app"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA data_version", [], |row| row.get(0))
            .unwrap()
    }

    /// `watch_external_changes` relies on this: the app's own writes leave its
    /// `data_version` alone, another connection's (the CLI's) change it.
    #[test]
    fn data_version_changes_only_for_other_connections() {
        let dir = std::env::temp_dir().join(format!("nookly-data-version-{}", new_id()));
        let app = connect(&dir).unwrap();
        let cli = connect(&dir).unwrap();
        let start = data_version(&app);

        spaces::create_space(&app, "Own".into(), None, "#000".into()).unwrap();
        assert_eq!(data_version(&app), start);

        spaces::create_space(&cli, "External".into(), None, "#000".into()).unwrap();
        assert_ne!(data_version(&app), start);

        std::fs::remove_dir_all(dir).ok();
    }
}
