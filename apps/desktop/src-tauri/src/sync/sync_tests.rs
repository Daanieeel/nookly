use super::batch::{run_batch, run_query, BatchOutcome, Statement};
use super::registry::{EXCLUDED_TABLES, SYNCED_TABLES};
use crate::db::test_conn;
use rusqlite::Connection;
use serde_json::{json, Value};

fn user_tables(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name",
        )
        .unwrap();
    stmt.query_map([], |row| row.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

fn dirty(conn: &Connection) -> Vec<(String, String, i64)> {
    let mut stmt = conn
        .prepare("SELECT tbl, pk, version FROM sync_dirty ORDER BY tbl, pk")
        .unwrap();
    stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

#[test]
fn every_table_is_either_synced_or_left_out_on_purpose() {
    // A new table must be added to `SYNCED_TABLES` (with its triggers, in a new
    // migration) or to `EXCLUDED_TABLES`, so no user data is forgotten by sync.
    let conn = test_conn();
    let unclassified: Vec<String> = user_tables(&conn)
        .into_iter()
        .filter(|t| {
            !SYNCED_TABLES.iter().any(|s| s.name == t)
                && !EXCLUDED_TABLES
                    .iter()
                    .any(|e| t == e || t.starts_with(&format!("{e}_")))
        })
        .collect();
    assert_eq!(unclassified, Vec::<String>::new());
}

#[test]
fn every_synced_table_has_its_three_triggers() {
    let conn = test_conn();
    for table in SYNCED_TABLES {
        for op in ["insert", "update", "delete"] {
            let name = format!("sync_{}_{op}", table.name);
            let found: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = ?1 AND tbl_name = ?2",
                    [&name, table.name],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "missing trigger {name}");
        }
    }
}

#[test]
fn every_synced_key_and_local_column_exists() {
    let conn = test_conn();
    for table in SYNCED_TABLES {
        let columns = super::registry::columns(&conn, table.name).unwrap();
        for column in table
            .pk
            .iter()
            .chain(table.local_columns)
            .chain(table.scope.column().iter())
        {
            assert!(
                columns.iter().any(|c| c.name == *column),
                "{}.{column} does not exist",
                table.name
            );
        }
    }
}

#[test]
fn nothing_is_marked_while_sync_is_off() {
    let conn = test_conn();
    conn.execute_batch(
        "INSERT INTO task_statuses (id, name, color, doneness, position) VALUES ('x', 'X', '#fff', 0, 9)",
    )
    .unwrap();
    assert!(dirty(&conn).is_empty());
}

#[test]
fn changes_are_marked_once_sync_is_on() {
    let conn = test_conn();
    conn.execute_batch(
        "INSERT INTO sync_meta (key, value) VALUES ('enabled', '1');
         INSERT INTO task_statuses (id, name, color, doneness, position) VALUES ('x', 'X', '#fff', 0, 9);
         UPDATE task_statuses SET name = 'Y' WHERE id = 'x';
         INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s', 'S', 'red', 'now', 'now');
         INSERT INTO space_modules (space_id, module_key, added_at) VALUES ('s', 'tasks', 'now');
         DELETE FROM space_modules;",
    )
    .unwrap();
    assert_eq!(
        dirty(&conn),
        vec![
            ("space_modules".into(), r#"["s","tasks"]"#.into(), 2),
            ("spaces".into(), "s".into(), 1),
            ("task_statuses".into(), "x".into(), 2),
        ]
    );
}

#[test]
fn a_batch_runs_in_one_transaction() {
    let mut conn = test_conn();
    let outcome = run_batch(
        &mut conn,
        &[
            Statement::run(
                "INSERT INTO sync_meta (key, value) VALUES (?1, ?2)",
                vec![json!("a"), json!("1")],
            ),
            Statement::run("INSERT INTO no_such_table VALUES (1)", vec![]),
        ],
    );
    assert!(outcome.is_err());
    let rows = run_query(&conn, "SELECT * FROM sync_meta", &[]).unwrap();
    assert!(rows.is_empty(), "the first statement was rolled back");
}

#[test]
fn a_guard_that_no_longer_holds_rolls_the_batch_back() {
    let mut conn = test_conn();
    conn.execute_batch("INSERT INTO sync_meta (key, value) VALUES ('v', '2')")
        .unwrap();
    let outcome = run_batch(
        &mut conn,
        &[
            Statement::run(
                "INSERT INTO sync_meta (key, value) VALUES ('written', '1')",
                vec![],
            ),
            Statement::guard(
                "SELECT value FROM sync_meta WHERE key = 'v'",
                vec![],
                json!("1"),
            ),
        ],
    )
    .unwrap();
    assert_eq!(outcome, BatchOutcome::Stale { index: 1 });
    let rows = run_query(&conn, "SELECT key FROM sync_meta ORDER BY key", &[]).unwrap();
    assert_eq!(rows, vec![json!({ "key": "v" })]);
}

#[test]
fn a_guard_compares_null_too() {
    let mut conn = test_conn();
    let outcome = run_batch(
        &mut conn,
        &[Statement::guard(
            "SELECT (SELECT version FROM sync_dirty WHERE tbl = 'tasks' AND pk = 'x')",
            vec![],
            Value::Null,
        )],
    )
    .unwrap();
    assert_eq!(outcome, BatchOutcome::Done);
}

#[test]
fn queries_return_rows_as_objects_with_json_values() {
    let conn = test_conn();
    let rows = run_query(
        &conn,
        "SELECT id, doneness, position * 1.5 AS half, NULL AS empty FROM task_statuses WHERE id = ?1",
        &[json!("todo")],
    )
    .unwrap();
    assert_eq!(
        rows,
        vec![json!({ "id": "todo", "doneness": 0, "half": 1.5, "empty": null })]
    );
}

#[test]
fn timestamps_the_app_writes_parse_as_milliseconds() {
    // Enabling sync dates every existing row by its own `updated_at`, which SQLite has
    // to read in the exact format `db::now` writes.
    let conn = test_conn();
    let ms: i64 = conn
        .query_row(
            &format!("SELECT {} ", super::registry::millis_of("?1")),
            ["2026-10-14T12:00:00.123456789+00:00"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(ms, 1_791_979_200_123);
}

#[test]
fn a_batch_can_write_a_row_before_the_row_it_points_at() {
    // Remote rows arrive in any order; the engine defers the foreign key checks to
    // the end of its batch, when every parent is in.
    let mut conn = test_conn();
    let outcome = run_batch(
        &mut conn,
        &[
            Statement::run("PRAGMA defer_foreign_keys = ON", vec![]),
            Statement::run(
                "INSERT INTO space_modules (space_id, module_key, added_at) VALUES ('s', 'tasks', 'now')",
                vec![],
            ),
            Statement::run(
                "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s', 'S', 'red', 'now', 'now')",
                vec![],
            ),
        ],
    )
    .unwrap();
    assert_eq!(outcome, BatchOutcome::Done);
}

#[test]
fn a_batch_still_refuses_a_row_whose_parent_never_arrives() {
    let mut conn = test_conn();
    let outcome = run_batch(
        &mut conn,
        &[
            Statement::run("PRAGMA defer_foreign_keys = ON", vec![]),
            Statement::run(
                "INSERT INTO space_modules (space_id, module_key, added_at) VALUES ('gone', 'tasks', 'now')",
                vec![],
            ),
        ],
    );
    assert!(outcome.is_err());
    assert!(run_query(&conn, "SELECT * FROM space_modules", &[])
        .unwrap()
        .is_empty());
}

#[test]
fn an_edit_is_never_dated_before_the_newest_clock_seen() {
    // A device whose clock runs behind still dates an edit after the remote one it
    // has already seen, so that edit counts as the later one.
    let conn = test_conn();
    let ahead = chrono::Utc::now().timestamp_millis() + 3_600_000;
    conn.execute_batch(&format!(
        "INSERT INTO sync_meta (key, value) VALUES ('enabled', '1'), ('clock_floor', '{ahead}');
         INSERT INTO task_statuses (id, name, color, doneness, position) VALUES ('x', 'X', '#fff', 0, 9);"
    ))
    .unwrap();
    let changed_at: i64 = conn
        .query_row("SELECT changed_at FROM sync_dirty", [], |row| row.get(0))
        .unwrap();
    assert_eq!(changed_at, ahead);
}
