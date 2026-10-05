//! Spec tests for Assignments (`docs/03-modules/assignments.md`).

use crate::db::assignments::*;
use crate::db::entities::{empty_trash, restore_entity, soft_delete_entity};
use crate::db::relationships::{create_relationship, list_relationships, Direction};
use crate::db::{test_conn, test_space, test_space_with_course};
use crate::error::AppError;
use rusqlite::{params, Connection};

fn assignment(
    conn: &Connection,
    space_id: &str,
    course_id: &str,
    title: &str,
    due: Option<&str>,
) -> Assignment {
    create_assignment(
        conn,
        space_id.into(),
        title.into(),
        course_id.into(),
        due.map(str::to_string),
    )
    .unwrap()
}

fn courses_of(conn: &Connection, id: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'assignment-course'",
        )
        .unwrap();
    stmt.query_map(params![id], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn titles(items: &[Assignment]) -> Vec<String> {
    items.iter().map(|a| a.entity.title.clone()).collect()
}

#[test]
fn a_new_assignment_is_not_started_and_tied_to_its_course() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &course.id, "Sheet 1", Some("2026-04-01"));
    assert_eq!(a.status, "not_started");
    assert!(a.grade.is_none());
    assert_eq!(a.entity.entity_type, "assignment");
    assert!(a.entity.key.starts_with("ASG-"));
    let stored = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!(stored.due_date.as_deref(), Some("2026-04-01"));
    assert_eq!(courses_of(&conn, &a.entity.id), vec![course.id]);
}

#[test]
fn an_assignment_with_an_unknown_course_leaves_nothing_behind() {
    let conn = test_conn();
    let space = test_space(&conn, "Uni");
    let result = create_assignment(
        &conn,
        space.id.clone(),
        "Sheet".into(),
        "ghost".into(),
        None,
    );
    assert!(matches!(result, Err(AppError::NotFound(_))));
    // Every Assignment has exactly one Course.
    assert!(
        list_assignments(&conn, &space.id).unwrap().is_empty(),
        "an assignment without a course was left behind"
    );
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM assignments"), 0);
}

#[test]
fn an_assignment_has_exactly_one_course() {
    let conn = test_conn();
    let (space, c1) = test_space_with_course(&conn, "Uni", "Algo");
    let c2 = crate::db::courses::create_course(&conn, space.id.clone(), "Math".into()).unwrap();
    let a = assignment(&conn, &space.id, &c1.id, "Sheet", None);
    let second = create_relationship(
        &conn,
        a.entity.id.clone(),
        c2.id.clone(),
        "assignment-course".into(),
        None,
        None,
    );
    assert!(matches!(second, Err(AppError::CardinalityViolation(_))));
    set_assignment_course(&conn, &a.entity.id, c2.id.clone()).unwrap();
    assert_eq!(courses_of(&conn, &a.entity.id), vec![c2.id]);
}

#[test]
fn every_documented_status_round_trips_with_a_grade() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &c.id, "Sheet", None);
    for status in ["not_started", "in_progress", "submitted"] {
        update_assignment_status(&conn, &a.entity.id, status.into(), None).unwrap();
        let stored = get_assignment(&conn, &a.entity.id).unwrap();
        assert_eq!(stored.status, status);
        assert!(stored.grade.is_none());
    }
    update_assignment_status(&conn, &a.entity.id, "graded".into(), Some(1.7)).unwrap();
    let stored = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!(
        (stored.status.as_str(), stored.grade),
        ("graded", Some(1.7))
    );
}

#[test]
fn an_undocumented_status_is_refused() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &c.id, "Sheet", None);
    // Status must be one of not_started|in_progress|submitted|graded.
    assert!(matches!(
        update_assignment_status(&conn, &a.entity.id, "lost".into(), None),
        Err(AppError::InvalidInput(_))
    ));
    assert_ne!(get_assignment(&conn, &a.entity.id).unwrap().status, "lost");
}

#[test]
fn cli_status_update_keeps_the_existing_grade() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &c.id, "Sheet", None);
    update_assignment_status(&conn, &a.entity.id, "graded".into(), Some(2.0)).unwrap();
    let def = crate::db::schema::lookup("assignment").unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("status".into(), serde_json::json!("submitted"));
    (def.update)(&conn, &a.entity.id, &fields).unwrap();
    let stored = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!(
        (stored.status.as_str(), stored.grade),
        ("submitted", Some(2.0))
    );
}

