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

/// A user on 0.17.7 (schema 36) could not upgrade: rows of theirs pointed at a Space
/// that no longer exists, and the Grades migration stopped on them. Through the real
/// check, from that version, with those rows: the upgrade goes through and keeps them.
#[test]
fn rows_of_a_space_that_no_longer_exists_upgrade_from_0_17_7() {
    let dir = scratch();
    let path = dir.join("nookly.db");
    {
        let mut conn = Connection::open(&path).unwrap();
        migrate_to(&mut conn, 36);
        populate(&conn);
        conn.execute_batch(
            "PRAGMA foreign_keys = OFF;
             INSERT INTO space_modules (space_id, module_key, added_at, position)
                 VALUES ('gone', 'assignments', '2026-01-01T00:00:00+00:00', 0);
             INSERT INTO entities (id, space_id, type, title, created_at, updated_at)
                 VALUES ('orphan', 'gone', 'exam', 'Final', '2026-01-01T00:00:00+00:00',
                         '2026-01-01T00:00:00+00:00');
             PRAGMA foreign_keys = ON;",
        )
        .unwrap();
    }
    run(&path).unwrap_or_else(|e| panic!("{e}"));
    let conn = Connection::open(&path).unwrap();
    assert_eq!(super::schema_version(&conn).unwrap(), latest());
    let count = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap();
    assert_eq!(
        count("SELECT COUNT(*) FROM entities WHERE id = 'orphan'"),
        1
    );
    assert_eq!(
        count("SELECT COUNT(*) FROM space_modules WHERE space_id = 'gone'"),
        1
    );
    std::fs::remove_dir_all(dir).ok();
}

// --- references (migration 50) -------------------------------------------------------------

/// Files that only point elsewhere, in the places a user's database really has them: a
/// typed path, a link never downloaded, a trashed one, each with an attachment, a mention
/// and a label, beside a stored File and a copied one that must not become references.
/// Returns `(id, source_path, url)` for the pointers.
fn add_pointer_files(conn: &Connection) -> Vec<(String, Option<String>, Option<String>)> {
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(files)")
        .unwrap()
        .query_map([], |r| r.get::<_, String>(1))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    if !columns.iter().any(|c| c == "source_path") {
        return Vec::new();
    }
    let rows = [
        (
            "ptr-path",
            None,
            Some("/Users/me/Dokumente/\u{dc}bung.pdf"),
            None,
            None,
        ),
        (
            "ptr-link",
            None,
            None,
            Some("https://example.com/a.pdf"),
            None,
        ),
        (
            "ptr-trashed",
            None,
            Some("/Users/me/old.pdf"),
            None,
            Some("2026-01-09T08:00:00+00:00"),
        ),
        (
            "copied",
            Some("files/copied.pdf"),
            Some("/Users/me/c.pdf"),
            None,
            None,
        ),
    ];
    let mut pointers = Vec::new();
    for (n, (id, local, source, url, deleted)) in rows.into_iter().enumerate() {
        conn.execute_batch(&format!(
            "CREATE TEMP TABLE one AS SELECT * FROM entities WHERE id = 'e-file-ref';
             UPDATE one SET id = '{id}', title = '{id}.pdf', key_number = {};
             INSERT INTO entities SELECT * FROM one; DROP TABLE one;",
            90000 + n
        ))
        .unwrap();
        conn.execute(
            "UPDATE entities SET deleted_at = ?1 WHERE id = ?2",
            rusqlite::params![deleted, id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO files (entity_id, local_path, url, original_filename, source_path)
             VALUES (?1, ?2, ?3, ?1, ?4)",
            rusqlite::params![id, local, url, source],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at)
             VALUES (?1, 'e-course', ?2, 'attached-file', '2026-01-01')",
            rusqlite::params![format!("attach-{id}"), id],
        )
        .unwrap();
        if local.is_none() {
            pointers.push((
                id.to_string(),
                source.map(String::from),
                url.map(String::from),
            ));
        }
    }
    pointers
}

