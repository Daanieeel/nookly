//! Timings on a large database, run by hand:
//!
//! `cargo test --release --lib perf_baseline -- --ignored --nocapture`
//!
//! Prints how long the queries behind the biggest screens take with 20,000 entities, and the
//! plan SQLite picks for them, so a change meant to speed Nookly up can be measured instead of
//! guessed. Nothing is asserted: the numbers depend on the machine.

use super::*;
use std::time::Instant;

fn timed<T>(label: &str, f: impl FnOnce() -> T) -> T {
    let start = Instant::now();
    let value = f();
    println!(
        "{label:<34} {:>8.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    value
}

fn explain(conn: &Connection, label: &str, sql: &str) {
    let mut stmt = conn.prepare(&format!("EXPLAIN QUERY PLAN {sql}")).unwrap();
    let rows: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(3))
        .unwrap()
        .flatten()
        .collect();
    println!("{label}: {}", rows.join(" | "));
}

#[test]
#[ignore = "a benchmark, run by hand"]
fn perf_baseline() {
    let conn = test_conn();
    let spaces: Vec<_> = (0..5)
        .map(|n| test_space(&conn, &format!("Space {n}")).id)
        .collect();
    timed("create 20,000 entities", || {
        conn.execute_batch("BEGIN").unwrap();
        for n in 0..8_000 {
            let space = spaces[n % spaces.len()].clone();
            tasks::create_task(
                &conn,
                space,
                format!("Task {n}"),
                None,
                Some("2026-11-10".into()),
            )
            .unwrap();
        }
        for n in 0..12_000 {
            let space = spaces[n % spaces.len()].clone();
            entities::create_entity(&conn, space, "note".into(), format!("Note {n}"), None)
                .unwrap();
        }
        conn.execute_batch("COMMIT").unwrap();
    });
    for n in 0..60 {
        calendar::create_calendar_entry_template(
            &conn,
            spaces[n % spaces.len()].clone(),
            format!("Daily {n}"),
            "daily".into(),
            Some("09:00".into()),
            Some("10:00".into()),
            false,
            None,
            None,
            "2026-09-01".into(),
        )
        .unwrap();
    }

    timed("list_tasks_all", || {
        tasks::list_tasks_all(&conn).unwrap().len()
    });
    timed("list_entities (all, no trash)", || {
        entities::list_entities(&conn, None, false).unwrap().len()
    });
    timed("list_entities (one Space)", || {
        entities::list_entities(&conn, Some(&spaces[0]), false)
            .unwrap()
            .len()
    });
    timed("list_calendar_entries (all)", || {
        calendar::list_calendar_entries(&conn, None).unwrap().len()
    });
    timed("list_sessions_between (month)", || {
        sessions::list_sessions_between(&conn, "2026-11-01", "2026-11-30")
            .unwrap()
            .len()
    });
    timed("search 'Note 1999'", || {
        search::search(&conn, "Note 1999", None)
            .map(|r| r.len())
            .unwrap_or(0)
    });

    explain(
        &conn,
        "tasks in a Space",
        "SELECT * FROM entities e JOIN tasks t ON t.entity_id = e.id WHERE e.space_id = 'x' AND e.deleted_at IS NULL",
    );
    explain(
        &conn,
        "entities in a Space",
        "SELECT * FROM entities WHERE space_id = 'x' AND deleted_at IS NULL ORDER BY updated_at DESC",
    );
    explain(
        &conn,
        "calendar entries by date",
        "SELECT * FROM calendar_entries WHERE date BETWEEN '2026-11-01' AND '2026-11-30'",
    );
    explain(
        &conn,
        "sessions in a month",
        "SELECT * FROM sessions s WHERE date(s.date) BETWEEN date('2026-11-01') AND date('2026-11-30')",
    );
    explain(
        &conn,
        "blocks of a page",
        "SELECT * FROM blocks WHERE entity_id = 'x' ORDER BY position",
    );
    explain(
        &conn,
        "relationships of an entity",
        "SELECT * FROM relationships WHERE from_entity_id = 'x' OR to_entity_id = 'x'",
    );
}

/// One writer (the app) and one reader (the CLI) on the same file, in each journal mode:
/// how long the reader waits while the writer saves a Task per transaction.
///
/// `cargo test --release --lib perf_wal_contention -- --ignored --nocapture`
#[test]
#[ignore = "a benchmark, run by hand"]
fn perf_wal_contention() {
    for mode in ["DELETE", "WAL"] {
        let dir = std::env::temp_dir().join(format!("nookly-wal-bench-{}", new_id()));
        let writer = connect(&dir).unwrap();
        writer
            .query_row(&format!("PRAGMA journal_mode = {mode}"), [], |_| Ok(()))
            .unwrap();
        let space = test_space(&writer, "S").id;
        for n in 0..5_000 {
            tasks::create_task(&writer, space.clone(), format!("T{n}"), None, None).unwrap();
        }
        let reader = connect(&dir).unwrap();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = stop.clone();
        let read_thread = std::thread::spawn(move || {
            let mut slowest = 0.0f64;
            let mut reads = 0u32;
            let mut failed = 0u32;
            while !flag.load(std::sync::atomic::Ordering::Relaxed) {
                let start = Instant::now();
                match entities::list_entities(&reader, None, false) {
                    Ok(_) => reads += 1,
                    Err(_) => failed += 1,
                }
                slowest = slowest.max(start.elapsed().as_secs_f64() * 1000.0);
            }
            (reads, failed, slowest)
        });
        let start = Instant::now();
        for n in 0..500 {
            tasks::create_task(&writer, space.clone(), format!("W{n}"), None, None).unwrap();
        }
        let write_ms = start.elapsed().as_secs_f64() * 1000.0;
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let (reads, failed, slowest) = read_thread.join().unwrap();
        println!(
            "{mode:<7} 500 writes {write_ms:>8.0} ms | reader: {reads} reads, {failed} failed, slowest {slowest:>7.1} ms"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
