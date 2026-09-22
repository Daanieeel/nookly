pub mod assignments;
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
use tauri::Manager;

pub struct DbState(pub Mutex<Connection>);

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
    Ok(())
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
