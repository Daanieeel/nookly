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
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("nookly.db");

    let mut conn = Connection::open(db_path)?;
    migrations::MIGRATIONS.to_latest(&mut conn)?;

    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}
