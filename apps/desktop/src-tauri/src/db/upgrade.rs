//! Upgrading a user's database without being able to lose it.
//!
//! Tests prove migrations are safe on the databases we have. This proves it on the
//! user's own, every time one runs. Migrations never touch the real file:
//!
//! 1. the file is copied next to itself (`nookly.db.upgrading`),
//! 2. a fingerprint of every table is taken,
//! 3. the migrations run on the copy,
//! 4. the copy is checked against the fingerprint,
//! 5. only a copy that passes replaces the original, by an atomic rename.
//!
//! A failure at any point deletes the copy and leaves the original exactly as it was.
//!
//! What is checked, after the migrations ran:
//! - SQLite's integrity check is still `ok`, and there are no foreign key violations
//!   that were not there before;
//! - no table disappeared (a table a migration renamed is followed to its new name);
//! - no table has fewer rows than before;
//! - for migrations from `STRICT_FROM` on, no existing column's content changed,
//!   except those the migration declares in `DECLARED`.
//!
//! A migration that changes or drops existing data on purpose has to say so in
//! `DECLARED`. One that does so silently makes the upgrade refuse to run, and the
//! upgrade tests (which run every version through this code) fail first.

use rusqlite::types::ValueRef;
use rusqlite::{Connection, Result as SqlResult};
use rusqlite_migration::Migrations;
use std::collections::{BTreeMap, BTreeSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// From this migration on, existing column contents are checked. Older migrations
/// legitimately rewrote and dropped columns (see `migration_upgrade_tests`), so
/// databases upgrading across them get the checks that hold for every migration.
pub(crate) const STRICT_FROM: usize = 32;

/// Existing columns a strict migration is allowed to change, by migration number:
/// `(table, column)`. Adding a column or a table is always fine.
pub(crate) const DECLARED: &[(usize, &[(&str, &str)])] = &[
    (32, &[]),
    // `course-notes` rows that point at a Course's notes page become `course-note`.
    (33, &[("relationships", "relationship_type")]),
    // The title bit joins `overridden_fields`.
    (
        34,
        &[
            ("sessions", "overridden_fields"),
            ("calendar_entries", "overridden_fields"),
        ],
    ),
    (35, &[]),
    (36, &[]),
    (37, &[]),
    (38, &[]),
    (40, &[]),
];

/// Tables a migration renamed, old name first.
pub(crate) const RENAMED: &[(&str, &str)] = &[
    ("appointments", "calendar_entries"),
    ("appointment_templates", "calendar_entry_templates"),
];

/// The upgrade did not pass its checks. The user's database was not changed.
#[derive(Debug)]
pub struct UpgradeError {
    pub problems: Vec<String>,
    pub snapshot: Option<PathBuf>,
}

impl std::fmt::Display for UpgradeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "The update to Nookly's new data format was stopped, and nothing was changed: your data is exactly as it was."
        )?;
        for problem in &self.problems {
            write!(f, "\n- {problem}")?;
        }
        if let Some(snapshot) = &self.snapshot {
            write!(
                f,
                "\nA copy from before the update is at {}.",
                snapshot.display()
            )?;
        }
        Ok(())
    }
}

impl std::error::Error for UpgradeError {}

fn stop(problems: Vec<String>, db_path: &Path) -> UpgradeError {
    UpgradeError {
        problems,
        snapshot: snapshot_of(db_path),
    }
}

/// The `nookly.db.bak-vN` copy `connect` made, if there is one.
fn snapshot_of(db_path: &Path) -> Option<PathBuf> {
    std::fs::read_dir(db_path.parent()?)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with("nookly.db.bak-v"))
        })
}

// --- fingerprint ------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TableFingerprint {
    pub rows: i64,
    /// Order independent hash of each column's values. Empty for virtual tables
    /// (the full text index), whose content is derived and rebuilt.
    pub columns: BTreeMap<String, u64>,
}

#[derive(Debug, Clone)]
pub(crate) struct Fingerprint {
    pub tables: BTreeMap<String, TableFingerprint>,
    pub integrity_ok: bool,
    pub foreign_key_violations: usize,
}

