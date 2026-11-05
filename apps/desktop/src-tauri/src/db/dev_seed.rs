//! Sample data for `bun run dev`. A debug build adds two Spaces of believable content, so
//! every screen has something to show. It only ever adds, once: a database that already
//! holds the sample Space is left alone, and nothing already there is changed. A release
//! build never compiles this in.
//!
//! Set `NOOKLY_NO_SEED=1` to start without it.

use chrono::{Duration, Local};
use rusqlite::Connection;

use crate::db::block_types::BlockAttrs;
use crate::db::{
    assignments, bookmarks, courses, entities, exams, labels, notes, relationships, spaces, tasks,
};
use crate::error::AppResult;

/// Name of the first sample Space, which marks a database as already holding the sample data.
const SAMPLE_SPACE: &str = "University";

/// Adds the sample data unless the database already holds it. Returns whether it did.
pub fn seed_if_missing(conn: &Connection) -> AppResult<bool> {
    if std::env::var_os("NOOKLY_NO_SEED").is_some() {
        return Ok(false);
    }
    run(conn)
}

/// Only ever adds: nothing that is already in the database is changed.
fn run(conn: &Connection) -> AppResult<bool> {
    if spaces::list_spaces(conn)?
        .iter()
        .any(|s| s.name == SAMPLE_SPACE)
    {
        return Ok(false);
    }
    crate::db::atomically(conn, || seed(conn))?;
    Ok(true)
}

/// A date `days` from today, as the app stores dates.
fn day(days: i64) -> String {
    (Local::now().date_naive() + Duration::days(days))
        .format("%Y-%m-%d")
        .to_string()
}

fn link(conn: &Connection, from: &str, to: &str, kind: &str) -> AppResult<()> {
    relationships::create_relationship(conn, from.into(), to.into(), kind.into(), None, None)?;
    Ok(())
}

/// A page's body: a heading, then one paragraph per line of `lines`.
fn write_page(conn: &Connection, page_id: &str, heading: &str, lines: &[&str]) -> AppResult<()> {
    let block = |block_type: &str, content: &str| {
        notes::create_block_with_attrs(
            conn,
            page_id,
            block_type.into(),
            content.into(),
            None,
            None,
            None,
            BlockAttrs::new(),
        )
    };
    block("heading1", heading)?;
    for line in lines {
        block("paragraph", line)?;
    }
    Ok(())
}