#[test]
fn due_dates_set_and_clear() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &c.id, "Sheet", None);
    update_assignment_due_date(&conn, &a.entity.id, Some("2026-05-05".into())).unwrap();
    assert_eq!(
        get_assignment(&conn, &a.entity.id)
            .unwrap()
            .due_date
            .as_deref(),
        Some("2026-05-05")
    );
    update_assignment_due_date(&conn, &a.entity.id, None).unwrap();
    assert!(get_assignment(&conn, &a.entity.id)
        .unwrap()
        .due_date
        .is_none());
}

#[test]
fn assignments_list_by_due_date() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    assignment(&conn, &space.id, &c.id, "C", Some("2026-03-03"));
    assignment(&conn, &space.id, &c.id, "A", Some("2026-01-01"));
    assignment(&conn, &space.id, &c.id, "B", Some("2026-02-02"));
    assert_eq!(
        titles(&list_assignments(&conn, &space.id).unwrap()),
        vec!["A", "B", "C"]
    );
}

#[test]
fn assignments_are_space_isolated_except_the_overview() {
    let conn = test_conn();
    let (a, ca) = test_space_with_course(&conn, "A", "Algo");
    let (b, cb) = test_space_with_course(&conn, "B", "Latin");
    assignment(&conn, &a.id, &ca.id, "In A", Some("2026-02-01"));
    assignment(&conn, &b.id, &cb.id, "In B", Some("2026-01-01"));
    assert_eq!(
        titles(&list_assignments(&conn, &a.id).unwrap()),
        vec!["In A"]
    );
    assert_eq!(
        titles(&list_assignments(&conn, &b.id).unwrap()),
        vec!["In B"]
    );
    assert_eq!(
        titles(&list_assignments_all_spaces(&conn).unwrap()),
        vec!["In B", "In A"]
    );
}

#[test]
fn trashed_assignments_leave_lists_and_restore() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &c.id, "Sheet", None);
    update_assignment_status(&conn, &a.entity.id, "graded".into(), Some(1.0)).unwrap();
    soft_delete_entity(&conn, &a.entity.id).unwrap();
    assert!(list_assignments(&conn, &space.id).unwrap().is_empty());
    assert!(list_assignments_all_spaces(&conn).unwrap().is_empty());
    restore_entity(&conn, &a.entity.id).unwrap();
    let back = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!((back.status.as_str(), back.grade), ("graded", Some(1.0)));
    assert_eq!(courses_of(&conn, &a.entity.id), vec![c.id]);
}

#[test]
fn empty_trash_removes_the_assignment_row() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &c.id, "Sheet", None);
    soft_delete_entity(&conn, &a.entity.id).unwrap();
    empty_trash(&conn).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM assignments"), 0);
    assert!(courses_of(&conn, &a.entity.id).is_empty());
}

