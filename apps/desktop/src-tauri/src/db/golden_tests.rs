//! Golden databases: real SQLite files, one per released schema version, committed
//! under `src/db/golden/`. Each is upgraded by the app's own startup path
//! (`db::connect`) and must come out whole.
//!
//! `migration_upgrade_tests` builds its databases in code, which is flexible but
//! shares the author's assumptions. A file on disk does not: it is exactly what
//! an older build wrote, so it catches a migration that works on a hand built
//! fixture and fails on real bytes.
//!
//! To add one when a version ships (the schema version is `migrations::MIGRATION_COUNT`
//! at release time), run
//!
//!     NOOKLY_GOLDEN_VERSION=<n> cargo test --lib db::golden_tests::write_golden -- --ignored
//!
//! and commit `src/db/golden/v<n>.db`. Never regenerate a file that is already
//! committed: its value is that it stays exactly as it was. `v15.db` itself was
//! written from the pinned migrations (`migrations::history` keeps the first 15
//! identical to the release), since the release binary is not in the repo.

use super::migration_upgrade_tests::{
    assert_healthy, assert_no_rows_lost, fresh_schema, latest, migrate_to, populate, schema,
    table_counts, OLDEST_RELEASED_VERSION,
};
use super::{connect, new_id, schema_version};
use rusqlite::Connection;
use std::path::PathBuf;

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/db/golden")
}

/// Every committed golden file with its schema version, oldest first.
fn goldens() -> Vec<(usize, PathBuf)> {
    let mut found: Vec<(usize, PathBuf)> = std::fs::read_dir(golden_dir())
        .unwrap()
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let version = path
                .file_stem()?
                .to_str()?
                .strip_prefix('v')?
                .parse::<usize>()
                .ok()?;
            (path.extension()? == "db").then_some((version, path))
        })
        .collect();
    found.sort();
    found
}

#[test]
fn the_oldest_released_version_has_a_golden_database() {
    let versions: Vec<usize> = goldens().into_iter().map(|(v, _)| v).collect();
    assert!(
        versions.contains(&OLDEST_RELEASED_VERSION),
        "no golden database for the oldest released schema (v{OLDEST_RELEASED_VERSION}): {versions:?}"
    );
}

#[test]
fn every_golden_database_upgrades_whole() {
    for (version, path) in goldens() {
        let context = format!("golden v{version}");
        let dir = std::env::temp_dir().join(format!("nookly-golden-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::copy(&path, dir.join("nookly.db")).unwrap();

        // The file is what an old build wrote: right version, healthy, not empty.
        let before = Connection::open(dir.join("nookly.db")).unwrap();
        assert_eq!(schema_version(&before).unwrap(), version, "{context}");
        assert_healthy(&before, &format!("{context} as shipped"));
        let counts_before = table_counts(&before);
        assert!(
            counts_before.values().sum::<i64>() > 50,
            "{context} holds almost nothing, so it proves almost nothing"
        );
        drop(before);

        let upgraded = connect(&dir).unwrap();
        assert_eq!(schema_version(&upgraded).unwrap(), latest(), "{context}");
        assert_healthy(&upgraded, &format!("{context} upgraded"));
        assert_no_rows_lost(&counts_before, &table_counts(&upgraded), &context);
        assert_eq!(
            schema(&upgraded),
            fresh_schema(),
            "{context}: the upgraded schema differs from a fresh install"
        );
        drop(upgraded);

        // The snapshot taken before the upgrade is the file as it was, still usable by
        // the build it came from.
        let snapshot = Connection::open(dir.join(format!("nookly.db.bak-v{version}"))).unwrap();
        assert_eq!(schema_version(&snapshot).unwrap(), version, "{context}");
        assert_eq!(table_counts(&snapshot), counts_before, "{context} snapshot");
        std::fs::remove_dir_all(dir).ok();
    }
}

#[test]
fn a_second_start_changes_nothing_in_a_golden_database() {
    for (version, path) in goldens() {
        let dir = std::env::temp_dir().join(format!("nookly-golden-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::copy(&path, dir.join("nookly.db")).unwrap();
        drop(connect(&dir).unwrap());
        let once = table_counts(&connect(&dir).unwrap());
        let twice = table_counts(&connect(&dir).unwrap());
        assert_eq!(once, twice, "golden v{version}");
        std::fs::remove_dir_all(dir).ok();
    }
}

/// Writes `golden/v<n>.db`: the schema at version `n` holding the standard fixture.
#[test]
#[ignore = "writes a golden file, run it once per release"]
fn write_golden() {
    let version: usize = std::env::var("NOOKLY_GOLDEN_VERSION")
        .expect("set NOOKLY_GOLDEN_VERSION=<schema version>")
        .parse()
        .unwrap();
    let path = golden_dir().join(format!("v{version}.db"));
    assert!(
        !path.exists(),
        "{} already exists. A golden file is written once, by the release it names.",
        path.display()
    );
    let mut conn = Connection::open(&path).unwrap();
    migrate_to(&mut conn, version);
    populate(&conn);
    conn.execute_batch("VACUUM").unwrap();
}