#[test]
fn pointer_files_become_references_from_every_version_and_nothing_else_changes() {
    // Every version before the migration that adds references (the 50th) runs it.
    const REFERENCES_VERSION: usize = 50;
    for version in OLDEST_RELEASED_VERSION..REFERENCES_VERSION {
        let dir = scratch();
        let path = dir.join("nookly.db");
        let (pointers, before) = {
            let mut conn = Connection::open(&path).unwrap();
            migrate_to(&mut conn, version);
            populate(&conn);
            let pointers = add_pointer_files(&conn);
            let snapshot = |conn: &Connection| -> Vec<String> {
                let mut stmt = conn
                    .prepare(
                        "SELECT e.id || '|' || e.type || '|' || e.title || '|' || COALESCE(e.deleted_at, '') || '|' ||
                                COALESCE(f.local_path, '') || '|' || COALESCE(f.source_path, '') || '|' || COALESCE(f.url, '')
                         FROM files f JOIN entities e ON e.id = f.entity_id ORDER BY e.id",
                    )
                    .unwrap();
                stmt.query_map([], |r| r.get::<_, String>(0))
                    .unwrap()
                    .collect::<Result<_, _>>()
                    .unwrap()
            };
            let rels: i64 = conn
                .query_row("SELECT COUNT(*) FROM relationships", [], |r| r.get(0))
                .unwrap();
            (pointers, (snapshot(&conn), rels))
        };

        run(&path).unwrap_or_else(|e| panic!("upgrading from v{version}: {e}"));

        let conn = Connection::open(&path).unwrap();
        assert_healthy(&conn, &format!("upgraded from v{version}"));
        // Every pointer File has exactly one reference holding what it held.
        let referenced: i64 = conn
            .query_row("SELECT COUNT(*) FROM entity_references", [], |r| r.get(0))
            .unwrap();
        let expected = i64::try_from(pointers.len()).unwrap()
            + i64::from(version_has_source_path(&conn) && fixture_pointer_exists(&conn));
        assert_eq!(referenced, expected, "v{version}");
        for (id, source, url) in &pointers {
            let (provider, remote): (String, String) = conn
                .query_row(
                    "SELECT provider, remote_id FROM entity_references WHERE entity_id = ?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap_or_else(|e| panic!("v{version}: no reference for {id}: {e}"));
            match source {
                Some(path) => assert_eq!(
                    (provider.as_str(), remote.as_str()),
                    ("file", path.as_str())
                ),
                None => assert_eq!(
                    (provider.as_str(), Some(remote.as_str())),
                    ("link", url.as_deref())
                ),
            }
        }
        // The Files, their trash state, the attachments: all as they were.
        let after: Vec<String> = conn
            .prepare(
                "SELECT e.id || '|' || e.type || '|' || e.title || '|' || COALESCE(e.deleted_at, '') || '|' ||
                        COALESCE(f.local_path, '') || '|' || COALESCE(f.source_path, '') || '|' || COALESCE(f.url, '')
                 FROM files f JOIN entities e ON e.id = f.entity_id ORDER BY e.id",
            )
            .unwrap()
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(after, before.0, "v{version}: files changed");
        let rels: i64 = conn
            .query_row("SELECT COUNT(*) FROM relationships", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rels, before.1, "v{version}: relationships changed");
        std::fs::remove_dir_all(dir).ok();
    }
}

/// `populate` makes one File that points at a path, once the column for it exists.
fn version_has_source_path(conn: &Connection) -> bool {
    conn.prepare("SELECT source_path FROM files LIMIT 1")
        .is_ok()
}

fn fixture_pointer_exists(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM files WHERE entity_id = 'e-file-ref' AND local_path IS NULL AND source_path IS NOT NULL",
        [],
        |r| Ok(r.get::<_, i64>(0)? > 0),
    )
    .unwrap_or(false)
}

#[test]
fn an_upgrade_that_lost_or_misplaced_a_reference_is_reported() {
    // As if the migration had run and a reference went missing or pointed elsewhere.
    let mut upgraded = Connection::open_in_memory().unwrap();
    migrate_to(&mut upgraded, latest());
    assert!(super::upgrade::reference_problems(&upgraded, 49, 50).is_empty());
    upgraded
        .execute_batch(
            "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s','s','#000','t','t');
             INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number)
                 VALUES ('f1','s','file','F','t','t','FIL',1);
             INSERT INTO files (entity_id, original_filename, source_path) VALUES ('f1','F','/a/b.pdf');",
        )
        .unwrap();
    let missing = super::upgrade::reference_problems(&upgraded, 49, 50);
    assert_eq!(missing.len(), 1, "{missing:?}");
    upgraded
        .execute(
            "INSERT INTO entity_references (entity_id, provider, remote_id) VALUES ('f1','file','/elsewhere.pdf')",
            [],
        )
        .unwrap();
    let wrong = super::upgrade::reference_problems(&upgraded, 49, 50);
    assert_eq!(wrong.len(), 1, "{wrong:?}");
    // Not asked about migrations it did not run.
    assert!(super::upgrade::reference_problems(&upgraded, 50, 50).is_empty());
    assert!(super::upgrade::reference_problems(&upgraded, 0, 49).is_empty());
}
