pub mod ascii_frame;
pub mod assignment_json;
pub mod assignments;
#[cfg(test)]
mod assignments_tests;
pub mod block_types;
pub mod bookmarks;
#[cfg(test)]
mod bookmarks_tests;
pub mod calendar;
pub mod common_fields;
pub mod courses;
pub mod deck_json;
pub mod decks;
#[cfg(test)]
mod decks_tests;
#[cfg(debug_assertions)]
mod dev_seed;
pub mod entities;
pub mod exams;
#[cfg(test)]
mod exams_tests;
pub mod files;
#[cfg(test)]
mod forward_compat_tests;
#[cfg(test)]
mod golden_tests;
pub mod grade_report;
#[cfg(test)]
mod grade_report_tests;
pub mod labels;
#[cfg(test)]
mod labels_tests;
pub mod local_path;
pub mod mention_keys;
#[cfg(test)]
pub(crate) mod migration_upgrade_tests;
mod migrations;
pub mod notes;
mod ocr;
mod office_text;
pub mod page_json;
#[cfg(test)]
mod perf_baseline;
pub mod portable;
pub mod recipes;
#[cfg(test)]
mod recipes_tests;
pub mod relationships;
#[cfg(test)]
mod relationships_tests;
pub mod schema;
#[cfg(test)]
mod schema_tests;
pub mod search;
mod series;
#[cfg(test)]
mod series_scenarios;
pub mod sessions;
pub mod space_modules;
pub mod spaces;
#[cfg(test)]
mod spaces_tests;
pub mod task_json;
pub mod tasks;
#[cfg(test)]
mod tasks_tests;
pub mod upgrade;
#[cfg(test)]
mod upgrade_tests;
pub mod views;

use rusqlite::Connection;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{Emitter, Manager};

pub struct DbState(pub Mutex<Connection>);

impl DbState {
    /// The one way a command takes the database lock. A lock poisoned by an
    /// earlier panic comes back as an error instead of panicking again.
    pub fn conn(&self) -> crate::error::AppResult<MutexGuard<'_, Connection>> {
        let started = std::time::Instant::now();
        let guard = self.0.lock().map_err(|_| {
            tracing::error!("the database lock is poisoned by an earlier panic");
            crate::error::AppError::Db(
                "the database lock is unavailable after an earlier failure, restart Nookly".into(),
            )
        })?;
        let waited = started.elapsed();
        if waited > crate::logging::SLOW_LOCK_WAIT {
            tracing::warn!(
                waited_ms = waited.as_millis() as u64,
                "waited a long time for the database lock"
            );
        }
        Ok(guard)
    }
}

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

/// `NotFound` unless an UPDATE touched a row, so a missing id is reported
/// instead of silently succeeding.
pub(crate) fn require_row(affected: usize, what: &str, id: &str) -> crate::error::AppResult<()> {
    if affected == 0 {
        return Err(crate::error::AppError::NotFound(format!("{what} {id}")));
    }
    Ok(())
}

/// `InvalidInput` unless `value` is one of the documented `allowed` values.
pub(crate) fn require_one_of(
    field: &str,
    value: &str,
    allowed: &[&str],
) -> crate::error::AppResult<()> {
    if !allowed.contains(&value) {
        return Err(crate::error::AppError::InvalidInput(format!(
            "{field} must be one of {}, got '{value}'",
            allowed.join(", ")
        )));
    }
    Ok(())
}

/// Runs `f` inside a SAVEPOINT, so a call that fails halfway leaves nothing
/// behind: everything it wrote is rolled back. Savepoints nest, so this is
/// safe inside a caller's own transaction or savepoint (Empty Trash, the
/// CLI's `--dry-run`).
pub(crate) fn atomically<T>(
    conn: &Connection,
    f: impl FnOnce() -> crate::error::AppResult<T>,
) -> crate::error::AppResult<T> {
    conn.execute_batch("SAVEPOINT atomically")?;
    match f() {
        Ok(value) => {
            conn.execute_batch("RELEASE atomically")?;
            Ok(value)
        }
        Err(e) => {
            conn.execute_batch("ROLLBACK TO atomically; RELEASE atomically")?;
            Err(e)
        }
    }
}

/// An in-memory database migrated to the latest schema, for unit tests.
#[cfg(test)]
pub fn test_conn() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    migrations::MIGRATIONS.to_latest(&mut conn).unwrap();
    conn
}

/// A space for unit tests.
#[cfg(test)]
pub fn test_space(conn: &Connection, name: &str) -> spaces::Space {
    spaces::create_space(conn, name.into(), None, "#000".into()).unwrap()
}

/// A database with two Spaces, for the unit tests that check an import stays in its own Space.
#[cfg(test)]
pub struct Fixture {
    pub conn: Connection,
    pub space: String,
    pub other_space: String,
}