fn user_tables(conn: &Connection) -> SqlResult<(Vec<String>, BTreeSet<String>)> {
    let mut stmt = conn.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name",
    )?;
    let all: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            ))
        })?
        .collect::<Result<_, _>>()?;
    let virtual_tables: BTreeSet<String> = all
        .iter()
        .filter(|(_, sql)| sql.to_ascii_uppercase().starts_with("CREATE VIRTUAL TABLE"))
        .map(|(name, _)| name.clone())
        .collect();
    // The index of a virtual table lives in shadow tables named after it, which are an
    // implementation detail of SQLite.
    let tables = all
        .into_iter()
        .map(|(name, _)| name)
        .filter(|name| {
            !virtual_tables
                .iter()
                .any(|v| name.starts_with(&format!("{v}_")))
        })
        .collect();
    Ok((tables, virtual_tables))
}

fn hash_value(value: ValueRef) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    match value {
        ValueRef::Null => 0u8.hash(&mut hasher),
        ValueRef::Integer(i) => (1u8, i).hash(&mut hasher),
        ValueRef::Real(f) => (2u8, f.to_bits()).hash(&mut hasher),
        ValueRef::Text(t) => (3u8, t).hash(&mut hasher),
        ValueRef::Blob(b) => (4u8, b).hash(&mut hasher),
    }
    hasher.finish()
}

fn foreign_key_violations(conn: &Connection) -> SqlResult<usize> {
    let mut stmt = conn.prepare("PRAGMA foreign_key_check")?;
    let count = stmt.query_map([], |_| Ok(()))?.count();
    Ok(count)
}

pub(crate) fn fingerprint(conn: &Connection) -> SqlResult<Fingerprint> {
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    let (tables, virtual_tables) = user_tables(conn)?;
    let mut out = BTreeMap::new();
    for table in tables {
        let rows: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM \"{table}\""), [], |r| {
            r.get(0)
        })?;
        let mut columns = BTreeMap::new();
        if !virtual_tables.contains(&table) {
            let names: Vec<String> = conn
                .prepare(&format!("PRAGMA table_xinfo(\"{table}\")"))?
                .query_map([], |row| {
                    Ok((row.get::<_, String>(1)?, row.get::<_, i64>(6)?))
                })?
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                // Generated columns (hidden 2 and 3) are derived, not stored data.
                .filter(|(_, hidden)| *hidden == 0)
                .map(|(name, _)| name)
                .collect();
            if !names.is_empty() {
                let select = names
                    .iter()
                    .map(|n| format!("\"{n}\""))
                    .collect::<Vec<_>>()
                    .join(", ");
                let mut sums = vec![0u64; names.len()];
                let mut stmt = conn.prepare(&format!("SELECT {select} FROM \"{table}\""))?;
                let mut rows_iter = stmt.query([])?;
                while let Some(row) = rows_iter.next()? {
                    for (i, sum) in sums.iter_mut().enumerate() {
                        *sum = sum.wrapping_add(hash_value(row.get_ref(i)?));
                    }
                }
                columns = names.into_iter().zip(sums).collect();
            }
        }
        out.insert(table, TableFingerprint { rows, columns });
    }
    Ok(Fingerprint {
        tables: out,
        integrity_ok: integrity == "ok",
        foreign_key_violations: foreign_key_violations(conn)?,
    })
}

// --- verification -----------------------------------------------------------------------------

fn renamed(table: &str) -> &str {
    RENAMED
        .iter()
        .find(|(old, _)| *old == table)
        .map(|(_, new)| *new)
        .unwrap_or(table)
}

/// What the migrations from `from` (exclusive) to `to` (inclusive) may change.
fn declared_changes<'a>(
    declared: &'a [(usize, &'a [(&'a str, &'a str)])],
    from: usize,
    to: usize,
) -> BTreeSet<(&'a str, &'a str)> {
    declared
        .iter()
        .filter(|(version, _)| *version > from && *version <= to)
        .flat_map(|(_, changes)| changes.iter().copied())
        .collect()
}