fn seed(conn: &Connection) -> AppResult<()> {
    let uni = spaces::create_space(conn, SAMPLE_SPACE.into(), None, "#6366f1".into())?.id;
    let home = spaces::create_space(conn, "Home".into(), None, "#10b981".into())?.id;

    // University: a semester with two courses, their exams and assignments.
    courses::create_semester(
        conn,
        uni.clone(),
        "Autumn 2026".into(),
        Some(day(-45)),
        Some(day(75)),
        None,
        Some(2026),
    )?;
    let algebra = courses::create_course(conn, uni.clone(), "Linear Algebra".into())?;
    let algorithms = courses::create_course(conn, uni.clone(), "Algorithms".into())?;
    let midterm = exams::create_exam(
        conn,
        uni.clone(),
        "Linear Algebra midterm".into(),
        algebra.id.clone(),
        Some(day(9)),
        Some(0.4),
    )?;
    exams::create_exam(
        conn,
        uni.clone(),
        "Algorithms final".into(),
        algorithms.id.clone(),
        Some(day(41)),
        Some(0.6),
    )?;
    let problem_set = assignments::create_assignment(
        conn,
        uni.clone(),
        "Problem set 3".into(),
        algebra.id.clone(),
        Some(day(4)),
    )?;
    assignments::update_assignment_status(
        conn,
        &problem_set.entity.id,
        "in_progress".into(),
        None,
    )?;
    assignments::create_assignment(
        conn,
        uni.clone(),
        "Graph project".into(),
        algorithms.id.clone(),
        Some(day(16)),
    )?;

    let study = labels::create_label(conn, uni.clone(), "Study".into(), "#3b82f6".into())?;
    let admin = labels::create_label(conn, uni.clone(), "Admin".into(), "#f59e0b".into())?;

    let review = tasks::create_task(
        conn,
        uni.clone(),
        "Review eigenvalue lecture".into(),
        None,
        Some(day(2)),
    )?;
    tasks::update_task_status(conn, &review.entity.id, "in_progress")?;
    labels::attach_label(conn, &review.entity.id, &study.id)?;
    let practice = tasks::create_task(
        conn,
        uni.clone(),
        "Practice past midterm questions".into(),
        None,
        Some(day(7)),
    )?;
    labels::attach_label(conn, &practice.entity.id, &study.id)?;
    let room = tasks::create_task(
        conn,
        uni.clone(),
        "Book a study room".into(),
        None,
        Some(day(1)),
    )?;
    labels::attach_label(conn, &room.entity.id, &admin.id)?;
    let enrol = tasks::create_task(
        conn,
        uni.clone(),
        "Confirm exam registration".into(),
        None,
        Some(day(-2)),
    )?;
    labels::attach_label(conn, &enrol.entity.id, &admin.id)?;
    tasks::update_task_status(conn, &enrol.entity.id, "done")?;
    let slides = tasks::create_task(
        conn,
        uni.clone(),
        "Print the algorithm slides".into(),
        None,
        None,
    )?;
    tasks::create_subtask(conn, slides.entity.id.clone(), "Find a printer".into())?;

    let cheat = notes::create_page(conn, uni.clone(), "note", "Eigenvalues cheat sheet".into())?;
    write_page(
        conn,
        &cheat.id,
        "Eigenvalues cheat sheet",
        &[
            "An eigenvector keeps its direction when the matrix is applied: Av = λv.",
            "Find the eigenvalues from det(A − λI) = 0, then solve (A − λI)v = 0 for each one.",
            "The trace is the sum of the eigenvalues, the determinant is their product.",
        ],
    )?;
    let complexity = notes::create_page(conn, uni.clone(), "note", "Complexity notes".into())?;
    write_page(
        conn,
        &complexity.id,
        "Complexity notes",
        &[
            "Big O drops constants and lower terms: 3n² + 5n is O(n²).",
            "Binary search is O(log n), merge sort is O(n log n), Dijkstra with a heap is O((V + E) log V).",
        ],
    )?;
    let jot = notes::create_page(conn, uni.clone(), "jot", "Ask about office hours".into())?;
    write_page(
        conn,
        &jot.id,
        "Ask about office hours",
        &["Is Thursday still free for the midterm questions?"],
    )?;
    let wiki = bookmarks::create_bookmark(
        conn,
        uni.clone(),
        "https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors".into(),
    )?;

    // Home: errands and a weekly plan that reaches across to the University Space.
    let errands = labels::create_label(conn, home.clone(), "Errands".into(), "#ef4444".into())?;
    let trip = tasks::create_task(
        conn,
        home.clone(),
        "Plan the weekend trip".into(),
        None,
        Some(day(5)),
    )?;
    let passport = tasks::create_task(
        conn,
        home.clone(),
        "Renew passport".into(),
        None,
        Some(day(14)),
    )?;
    labels::attach_label(conn, &passport.entity.id, &errands.id)?;
    let groceries = tasks::create_task(
        conn,
        home.clone(),
        "Buy groceries".into(),
        None,
        Some(day(0)),
    )?;
    labels::attach_label(conn, &groceries.entity.id, &errands.id)?;
    let week = notes::create_page(conn, home.clone(), "note", "Weekly planning".into())?;
    write_page(
        conn,
        &week.id,
        "Weekly planning",
        &[
            "Mornings for studying, afternoons for errands.",
            "Keep Friday evening free for the trip.",
        ],
    )?;
    let packing = notes::create_page(conn, home.clone(), "note", "Packing list".into())?;
    write_page(
        conn,
        &packing.id,
        "Packing list",
        &["Passport", "Charger", "Rain jacket"],
    )?;

    // Relationships, so the graph and the Relationships sections have something to draw.
    link(conn, &cheat.id, &review.entity.id, "relates-to")?;
    link(conn, &cheat.id, &midterm.entity.id, "relates-to")?;
    link(conn, &cheat.id, &wiki.entity.id, "relates-to")?;
    link(conn, &cheat.id, &complexity.id, "relates-to")?;
    link(conn, &review.entity.id, &practice.entity.id, "blocks")?;
    link(conn, &room.entity.id, &practice.entity.id, "blocks")?;
    link(conn, &practice.entity.id, &midterm.entity.id, "relates-to")?;
    link(conn, &jot.id, &midterm.entity.id, "relates-to")?;
    link(conn, &complexity.id, &slides.entity.id, "relates-to")?;
    link(conn, &trip.entity.id, &packing.id, "relates-to")?;
    link(conn, &passport.entity.id, &trip.entity.id, "blocks")?;
    // Across Spaces, flagged in the graph and the Relationships section.
    link(conn, &week.id, &midterm.entity.id, "relates-to")?;
    link(conn, &week.id, &practice.entity.id, "relates-to")?;
    link(conn, &week.id, &trip.entity.id, "relates-to")?;

    for id in [&cheat.id, &week.id] {
        entities::update_entity(
            conn,
            id,
            entities::EntityPatch {
                pinned: Some(true),
                ..Default::default()
            },
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_conn;

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |row| row.get(0)).unwrap()
    }

    #[test]
    fn fills_an_empty_database_with_two_spaces_and_linked_content() {
        let conn = test_conn();
        assert!(run(&conn).unwrap());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM spaces"), 2);
        for kind in [
            "task",
            "note",
            "jot",
            "course",
            "exam",
            "assignment",
            "bookmark",
        ] {
            let n = count(
                &conn,
                &format!("SELECT COUNT(*) FROM entities WHERE type = '{kind}'"),
            );
            assert!(n > 0, "no {kind} was seeded");
        }
        assert!(count(&conn, "SELECT COUNT(*) FROM relationships") >= 10);
    }

    #[test]
    fn links_across_the_two_spaces() {
        let conn = test_conn();
        run(&conn).unwrap();
        let across = count(
            &conn,
            "SELECT COUNT(*) FROM relationships r
             JOIN entities a ON a.id = r.from_entity_id
             JOIN entities b ON b.id = r.to_entity_id
             WHERE a.space_id <> b.space_id",
        );
        assert!(across > 0);
    }

    #[test]
    fn seeds_only_once() {
        let conn = test_conn();
        assert!(run(&conn).unwrap());
        let entities = count(&conn, "SELECT COUNT(*) FROM entities");
        assert!(!run(&conn).unwrap());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM entities"), entities);
    }

    #[test]
    fn seeds_a_fresh_data_folder_the_way_the_app_opens_it() {
        let dir = std::env::temp_dir().join(format!("nookly-dev-seed-{}", crate::db::new_id()));
        {
            let conn = crate::db::connect(&dir).unwrap();
            assert!(run(&conn).unwrap());
        }
        // The next launch finds the data and leaves it alone.
        let conn = crate::db::connect(&dir).unwrap();
        assert!(!run(&conn).unwrap());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM spaces"), 2);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn is_added_next_to_what_a_database_already_holds() {
        let conn = test_conn();
        let mine = spaces::create_space(&conn, "Mine".into(), None, "#000".into()).unwrap();
        let note = notes::create_page(&conn, mine.id.clone(), "note", "Keep me".into()).unwrap();

        assert!(run(&conn).unwrap());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM spaces"), 3);
        let kept: String = conn
            .query_row(
                "SELECT title FROM entities WHERE id = ?1",
                [&note.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(kept, "Keep me");
        let key: String = entities::entity_key(&conn, &note.id).unwrap();
        assert_eq!(key, note.key);
    }

    #[test]
    fn a_database_with_the_sample_space_gets_no_second_copy() {
        let conn = test_conn();
        spaces::create_space(&conn, "Mine".into(), None, "#000".into()).unwrap();
        assert!(run(&conn).unwrap());
        let entities = count(&conn, "SELECT COUNT(*) FROM entities");
        assert!(!run(&conn).unwrap());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM entities"), entities);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM spaces"), 3);
    }
}