#[cfg(test)]
pub fn fixture() -> Fixture {
    let conn = test_conn();
    let space = spaces::create_space(&conn, "A".into(), None, "#000".into()).unwrap();
    let other = spaces::create_space(&conn, "B".into(), None, "#111".into()).unwrap();
    Fixture {
        conn,
        space: space.id,
        other_space: other.id,
    }
}

/// A space with one course in it, for unit tests.
#[cfg(test)]
pub fn test_space_with_course(
    conn: &Connection,
    space_name: &str,
    course_title: &str,
) -> (spaces::Space, entities::Entity) {
    let space = test_space(conn, space_name);
    let course = courses::create_course(conn, space.id.clone(), course_title.into()).unwrap();
    (space, course)
}

/// How many migrations `conn` has run.
pub fn schema_version(conn: &Connection) -> Result<usize, rusqlite::Error> {
    Ok(migrations::MIGRATIONS
        .current_version(conn)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?
        .into())
}

/// How many migrations this build ships: the newest schema it can open.
pub fn latest_schema_version() -> usize {
    *migrations::MIGRATION_COUNT
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = resolve_app_data_dir(app.path().app_data_dir()?);
    // A restore chosen in the last session installs here, before the database opens.
    if let Err(e) = crate::backup::apply_pending_restore(&app_data_dir) {
        crate::backup::log_restore_error(&app_data_dir, &e);
    }
    // `tauri.conf.json`'s `assetProtocol.scope` only ever covers the real,
    // platform default `$APPDATA` — meaningless once `resolve_app_data_dir`
    // redirects a debug build elsewhere. Granting the resolved directory here
    // too keeps the file viewer (asset:// URLs, `convertFileSrc`) working
    // wherever files actually ended up, dev or production.
    app.asset_protocol_scope()
        .allow_directory(&app_data_dir, true)?;
    let conn = match connect(&app_data_dir) {
        Ok(conn) => conn,
        Err(e) => {
            // The upgrade did not pass its checks: the data was not changed. Say so
            // plainly instead of failing to start without a word.
            if let Some(stopped) = e.downcast_ref::<upgrade::UpgradeError>() {
                rfd::MessageDialog::new()
                    .set_level(rfd::MessageLevel::Error)
                    .set_title("Nookly could not update your data")
                    .set_description(stopped.to_string())
                    .show();
            }
            return Err(e);
        }
    };
    // A debug build (`bun run dev`) adds the sample data once.
    #[cfg(debug_assertions)]
    match dev_seed::seed_if_missing(&conn) {
        Ok(true) => tracing::info!("added sample data to the development database"),
        Ok(false) => {}
        Err(e) => {
            tracing::warn!(error = %e, "could not add sample data to the development database")
        }
    }
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
            // Never waits for a command that is using the connection: a busy tick is skipped
            // and the next one reads the same counter.
            let version = match state.0.try_lock() {
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
    let current: usize = migrations::MIGRATIONS.current_version(&conn)?.into();
    let latest = *migrations::MIGRATION_COUNT;
    if current > latest {
        tracing::error!(
            current,
            latest,
            "the database is from a newer version of Nookly, refusing to open it"
        );
    }
    if current > 0 && current < latest {
        // An existing database with migrations to run: they run on a copy that has
        // to pass its checks before it replaces the original (see `upgrade`).
        tracing::info!(from = current, to = latest, "upgrading the database");
        drop(conn);
        let started = std::time::Instant::now();
        if let Err(e) = upgrade::run(&db_path) {
            tracing::error!(error = %e, "the database upgrade did not pass its checks, the data was not changed");
            return Err(e.into());
        }
        tracing::info!(
            duration_ms = started.elapsed().as_millis() as u64,
            "database upgraded"
        );
        conn = Connection::open(&db_path)?;
    }
    // A new database migrates here. An upgraded one has nothing left, and a database
    // from a newer version is refused.
    if let Err(e) = migrations::MIGRATIONS.to_latest(&mut conn) {
        tracing::error!(error = %e, "could not bring the database to the latest version");
        return Err(e.into());
    }
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
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with("nookly.db.bak-v")
            {
                std::fs::remove_file(entry.path())?;
            }
        }
    }
    std::fs::copy(
        db_path,
        db_path.with_file_name(format!("nookly.db.bak-v{current}")),
    )?;
    tracing::info!(
        version = current,
        "kept a copy of the database before migrating"
    );
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
    Ok(resolve_app_data_dir(default_data_dir(&base, &identifier())))
}

/// The bundle identifier of the real app.
const DEFAULT_IDENTIFIER: &str = "com.nookly.app";

