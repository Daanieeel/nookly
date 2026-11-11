//! Development databases of the connected platform branch, from before `main` was merged.
//!
//! On that branch the sync migrations were numbers 42 to 44. The released migrations 42
//! to 50 came later on `main`, so the sync ones moved to 51 to 53. A development
//! database that ran the old 42 to 44 says it is at 44 although it never ran the
//! released 42 to 44, which would then be skipped. No released Nookly ever had these
//! migrations; this only keeps development databases (fixtures, test accounts) usable.
//!
//! `rewind` (before migrating) recognises such a database, moves the three columns that
//! migration 52 adds out of its way (renamed, not dropped) and puts the version back to
//! 41, so the released 42 to 50 run and 51 to 53 find their tables already there.
//! `restore` (after migrating) copies the kept values back and removes the old columns.

use rusqlite::{Connection, Result as SqlResult};

/// The columns migration 52 adds, which an old development database already has.
const MOVED: &[(&str, &str)] = &[
    ("files", "blob"),
    ("recipes", "banner_blob"),
    ("bookmarks", "screenshot_blob"),
];

const KEPT_PREFIX: &str = "premerge_";

fn has_table(conn: &Connection, table: &str) -> SqlResult<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get(0),
    )
}

fn has_column(conn: &Connection, table: &str, column: &str) -> SqlResult<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)",
        [table, column],
        |row| row.get(0),
    )
}

fn version(conn: &Connection) -> SqlResult<i64> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

/// Whether this is a development database from before the merge: it has the sync
/// tables and claims 42 to 44, but not the column the released migration 42 adds.
pub(crate) fn is_premerge(conn: &Connection) -> SqlResult<bool> {
    let v = version(conn)?;
    Ok((42..=44).contains(&v)
        && has_table(conn, "sync_meta")?
        && !has_column(conn, "assignments", "ungraded")?)
}

/// Before migrating: makes an old development database migrate like any database at
/// version 41. Does nothing to any other database.
pub(crate) fn rewind(conn: &Connection) -> SqlResult<bool> {
    if !is_premerge(conn)? {
        return Ok(false);
    }
    let tx = conn.unchecked_transaction()?;
    for (table, column) in MOVED {
        if has_column(&tx, table, column)? {
            tx.execute_batch(&format!(
                "ALTER TABLE {table} RENAME COLUMN {column} TO {KEPT_PREFIX}{column};"
            ))?;
        }
    }
    tx.execute_batch("PRAGMA user_version = 41;")?;
    tx.commit()?;
    tracing::info!("a development database from before the merge was moved back to 41");
    Ok(true)
}

/// After migrating: puts the values kept by `rewind` into the columns migration 52
/// added, then removes the kept columns. Does nothing when there are none.
pub(crate) fn restore(conn: &Connection) -> SqlResult<()> {
    let tx = conn.unchecked_transaction()?;
    for (table, column) in MOVED {
        let kept = format!("{KEPT_PREFIX}{column}");
        if !has_column(&tx, table, &kept)? {
            continue;
        }
        tx.execute_batch(&format!(
            "UPDATE {table} SET {column} = {kept} WHERE {column} IS NULL;
             ALTER TABLE {table} DROP COLUMN {kept};"
        ))?;
    }
    tx.commit()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migration_upgrade_tests::{latest, migrate_to, migrate_to_latest};

    /// A database as the branch's development builds left it: released schema up to 41,
    /// then the branch's own sync migrations, numbered 42 to 44.
    fn premerge_database() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_to(&mut conn, 41);
        conn.execute_batch(
            "CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO sync_meta (key, value) VALUES ('enabled', '1');
             CREATE TABLE sync_dirty (tbl TEXT NOT NULL, pk TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, changed_at INTEGER NOT NULL, PRIMARY KEY (tbl, pk));
             ALTER TABLE files ADD COLUMN blob TEXT;
             ALTER TABLE recipes ADD COLUMN banner_blob TEXT;
             ALTER TABLE bookmarks ADD COLUMN screenshot_blob TEXT;
             INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s', 'Study', 'blue', '2026-10-01', '2026-10-01');
             INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number)
                 VALUES ('f', 's', 'file', 'Slides', '2026-10-01', '2026-10-01', 'FIL', 1);
             INSERT INTO files (entity_id, original_filename, blob) VALUES ('f', 'slides.pdf', 'abc123');
             PRAGMA user_version = 44;",
        )
        .unwrap();
        conn
    }

    #[test]
    fn leaves_released_databases_alone() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_to(&mut conn, 44);
        assert!(!rewind(&conn).unwrap());
        assert_eq!(version(&conn).unwrap(), 44);
    }

    #[test]
    fn a_development_database_gets_every_released_migration_and_keeps_its_files() {
        let mut conn = premerge_database();
        assert!(rewind(&conn).unwrap());
        migrate_to_latest(&mut conn);
        restore(&conn).unwrap();
        assert_eq!(version(&conn).unwrap() as usize, latest());
        assert!(has_column(&conn, "assignments", "ungraded").unwrap());
        assert!(has_table(&conn, "entity_references").unwrap());
        let blob: String = conn
            .query_row("SELECT blob FROM files WHERE entity_id = 'f'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(blob, "abc123");
        assert!(!has_column(&conn, "files", "premerge_blob").unwrap());
        let enabled: String = conn
            .query_row(
                "SELECT value FROM sync_meta WHERE key = 'enabled'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(enabled, "1");
    }
}