#[test]
fn matching_todos_are_generic_task_links() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &c.id, "Sheet", None);
    let t1 = crate::db::tasks::create_task(&conn, space.id.clone(), "Part 1".into(), None, None)
        .unwrap();
    let t2 = crate::db::tasks::create_task(&conn, space.id.clone(), "Part 2".into(), None, None)
        .unwrap();
    create_relationship(
        &conn,
        t1.entity.id.clone(),
        a.entity.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    create_relationship(
        &conn,
        a.entity.id.clone(),
        t2.entity.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    let links = list_relationships(&conn, &a.entity.id, Direction::Both).unwrap();
    // The course link plus the two task links.
    assert_eq!(links.len(), 3);
    assert_eq!(
        links
            .iter()
            .filter(|r| r.relationship_type == "relates-to")
            .count(),
        2
    );
}

#[test]
fn updates_on_an_unknown_assignment_report_not_found() {
    let conn = test_conn();
    // Setters must report NotFound naming the missing id.
    match update_assignment_status(&conn, "ghost", "graded".into(), Some(1.0)) {
        Err(AppError::NotFound(m)) => assert!(m.contains("ghost"), "{m}"),
        other => panic!("expected NotFound, got {other:?}"),
    }
    match update_assignment_due_date(&conn, "ghost", None) {
        Err(AppError::NotFound(m)) => assert!(m.contains("ghost"), "{m}"),
        other => panic!("expected NotFound, got {other:?}"),
    }
    assert!(matches!(
        get_assignment(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM assignments"), 0);
}

#[test]
fn unicode_and_long_titles_round_trip() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let long = "Übungsblatt ".repeat(700);
    for title in ["Übungsblatt 3 ✍️", long.as_str()] {
        let a = assignment(&conn, &space.id, &c.id, title, None);
        assert_eq!(
            get_assignment(&conn, &a.entity.id).unwrap().entity.title,
            title
        );
    }
}

// --- Due before the next session ---------------------------------------------

fn session(conn: &Connection, space: &str, course: &str, date: &str) -> String {
    crate::db::sessions::create_one_off_session(
        conn,
        space.into(),
        "Lecture".into(),
        course.into(),
        date.into(),
        "10:00".into(),
        "12:00".into(),
        None,
    )
    .unwrap()
    .entity
    .id
}

fn cancel(conn: &Connection, session_id: &str) {
    crate::db::sessions::override_occurrence(
        conn,
        session_id,
        crate::db::sessions::OccurrenceOverride {
            cancelled: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
}

#[test]
fn due_before_a_session_is_the_next_sessions_day_minus_the_offset() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    session(&conn, &space.id, &course.id, "2026-04-06");
    session(&conn, &space.id, &course.id, "2026-04-13");
    let due = |offset, today| next_session_due(&conn, &course.id, offset, today).unwrap();
    assert_eq!(due(0, "2026-04-01").as_deref(), Some("2026-04-06"));
    assert_eq!(due(2, "2026-04-01").as_deref(), Some("2026-04-04"));
    // The session day itself still counts: it is due today.
    assert_eq!(due(0, "2026-04-06").as_deref(), Some("2026-04-06"));
}

#[test]
fn due_before_a_session_jumps_to_the_next_one_once_the_session_has_passed() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    session(&conn, &space.id, &course.id, "2026-04-06");
    session(&conn, &space.id, &course.id, "2026-04-13");
    let due = |offset, today| next_session_due(&conn, &course.id, offset, today).unwrap();
    assert_eq!(due(0, "2026-04-07").as_deref(), Some("2026-04-13"));
    // Past the last one, it stays on that session, and so is overdue.
    assert_eq!(due(0, "2026-04-14").as_deref(), Some("2026-04-13"));
}

// A bug found by hand: "1 week before" a session less than a week away showed no due
// date, because the sessions whose due day had already passed were skipped. The next
// session is still the next session, and the assignment is simply overdue.
#[test]
fn due_before_a_session_stays_on_the_next_session_even_when_that_day_is_past() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    session(&conn, &space.id, &course.id, "2026-04-06");
    let due = |offset, today| next_session_due(&conn, &course.id, offset, today).unwrap();
    assert_eq!(due(7, "2026-04-04").as_deref(), Some("2026-03-30"));
    assert_eq!(due(3, "2026-04-06").as_deref(), Some("2026-04-03"));
}

#[test]
fn due_before_a_session_skips_cancelled_and_trashed_sessions() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let cancelled = session(&conn, &space.id, &course.id, "2026-04-06");
    let trashed = session(&conn, &space.id, &course.id, "2026-04-08");
    session(&conn, &space.id, &course.id, "2026-04-13");
    conn.execute(
        "UPDATE sessions SET cancelled = 1 WHERE entity_id = ?1",
        params![cancelled],
    )
    .unwrap();
    soft_delete_entity(&conn, &trashed).unwrap();
    assert_eq!(
        next_session_due(&conn, &course.id, 0, "2026-04-01")
            .unwrap()
            .as_deref(),
        Some("2026-04-13")
    );
}

#[test]
fn due_before_a_session_only_looks_at_its_own_course() {
    let conn = test_conn();
    let (space, algo) = test_space_with_course(&conn, "Uni", "Algo");
    let other = crate::db::courses::create_course(&conn, space.id.clone(), "Logic".into()).unwrap();
    session(&conn, &space.id, &other.id, "2026-04-02");
    session(&conn, &space.id, &algo.id, "2026-04-09");
    assert_eq!(
        next_session_due(&conn, &algo.id, 0, "2026-04-01")
            .unwrap()
            .as_deref(),
        Some("2026-04-09")
    );
}

#[test]
fn an_assignment_due_before_a_session_reads_the_resolved_day() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    // Far apart, so the test doesn't depend on today's date.
    session(&conn, &space.id, &course.id, "2000-01-03");
    session(&conn, &space.id, &course.id, "2099-01-05");
    let a = assignment(&conn, &space.id, &course.id, "Sheet", Some("2026-04-01"));
    update_assignment_due_before_session(&conn, &a.entity.id, Some(1)).unwrap();
    let stored = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!(stored.due_session_offset_days, Some(1));
    assert_eq!(stored.due_date.as_deref(), Some("2099-01-04"));
    let listed = list_assignments(&conn, &space.id).unwrap();
    assert_eq!(listed[0].due_date.as_deref(), Some("2099-01-04"));
}

