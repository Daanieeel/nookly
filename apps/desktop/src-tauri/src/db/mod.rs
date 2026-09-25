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
    let app_data_dir = resolve_app_data_dir(app.path().app_data_dir()?);
    let conn = connect(&app_data_dir)?;
    app.manage(DbState(Mutex::new(conn)));
    watch_external_changes(app.handle().clone());
    Ok(())
}

/// Redirects the real, platform specific app data directory (`default_dir`) so
/// a developer's own testing can never touch the real app's data. Only a
/// debug build (`bun run dev`'s Tauri window, `cargo run`, a debug CLI build)
/// is ever redirected: `NOOKLY_DATA_DIR`, if set, wins (CI, scripted testing,
/// a scratch profile); otherwise it defaults to a gitignored folder inside
/// the repo. A release build always uses `default_dir` unmodified, even if
/// `NOOKLY_DATA_DIR` happens to be set in the environment, so a stray env var
/// can never redirect a real user's installed app away from their own data.
///
/// Every entry point that needs the app data directory goes through this —
/// `setup` and `standalone_app_data_dir` above, and every command that stores
/// files outside the database itself (imports, bookmark screenshots, office
/// previews) — so the database and every file path in it always agree on
/// where they live, dev or production.
pub fn resolve_app_data_dir(default_dir: std::path::PathBuf) -> std::path::PathBuf {
    if !cfg!(debug_assertions) {
        return default_dir;
    }
    if let Ok(dir) = std::env::var("NOOKLY_DATA_DIR") {
        return std::path::PathBuf::from(dir);
    }
    // `CARGO_MANIFEST_DIR` is this crate's own directory (`apps/desktop/src-tauri`),
    // baked in at compile time — meaningful only in a checkout, which is exactly
    // where every debug build runs from.
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".dev-data")
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
    let mut conn = Connection::open(&db_path)?;
    backup_before_migration(&conn, &db_path)?;
    migrations::MIGRATIONS.to_latest(&mut conn)?;
    Ok(conn)
}

/// Snapshots `nookly.db` to `nookly.db.bak-v{N}` right before a pending
/// migration would change it, so a bad migration — or the app later being
/// rolled back to a version that predates the new schema — always has one
/// known-good file to restore from. A no-op on every other launch: already at
/// the latest schema (the common case), or a brand new empty database with
/// nothing yet worth protecting. Only the newest backup is ever kept, so this
/// never costs more than ~1x the database's size.
fn backup_before_migration(
    conn: &Connection,
    db_path: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let current: usize = migrations::MIGRATIONS.current_version(conn)?.into();
    if current == 0 || current >= *migrations::MIGRATION_COUNT {
        return Ok(());
    }
    if let Some(dir) = db_path.parent() {
        for entry in std::fs::read_dir(dir)?.flatten() {
            if entry.file_name().to_string_lossy().starts_with("nookly.db.bak-v") {
                std::fs::remove_file(entry.path())?;
            }
        }
    }
    std::fs::copy(db_path, db_path.with_file_name(format!("nookly.db.bak-v{current}")))?;
    Ok(())
}

/// Resolves the app data directory without a running Tauri `App` instance —
/// used by the CLI, which never boots the GUI. Mirrors Tauri v2's own
/// `BaseDirectory::AppData` resolution (`dirs::data_dir()` + bundle
/// identifier) before `resolve_app_data_dir` redirects it, so both entry
/// points land on the identical path and the CLI reads/writes the exact same
/// database the GUI does — dev or production.
pub fn standalone_app_data_dir() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
    let base = dirs::data_dir().ok_or("could not resolve platform data directory")?;
    Ok(resolve_app_data_dir(base.join("com.nookly.app")))
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

    fn backups(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
        std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("nookly.db.bak-v")
            })
            .collect()
    }

    #[test]
    fn backs_up_only_when_a_migration_is_about_to_run() {
        let dir = std::env::temp_dir().join(format!("nookly-backup-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("nookly.db");
        let conn = Connection::open(&db_path).unwrap();

        // Brand new, unmigrated database: nothing to protect yet.
        backup_before_migration(&conn, &db_path).unwrap();
        assert!(backups(&dir).is_empty());

        // One migration still pending: back up the pre-migration state.
        let pending = *migrations::MIGRATION_COUNT - 1;
        conn.execute_batch(&format!("PRAGMA user_version = {pending}"))
            .unwrap();
        backup_before_migration(&conn, &db_path).unwrap();
        assert_eq!(backups(&dir).len(), 1);

        // Already at the latest schema: no new backup, the old one stays put.
        conn.execute_batch(&format!(
            "PRAGMA user_version = {}",
            *migrations::MIGRATION_COUNT
        ))
        .unwrap();
        backup_before_migration(&conn, &db_path).unwrap();
        assert_eq!(backups(&dir).len(), 1);

        std::fs::remove_dir_all(dir).ok();
    }
}