/// Every way `after` is worse than `before`, empty when the upgrade is sound.
pub(crate) fn problems(
    before: &Fingerprint,
    after: &Fingerprint,
    from: usize,
    to: usize,
    strict_from: usize,
    declared: &[(usize, &[(&str, &str)])],
) -> Vec<String> {
    let mut found = Vec::new();
    if before.integrity_ok && !after.integrity_ok {
        found.push("the database failed SQLite's integrity check after the update".to_string());
    }
    if after.foreign_key_violations > before.foreign_key_violations {
        found.push(format!(
            "the update left {} links pointing at rows that do not exist",
            after.foreign_key_violations - before.foreign_key_violations
        ));
    }
    // Existing column contents are only compared when every pending migration is
    // strict, so a declared change always covers the whole span.
    let strict = from + 1 >= strict_from;
    let allowed = declared_changes(declared, from, to);
    for (table, was) in &before.tables {
        let name = renamed(table);
        let Some(now) = after.tables.get(name) else {
            found.push(format!("the table {table} disappeared ({} rows)", was.rows));
            continue;
        };
        if now.rows < was.rows {
            found.push(format!(
                "{table} went from {} to {} rows",
                was.rows, now.rows
            ));
        }
        if !strict {
            continue;
        }
        for (column, hash) in &was.columns {
            match now.columns.get(column) {
                None => {
                    if !allowed.contains(&(name, column.as_str())) {
                        found.push(format!("the column {name}.{column} disappeared"));
                    }
                }
                Some(new_hash) if new_hash != hash && now.rows == was.rows => {
                    if !allowed.contains(&(name, column.as_str())) {
                        found.push(format!("the contents of {name}.{column} changed"));
                    }
                }
                // Rows were added: an order independent sum no longer compares.
                Some(_) => {}
            }
        }
    }
    found
}

// --- the upgrade ------------------------------------------------------------------------------

fn work_path(db_path: &Path) -> PathBuf {
    db_path.with_file_name("nookly.db.upgrading")
}

/// Upgrades the database file at `db_path` with the app's own migrations.
pub(crate) fn run(db_path: &Path) -> Result<(), UpgradeError> {
    run_with(
        db_path,
        &super::migrations::MIGRATIONS,
        STRICT_FROM,
        DECLARED,
    )
}

/// `run` with the migrations and their declarations passed in, so tests can use
/// migrations that misbehave.
pub(crate) fn run_with(
    db_path: &Path,
    migrations: &Migrations,
    strict_from: usize,
    declared: &[(usize, &[(&str, &str)])],
) -> Result<(), UpgradeError> {
    let work = work_path(db_path);
    // A copy this old was left by a crash, not by an upgrade still running.
    if let Ok(meta) = std::fs::metadata(&work) {
        let stale = meta
            .modified()
            .ok()
            .and_then(|m| m.elapsed().ok())
            .is_some_and(|age| age.as_secs() > 3600);
        if !stale {
            return Err(stop(
                vec!["another copy of Nookly is updating the data right now, start Nookly again in a moment".into()],
                db_path,
            ));
        }
        std::fs::remove_file(&work).ok();
    }

    let result = upgrade_copy(db_path, &work, migrations, strict_from, declared);
    match result {
        Ok(()) => {
            // Atomic: the file is the old database or the new one, never half of either.
            std::fs::rename(&work, db_path).map_err(|e| {
                std::fs::remove_file(&work).ok();
                stop(
                    vec![format!(
                        "the upgraded copy could not replace the database: {e}"
                    )],
                    db_path,
                )
            })
        }
        Err(problems) => {
            std::fs::remove_file(&work).ok();
            Err(stop(problems, db_path))
        }
    }
}

fn upgrade_copy(
    db_path: &Path,
    work: &Path,
    migrations: &Migrations,
    strict_from: usize,
    declared: &[(usize, &[(&str, &str)])],
) -> Result<(), Vec<String>> {
    let fail = |what: &str, e: &dyn std::fmt::Display| vec![format!("{what}: {e}")];
    std::fs::copy(db_path, work)
        .map_err(|e| fail("could not copy the database to upgrade it", &e))?;
    let mut conn = Connection::open(work).map_err(|e| fail("could not open the copy", &e))?;
    let from: usize = migrations
        .current_version(&conn)
        .map_err(|e| fail("could not read the schema version", &e))?
        .into();
    let before = fingerprint(&conn)
        .map_err(|e| fail("could not check the database before the update", &e))?;
    migrations
        .to_latest(&mut conn)
        .map_err(|e| fail("a migration failed", &e))?;
    let to: usize = migrations
        .current_version(&conn)
        .map_err(|e| fail("could not read the schema version", &e))?
        .into();
    let after = fingerprint(&conn)
        .map_err(|e| fail("could not check the database after the update", &e))?;
    let found = problems(&before, &after, from, to, strict_from, declared);
    if !found.is_empty() {
        return Err(found);
    }
    // Close the copy completely before it replaces the original.
    conn.close()
        .map_err(|(_, e)| fail("could not close the upgraded copy", &e))?;
    Ok(())
}