static IDENTIFIER: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Records the running app's bundle identifier, before anything that runs without a Tauri
/// `App` (the CLI, the crash log) looks for the data folder. A build installed next to the
/// real app has an identifier of its own, and so a data folder of its own.
pub fn set_identifier(identifier: &str) {
    let _ = IDENTIFIER.set(identifier.to_string());
}

/// The running app's bundle identifier.
pub fn identifier() -> String {
    identifier_or_default(IDENTIFIER.get().map(String::as_str))
}

fn identifier_or_default(set: Option<&str>) -> String {
    set.unwrap_or(DEFAULT_IDENTIFIER).to_string()
}

/// Where Tauri puts an app's data: the platform's data folder and the identifier.
fn default_data_dir(base: &std::path::Path, identifier: &str) -> std::path::PathBuf {
    base.join(identifier)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_data_folder_follows_the_bundle_identifier() {
        let base = std::path::Path::new("/data");
        assert_eq!(
            default_data_dir(base, "com.nookly.app"),
            base.join("com.nookly.app")
        );
        // A build installed next to the real app never shares its folder.
        assert_eq!(
            default_data_dir(base, "com.nookly.app.dev"),
            base.join("com.nookly.app.dev")
        );
    }

    #[test]
    fn without_an_identifier_it_is_the_real_apps() {
        assert_eq!(identifier_or_default(None), "com.nookly.app");
        assert_eq!(
            identifier_or_default(Some("com.nookly.app.dev")),
            "com.nookly.app.dev"
        );
    }

    fn data_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA data_version", [], |row| row.get(0))
            .unwrap()
    }

    /// A command that panicked while holding the lock poisons it. The next command
    /// gets an error back instead of panicking too (which would end the app).
    #[test]
    fn conn_returns_an_error_instead_of_panicking_when_the_lock_is_poisoned() {
        let state = std::sync::Arc::new(DbState(Mutex::new(test_conn())));
        let poisoner = state.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.0.lock().unwrap();
            panic!("a command panicked while holding the database lock");
        })
        .join();
        assert!(state.0.is_poisoned());
        let result = state.conn();
        match result {
            Err(crate::error::AppError::Db(message)) => {
                assert!(message.contains("lock"), "unexpected message: {message}");
            }
            Err(other) => panic!("expected a database error, got {other:?}"),
            Ok(_) => panic!("a poisoned lock must not hand out the connection"),
        }
    }

    /// A command that waits a long time for the database is the first sign of a freeze,
    /// so it leaves a warning in the log (with the wait, never what the command was doing).
    #[test]
    fn a_long_wait_for_the_database_lock_is_logged() {
        let state = std::sync::Arc::new(DbState(Mutex::new(test_conn())));
        let holder = state.clone();
        let (locked_tx, locked_rx) = std::sync::mpsc::channel();
        let hold = std::thread::spawn(move || {
            let _guard = holder.0.lock().unwrap();
            locked_tx.send(()).unwrap();
            std::thread::sleep(crate::logging::SLOW_LOCK_WAIT * 3);
        });
        locked_rx.recv().unwrap();
        let log = crate::logging::capture_logs(|| {
            drop(state.conn().unwrap());
        });
        hold.join().unwrap();
        assert!(log.contains("WARN"), "{log}");
        assert!(log.contains("database lock"), "{log}");
    }

    #[test]
    fn a_quick_lock_is_not_logged() {
        let state = DbState(Mutex::new(test_conn()));
        let log = crate::logging::capture_logs(|| {
            drop(state.conn().unwrap());
        });
        assert_eq!(log, "");
    }

    #[test]
    fn conn_hands_out_the_connection_when_the_lock_is_healthy() {
        let state = DbState(Mutex::new(test_conn()));
        let conn = state.conn().unwrap();
        assert_eq!(data_version(&conn), data_version(&conn));
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

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// A value passes exactly when it is one of the allowed ones, and a refusal is
        /// always `InvalidInput`.
        #[test]
        fn require_one_of_accepts_exactly_the_allowed_values(
            allowed in prop::collection::vec("[a-z_]{1,8}", 1..6),
            value in "[a-z_]{0,8}",
        ) {
            let refs: Vec<&str> = allowed.iter().map(String::as_str).collect();
            let result = require_one_of("status", &value, &refs);
            prop_assert_eq!(result.is_ok(), allowed.contains(&value));
            if let Err(e) = result {
                prop_assert!(matches!(e, crate::error::AppError::InvalidInput(_)));
            }
        }

        /// `require_row` is `NotFound` for zero rows and `Ok` for any other count.
        #[test]
        fn require_row_fails_only_for_zero_rows(affected in 0usize..5, id in "[a-z0-9-]{1,12}") {
            let result = require_row(affected, "thing", &id);
            prop_assert_eq!(result.is_ok(), affected > 0);
            if let Err(crate::error::AppError::NotFound(message)) = result {
                prop_assert!(message.contains(&id));
            }
        }
    }
}
