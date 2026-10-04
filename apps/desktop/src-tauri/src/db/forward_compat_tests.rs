//! Forward compatibility: what happens to a user's database when the app version
//! changes underneath it, in either direction.
//!
//! * Upgrade: `migration_upgrade_tests` covers every old version reaching the
//!   latest schema without losing a row. The tests here add that the snapshot
//!   taken just before the upgrade really holds the pre-upgrade data, because
//!   that file is what a rollback restores from.
//! * Rollback: an older build opening a database a newer build already migrated
//!   must refuse to start and leave the file byte for byte as it found it. It
//!   must never "fix" it, migrate it backwards or write anything.

use super::{connect, migrations, new_id, schema_version};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-forward-compat-{}", new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn backups(dir: &Path) -> Vec<String> {
    let mut found: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|name| name.starts_with("nookly.db.bak-v"))
        .collect();
    found.sort();
    found
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

/// A space and an entity, written through the schema as it was at version 1,
/// so every later migration has real rows to carry along.
fn seed_version_1(conn: &Connection) {
    conn.execute_batch(
        "INSERT INTO spaces (id, name, color, created_at, updated_at)
             VALUES ('s1', 'Uni', '#000', '2020-01-01', '2020-01-01');
         INSERT INTO entities (id, space_id, type, title, created_at, updated_at)
             VALUES ('e1', 's1', 'note', 'Diary', '2020-01-01', '2020-01-01');",
    )
    .unwrap();
}

/// What an older build does with a database from a newer one: it opens it with
/// `connect`. The file must come back refused and unchanged, whatever the newer
/// version added (new tables, new columns, new data).
#[test]
fn a_database_from_a_newer_version_is_refused_and_left_untouched() {
    let dir = temp_dir();
    let db_path = dir.join("nookly.db");
    let newer = *migrations::MIGRATION_COUNT + 1;
    {
        let conn = connect(&dir).unwrap();
        seed_version_1(&conn);
        // What a newer release leaves behind: a bumped schema version, a table
        // and a column this build has never heard of, with user data in them.
        conn.execute_batch(&format!(
            "CREATE TABLE from_the_future (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
             INSERT INTO from_the_future VALUES ('f1', 'precious');
             ALTER TABLE spaces ADD COLUMN future_flag TEXT;
             UPDATE spaces SET future_flag = 'keep me';
             PRAGMA user_version = {newer};"
        ))
        .unwrap();
    }
    let before = std::fs::read(&db_path).unwrap();

    let refused = connect(&dir);

    assert!(
        refused.is_err(),
        "an older build opened a database from a newer version instead of refusing it"
    );
    assert_eq!(
        std::fs::read(&db_path).unwrap(),
        before,
        "refusing a newer database must not change a single byte of it"
    );
    assert!(
        backups(&dir).is_empty(),
        "no snapshot is taken of a database that was never touched: {:?}",
        backups(&dir)
    );

    let conn = Connection::open(&db_path).unwrap();
    assert_eq!(
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, usize>(0))
            .unwrap(),
        newer
    );
    assert_eq!(count(&conn, "from_the_future"), 1);
    assert_eq!(count(&conn, "spaces"), 1);
    assert_eq!(count(&conn, "entities"), 1);
    std::fs::remove_dir_all(dir).ok();
}

/// A database that is only one version ahead is just as much "from the future"
/// as one that is ten ahead: there is no tolerated margin.
#[test]
fn every_version_ahead_is_refused_not_just_far_ahead_ones() {
    for ahead in [1, 2, 10] {
        let dir = temp_dir();
        let db_path = dir.join("nookly.db");
        {
            let conn = connect(&dir).unwrap();
            seed_version_1(&conn);
            conn.execute_batch(&format!(
                "PRAGMA user_version = {}",
                *migrations::MIGRATION_COUNT + ahead
            ))
            .unwrap();
        }
        let before = std::fs::read(&db_path).unwrap();
        assert!(connect(&dir).is_err(), "{ahead} versions ahead was opened");
        assert_eq!(std::fs::read(&db_path).unwrap(), before, "{ahead} ahead");
        std::fs::remove_dir_all(dir).ok();
    }
}

/// The upgrade path an app update takes: from every older version, `connect`
/// migrates to the latest schema and first snapshots the old file. Rolling the app
/// back means restoring that snapshot, so it has to be a complete, openable copy
/// of the database as it was, at its old version.
#[test]
fn the_pre_upgrade_snapshot_holds_everything_the_old_version_had() {
    let latest = *migrations::MIGRATION_COUNT;
    for version in 1..latest {
        let dir = temp_dir();
        let db_path = dir.join("nookly.db");
        {
            let mut conn = Connection::open(&db_path).unwrap();
            migrations::MIGRATIONS.to_version(&mut conn, 1).unwrap();
            seed_version_1(&conn);
            migrations::MIGRATIONS
                .to_version(&mut conn, version)
                .unwrap();
        }

        let upgraded = connect(&dir).unwrap();
        assert_eq!(schema_version(&upgraded).unwrap(), latest, "v{version}");
        assert_eq!(count(&upgraded, "spaces"), 1, "v{version} live spaces");
        assert_eq!(count(&upgraded, "entities"), 1, "v{version} live entities");
        drop(upgraded);

        let snapshots = backups(&dir);
        assert_eq!(
            snapshots,
            vec![format!("nookly.db.bak-v{version}")],
            "v{version}"
        );
        let snapshot = Connection::open(dir.join(&snapshots[0])).unwrap();
        assert_eq!(
            schema_version(&snapshot).unwrap(),
            version,
            "the snapshot must stay at the old schema so the old build can open it"
        );
        assert_eq!(count(&snapshot, "spaces"), 1, "v{version} snapshot spaces");
        assert_eq!(
            count(&snapshot, "entities"),
            1,
            "v{version} snapshot entities"
        );
        let title: String = snapshot
            .query_row("SELECT title FROM entities WHERE id = 'e1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(title, "Diary", "v{version}");
        std::fs::remove_dir_all(dir).ok();
    }
}

/// Starting the app again on an already current database is the everyday case:
/// it must not rewrite the file or touch the snapshot a rollback depends on.
#[test]
fn reopening_a_current_database_changes_nothing_on_disk() {
    let dir = temp_dir();
    let db_path = dir.join("nookly.db");
    {
        let mut conn = Connection::open(&db_path).unwrap();
        migrations::MIGRATIONS
            .to_version(&mut conn, *migrations::MIGRATION_COUNT - 1)
            .unwrap();
    }
    drop(connect(&dir).unwrap());
    let snapshot_before = backups(&dir);
    let db_before = std::fs::read(&db_path).unwrap();

    drop(connect(&dir).unwrap());

    assert_eq!(backups(&dir), snapshot_before);
    assert_eq!(std::fs::read(&db_path).unwrap(), db_before);
    std::fs::remove_dir_all(dir).ok();
}