#[test]
fn an_assignment_due_before_a_session_has_no_due_day_without_any_session() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &course.id, "Sheet", Some("2026-04-01"));
    update_assignment_due_before_session(&conn, &a.entity.id, Some(0)).unwrap();
    assert_eq!(get_assignment(&conn, &a.entity.id).unwrap().due_date, None);
    // A trashed session is gone for good, so it is no session either.
    let only = session(&conn, &space.id, &course.id, "2099-01-05");
    soft_delete_entity(&conn, &only).unwrap();
    assert_eq!(get_assignment(&conn, &a.entity.id).unwrap().due_date, None);
}

// A bug found by hand: cancelling the only session left the assignment with no due date,
// so the sidebar went back to "Set due date". With nothing upcoming to move to, it stays
// on the last session the course had.
#[test]
fn cancelling_the_only_session_keeps_the_due_day() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let only = session(&conn, &space.id, &course.id, "2099-01-05");
    let a = assignment(&conn, &space.id, &course.id, "Sheet", None);
    update_assignment_due_before_session(&conn, &a.entity.id, Some(1)).unwrap();
    assert_eq!(
        get_assignment(&conn, &a.entity.id)
            .unwrap()
            .due_date
            .as_deref(),
        Some("2099-01-04")
    );
    cancel(&conn, &only);
    let after = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!(after.due_date.as_deref(), Some("2099-01-04"));
    assert_eq!(after.due_session_offset_days, Some(1));
    assert_eq!(
        list_assignments(&conn, &space.id).unwrap()[0]
            .due_date
            .as_deref(),
        Some("2099-01-04")
    );
}

#[test]
fn cancelling_a_session_moves_the_due_day_to_the_next_one_that_is_on() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let first = session(&conn, &space.id, &course.id, "2099-01-05");
    session(&conn, &space.id, &course.id, "2099-01-12");
    let a = assignment(&conn, &space.id, &course.id, "Sheet", None);
    update_assignment_due_before_session(&conn, &a.entity.id, Some(0)).unwrap();
    cancel(&conn, &first);
    assert_eq!(
        get_assignment(&conn, &a.entity.id)
            .unwrap()
            .due_date
            .as_deref(),
        Some("2099-01-12")
    );
}

#[test]
fn picking_a_date_again_stops_following_sessions() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    session(&conn, &space.id, &course.id, "2099-01-05");
    let a = assignment(&conn, &space.id, &course.id, "Sheet", None);
    update_assignment_due_before_session(&conn, &a.entity.id, Some(0)).unwrap();
    update_assignment_due_date(&conn, &a.entity.id, Some("2030-06-01".into())).unwrap();
    let stored = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!(stored.due_session_offset_days, None);
    assert_eq!(stored.due_date.as_deref(), Some("2030-06-01"));
}

#[test]
fn due_before_a_session_can_be_switched_off_and_refuses_a_negative_offset() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let a = assignment(&conn, &space.id, &course.id, "Sheet", Some("2030-06-01"));
    assert!(matches!(
        update_assignment_due_before_session(&conn, &a.entity.id, Some(-1)),
        Err(AppError::InvalidInput(_))
    ));
    update_assignment_due_before_session(&conn, &a.entity.id, Some(0)).unwrap();
    update_assignment_due_before_session(&conn, &a.entity.id, None).unwrap();
    let stored = get_assignment(&conn, &a.entity.id).unwrap();
    assert_eq!(stored.due_session_offset_days, None);
    assert_eq!(stored.due_date.as_deref(), Some("2030-06-01"));
    assert!(matches!(
        update_assignment_due_before_session(&conn, "ghost", Some(0)),
        Err(AppError::NotFound(_))
    ));
}
