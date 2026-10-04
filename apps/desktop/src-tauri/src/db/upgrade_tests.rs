//! The upgrade check (`db::upgrade`): it must stop every kind of data loss, leave the
//! original file untouched when it stops, and never stop a sound upgrade.

use super::migration_upgrade_tests::{
    assert_healthy, latest, migrate_to, populate, OLDEST_RELEASED_VERSION,
};
use super::new_id;
use super::upgrade::{fingerprint, problems, run, run_with, UpgradeError};
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::path::{Path, PathBuf};

fn scratch() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-upgrade-{}", new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A database at version 1 of `steps`, holding two people and a pet.
fn database(dir: &Path, steps: &[&'static str]) -> PathBuf {
    let path = dir.join("nookly.db");
    let mut conn = Connection::open(&path).unwrap();
    migrations_of(steps).to_version(&mut conn, 1).unwrap();
    conn.execute_batch(
        "INSERT INTO person (id, name) VALUES (1, 'Ada'), (2, 'Grace');
         INSERT INTO pet (id, person_id, name) VALUES (1, 1, 'Byte');",
    )
    .unwrap();
    path
}

fn migrations_of(steps: &[&'static str]) -> Migrations<'static> {
    Migrations::new(steps.iter().map(|s| M::up(s)).collect())
}

const START: &str = "CREATE TABLE person (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
                     CREATE TABLE pet (id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES person(id), name TEXT);";

fn upgrade(
    path: &Path,
    steps: &[&'static str],
    strict_from: usize,
    declared: &[(usize, &[(&str, &str)])],
) -> Result<(), UpgradeError> {
    run_with(path, &migrations_of(steps), strict_from, declared)
}

/// The upgrade stopped, the database file is byte for byte what it was, and no
/// working copy is left behind.
fn assert_untouched(path: &Path, before: &[u8], result: &Result<(), UpgradeError>) {
    assert!(result.is_err(), "the upgrade was not stopped");
    assert_eq!(std::fs::read(path).unwrap(), before, "the original changed");
    assert!(
        !path.with_file_name("nookly.db.upgrading").exists(),
        "the working copy was left behind"
    );
}

#[test]
fn a_sound_upgrade_replaces_the_database_with_the_upgraded_copy() {
    let dir = scratch();
    let steps = [
        START,
        "ALTER TABLE pet ADD COLUMN species TEXT; CREATE TABLE toy (id INTEGER);",
    ];
    let path = database(&dir, &steps);
    upgrade(&path, &steps, 1, &[]).unwrap();

    let conn = Connection::open(&path).unwrap();
    assert_eq!(
        conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    let people: i64 = conn
        .query_row("SELECT COUNT(*) FROM person", [], |r| r.get(0))
        .unwrap();
    assert_eq!(people, 2);
    assert!(!dir.join("nookly.db.upgrading").exists());
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_migration_that_deletes_rows_is_stopped_and_the_file_is_untouched() {
    let dir = scratch();
    let steps = [START, "DELETE FROM person WHERE id = 2;"];
    let path = database(&dir, &steps);
    let before = std::fs::read(&path).unwrap();
    let result = upgrade(&path, &steps, 1, &[]);
    assert_untouched(&path, &before, &result);
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("person went from 2 to 1 rows"));
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_migration_that_drops_a_table_is_stopped() {
    let dir = scratch();
    let steps = [START, "DROP TABLE pet;"];
    let path = database(&dir, &steps);
    let before = std::fs::read(&path).unwrap();
    let result = upgrade(&path, &steps, 1, &[]);
    assert_untouched(&path, &before, &result);
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("the table pet disappeared"));
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_migration_that_fails_midway_leaves_the_file_untouched() {
    let dir = scratch();
    let steps = [
        START,
        "ALTER TABLE person ADD COLUMN age INTEGER; THIS IS NOT SQL;",
    ];
    let path = database(&dir, &steps);
    let before = std::fs::read(&path).unwrap();
    let result = upgrade(&path, &steps, 1, &[]);
    assert_untouched(&path, &before, &result);
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_migration_that_rewrites_existing_values_must_declare_it() {
    let dir = scratch();
    let steps = [START, "UPDATE person SET name = upper(name);"];
    let path = database(&dir, &steps);
    let before = std::fs::read(&path).unwrap();

    let silent = upgrade(&path, &steps, 1, &[]);
    assert_untouched(&path, &before, &silent);
    assert!(silent
        .unwrap_err()
        .to_string()
        .contains("the contents of person.name changed"));

    // The same migration with its change declared goes through.
    upgrade(&path, &steps, 1, &[(2, &[("person", "name")])]).unwrap();
    let conn = Connection::open(&path).unwrap();
    let name: String = conn
        .query_row("SELECT name FROM person WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(name, "ADA");
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn column_contents_are_not_compared_before_strict_from() {
    let dir = scratch();
    let steps = [START, "UPDATE person SET name = upper(name);"];
    let path = database(&dir, &steps);
    // Older migrations legitimately rewrite values, so only counts and integrity apply.
    upgrade(&path, &steps, 10, &[]).unwrap();
    std::fs::remove_dir_all(dir).ok();
}

/// SQLite refuses most migrations that would dangle a link while they run. The check is
/// for the ones that get past that (a table rebuilt with foreign keys off), so it is
/// tested on fingerprints directly.
#[test]
fn a_link_the_upgrade_left_dangling_is_reported_but_an_old_one_is_not() {
    let make = |dangling: bool| {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = OFF;
             CREATE TABLE person (id INTEGER PRIMARY KEY);
             CREATE TABLE pet (id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES person(id));
             INSERT INTO person VALUES (1);
             INSERT INTO pet VALUES (1, 1);",
        )
        .unwrap();
        if dangling {
            conn.execute_batch("INSERT INTO pet VALUES (2, 99);")
                .unwrap();
        }
        fingerprint(&conn).unwrap()
    };
    let (clean, dangling) = (make(false), make(true));
    let found = problems(&clean, &dangling, 1, 2, 1, &[]);
    assert!(
        found
            .iter()
            .any(|p| p.contains("links pointing at rows that do not exist")),
        "{found:?}"
    );
    // Already dangling before the upgrade: not the upgrade's doing, so not a reason to stop.
    assert!(problems(&dangling, &dangling, 1, 2, 1, &[]).is_empty());
}

#[test]
fn a_known_renamed_table_is_followed_and_its_rows_are_still_counted() {
    let table = |name: &str, rows: usize| {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(&format!("CREATE TABLE {name} (x INTEGER);"))
            .unwrap();
        for i in 0..rows {
            conn.execute(&format!("INSERT INTO {name} VALUES (?1)"), [i as i64])
                .unwrap();
        }
        fingerprint(&conn).unwrap()
    };
    let before = table("appointments", 3);
    assert!(problems(&before, &table("calendar_entries", 3), 1, 2, 1, &[]).is_empty());
    let lost = problems(&before, &table("calendar_entries", 2), 1, 2, 1, &[]);
    assert!(
        lost.iter().any(|p| p.contains("went from 3 to 2 rows")),
        "{lost:?}"
    );
    let gone = problems(&before, &table("something_else", 3), 1, 2, 1, &[]);
    assert!(
        gone.iter()
            .any(|p| p.contains("the table appointments disappeared")),
        "{gone:?}"
    );
}

#[test]
fn an_upgrade_already_running_is_not_disturbed() {
    let dir = scratch();
    let steps = [START, "ALTER TABLE pet ADD COLUMN species TEXT;"];
    let path = database(&dir, &steps);
    let other = dir.join("nookly.db.upgrading");
    std::fs::write(&other, b"someone else's copy").unwrap();
    let result = upgrade(&path, &steps, 1, &[]);
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("another copy of Nookly"));
    assert_eq!(std::fs::read(&other).unwrap(), b"someone else's copy");
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_working_copy_left_by_a_crash_is_cleared_and_the_upgrade_runs() {
    let dir = scratch();
    let steps = [START, "ALTER TABLE pet ADD COLUMN species TEXT;"];
    let path = database(&dir, &steps);
    let old = dir.join("nookly.db.upgrading");
    std::fs::write(&old, b"left by a crash").unwrap();
    let two_hours_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(7200);
    std::fs::File::options()
        .write(true)
        .open(&old)
        .unwrap()
        .set_modified(two_hours_ago)
        .unwrap();
    upgrade(&path, &steps, 1, &[]).unwrap();
    assert!(!old.exists());
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_fingerprint_sees_content_not_order() {
    let a = Connection::open_in_memory().unwrap();
    let b = Connection::open_in_memory().unwrap();
    for conn in [&a, &b] {
        conn.execute_batch("CREATE TABLE t (x TEXT, y INTEGER);")
            .unwrap();
    }
    a.execute_batch("INSERT INTO t VALUES ('p', 1), ('q', 2);")
        .unwrap();
    b.execute_batch("INSERT INTO t VALUES ('q', 2), ('p', 1);")
        .unwrap();
    assert_eq!(
        fingerprint(&a).unwrap().tables["t"],
        fingerprint(&b).unwrap().tables["t"]
    );
    b.execute_batch("UPDATE t SET y = 3 WHERE x = 'q';")
        .unwrap();
    assert_ne!(
        fingerprint(&a).unwrap().tables["t"],
        fingerprint(&b).unwrap().tables["t"]
    );
}

#[test]
fn identical_databases_have_no_problems() {
    let a = Connection::open_in_memory().unwrap();
    a.execute_batch("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('p');")
        .unwrap();
    let fp = fingerprint(&a).unwrap();
    assert!(problems(&fp, &fp, 1, 2, 1, &[]).is_empty());
}

/// The standard fixture has no data for the latest migrations to change, which would let
/// a missing declaration slip through. This adds some: a `course-notes` link to a
/// Course's notes page (retagged to `course-note`), and an occurrence whose title
/// differs from its series (gets the title override bit).
fn add_data_the_late_migrations_act_on(conn: &Connection) {
    let one = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, String>(0)).ok();
    if let Some(course) = one("SELECT id FROM entities WHERE type = 'course' LIMIT 1") {
        // A copy of an existing entity row, as a notes page: whatever columns this
        // version has come along.
        conn.execute_batch(
            "CREATE TEMP TABLE page AS SELECT * FROM entities LIMIT 1;
             UPDATE page SET id = 'late-notes-page', type = 'course_notes';",
        )
        .unwrap();
        // Entity keys are unique per prefix and number, where the version has them.
        conn.execute_batch("UPDATE page SET key_number = 99999;")
            .ok();
        conn.execute_batch("INSERT INTO entities SELECT * FROM page; DROP TABLE page;")
            .unwrap();
        conn.execute(
            "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at)
             VALUES ('late-notes-link', ?1, 'late-notes-page', 'course-notes', '2026-01-01')",
            [course],
        )
        .unwrap();
    }
    for (occurrences, templates) in [
        ("sessions", "session_templates"),
        ("calendar_entries", "calendar_entry_templates"),
    ] {
        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [occurrences],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap();
        if !table_exists
            || conn
                .prepare(&format!("SELECT template_id FROM {occurrences} LIMIT 1"))
                .is_err()
        {
            continue;
        }
        let _ = templates;
        conn.execute_batch(&format!(
            "UPDATE entities SET title = 'Renamed on its own'
             WHERE id = (SELECT entity_id FROM {occurrences} WHERE template_id IS NOT NULL LIMIT 1);"
        ))
        .unwrap();
    }
}

/// The real migrations on populated databases, from every schema version, through
/// the real check. A migration that changes existing data without declaring it in
/// `upgrade::DECLARED` fails here before it can fail on a user's machine.
#[test]
fn every_real_version_upgrades_through_the_check() {
    for version in OLDEST_RELEASED_VERSION..latest() {
        let dir = scratch();
        let path = dir.join("nookly.db");
        {
            let mut conn = Connection::open(&path).unwrap();
            migrate_to(&mut conn, version);
            populate(&conn);
            add_data_the_late_migrations_act_on(&conn);
        }
        run(&path).unwrap_or_else(|e| panic!("upgrading from v{version}: {e}"));
        let conn = Connection::open(&path).unwrap();
        assert_healthy(&conn, &format!("upgraded from v{version}"));
        assert_eq!(
            super::schema_version(&conn).unwrap(),
            latest(),
            "v{version}"
        );
        std::fs::remove_dir_all(dir).ok();
    }
}
