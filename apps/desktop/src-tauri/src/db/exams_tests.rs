//! Spec tests for Exams (`docs/03-modules/exam-tracking.md`,
//! `docs/02-entity-model.md` "Structural Relationships").

use crate::db::entities::{empty_trash, list_entities, restore_entity, soft_delete_entity};
use crate::db::exams::*;
use crate::db::{test_conn, test_space, test_space_with_course};
use crate::error::AppError;
use rusqlite::{params, Connection};

fn exam(
    conn: &Connection,
    space_id: &str,
    course_id: &str,
    title: &str,
    date: Option<&str>,
) -> Exam {
    create_exam(
        conn,
        space_id.into(),
        title.into(),
        course_id.into(),
        date.map(str::to_string),
        None,
    )
    .unwrap()
}

fn courses_of(conn: &Connection, id: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'exam-course'",
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

fn titles(exams: &[Exam]) -> Vec<String> {
    exams.iter().map(|e| e.entity.title.clone()).collect()
}

#[test]
fn a_new_exam_is_upcoming_and_tied_to_its_course() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x = create_exam(
        &conn,
        space.id.clone(),
        "Final".into(),
        course.id.clone(),
        Some("2026-07-20".into()),
        Some(0.6),
    )
    .unwrap();
    assert_eq!(x.status, "upcoming");
    assert_eq!(x.entity.entity_type, "exam");
    assert!(x.entity.key.starts_with("EXM-"));
    assert!(x.grade.is_none() && x.room.is_none());
    let stored = get_exam(&conn, &x.entity.id).unwrap();
    assert_eq!(stored.exam_date.as_deref(), Some("2026-07-20"));
    assert_eq!(stored.weight, Some(0.6));
    assert_eq!(courses_of(&conn, &x.entity.id), vec![course.id]);
}

#[test]
fn an_exam_with_an_unknown_course_leaves_nothing_behind() {
    let conn = test_conn();
    let space = test_space(&conn, "Uni");
    let result = create_exam(
        &conn,
        space.id.clone(),
        "Final".into(),
        "ghost".into(),
        None,
        None,
    );
    assert!(matches!(result, Err(AppError::NotFound(_))));
    // Every Exam has exactly one Course: no Course-less Exam may remain.
    assert!(
        list_exams(&conn, &space.id).unwrap().is_empty(),
        "an exam without a course was left behind"
    );
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM exams"), 0);
}

#[test]
fn an_exams_course_must_be_a_course() {
    let conn = test_conn();
    let space = test_space(&conn, "Uni");
    let note = crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    let result = create_exam(&conn, space.id.clone(), "Final".into(), note.id, None, None);
    assert!(result.is_err(), "an exam was filed under a note");
}

#[test]
fn an_exam_has_exactly_one_course() {
    let conn = test_conn();
    let (space, c1) = test_space_with_course(&conn, "Uni", "Algo");
    let c2 = crate::db::courses::create_course(&conn, space.id.clone(), "Math".into()).unwrap();
    let x = exam(&conn, &space.id, &c1.id, "Final", None);
    let second = crate::db::relationships::create_relationship(
        &conn,
        x.entity.id.clone(),
        c2.id,
        "exam-course".into(),
        None,
        None,
    );
    assert!(matches!(second, Err(AppError::CardinalityViolation(_))));
    assert_eq!(courses_of(&conn, &x.entity.id), vec![c1.id]);
}

#[test]
fn moving_an_exam_to_another_course_replaces_the_link() {
    let conn = test_conn();
    let (space, c1) = test_space_with_course(&conn, "Uni", "Algo");
    let c2 = crate::db::courses::create_course(&conn, space.id.clone(), "Math".into()).unwrap();
    let x = exam(&conn, &space.id, &c1.id, "Final", None);
    set_exam_course(&conn, &x.entity.id, c2.id.clone()).unwrap();
    assert_eq!(courses_of(&conn, &x.entity.id), vec![c2.id.clone()]);
    // Same course again is fine and still one link.
    set_exam_course(&conn, &x.entity.id, c2.id.clone()).unwrap();
    assert_eq!(courses_of(&conn, &x.entity.id), vec![c2.id]);
}

#[test]
fn moving_to_an_unknown_course_keeps_the_old_one() {
    let conn = test_conn();
    let (space, c1) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c1.id, "Final", None);
    assert!(matches!(
        set_exam_course(&conn, &x.entity.id, "ghost".into()),
        Err(AppError::NotFound(_))
    ));
    assert_eq!(courses_of(&conn, &x.entity.id), vec![c1.id]);
}

#[test]
fn exams_list_by_date_soonest_first() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    exam(&conn, &space.id, &c.id, "Late", Some("2026-09-01"));
    exam(&conn, &space.id, &c.id, "Early", Some("2026-02-01"));
    exam(&conn, &space.id, &c.id, "Middle", Some("2026-05-01"));
    assert_eq!(
        titles(&list_exams(&conn, &space.id).unwrap()),
        vec!["Early", "Middle", "Late"]
    );
}

#[test]
fn exams_are_space_isolated_except_the_cross_space_briefing() {
    let conn = test_conn();
    let (a, ca) = test_space_with_course(&conn, "A", "Algo");
    let (b, cb) = test_space_with_course(&conn, "B", "Latin");
    exam(&conn, &a.id, &ca.id, "In A", Some("2026-03-01"));
    exam(&conn, &b.id, &cb.id, "In B", Some("2026-01-01"));
    assert_eq!(titles(&list_exams(&conn, &a.id).unwrap()), vec!["In A"]);
    assert_eq!(titles(&list_exams(&conn, &b.id).unwrap()), vec!["In B"]);
    assert_eq!(
        titles(&list_exams_all_spaces(&conn).unwrap()),
        vec!["In B", "In A"]
    );
}

#[test]
fn trashed_exams_leave_lists_and_come_back_on_restore() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", None);
    soft_delete_entity(&conn, &x.entity.id).unwrap();
    assert!(list_exams(&conn, &space.id).unwrap().is_empty());
    assert!(list_exams_all_spaces(&conn).unwrap().is_empty());
    assert!(list_entities(&conn, Some(&space.id), true)
        .unwrap()
        .iter()
        .any(|e| e.id == x.entity.id && e.deleted_at.is_some()));
    // Still linked to its course while in Trash.
    assert_eq!(courses_of(&conn, &x.entity.id), vec![c.id.clone()]);
    restore_entity(&conn, &x.entity.id).unwrap();
    assert_eq!(
        titles(&list_exams(&conn, &space.id).unwrap()),
        vec!["Final"]
    );
}

#[test]
fn trashing_the_course_keeps_the_exam_and_its_link() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", None);
    soft_delete_entity(&conn, &c.id).unwrap();
    assert_eq!(list_exams(&conn, &space.id).unwrap().len(), 1);
    assert_eq!(courses_of(&conn, &x.entity.id), vec![c.id]);
}

#[test]
fn empty_trash_removes_the_exam_row_and_its_links() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", None);
    soft_delete_entity(&conn, &x.entity.id).unwrap();
    empty_trash(&conn).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM exams"), 0);
    assert!(courses_of(&conn, &x.entity.id).is_empty());
    assert!(matches!(
        get_exam(&conn, &x.entity.id),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn update_exam_leaves_unset_fields_alone() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", None);
    update_exam(&conn, &x.entity.id, Some(2.3), None).unwrap();
    update_exam(&conn, &x.entity.id, None, Some("studying".into())).unwrap();
    let stored = get_exam(&conn, &x.entity.id).unwrap();
    assert_eq!(stored.grade, Some(2.3));
    assert_eq!(stored.status, "studying");
    update_exam(&conn, &x.entity.id, None, None).unwrap();
    let stored = get_exam(&conn, &x.entity.id).unwrap();
    assert_eq!(
        (stored.grade, stored.status.as_str()),
        (Some(2.3), "studying")
    );
}

#[test]
fn every_documented_status_round_trips() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", None);
    for status in ["upcoming", "studying", "done"] {
        update_exam(&conn, &x.entity.id, None, Some(status.into())).unwrap();
        assert_eq!(get_exam(&conn, &x.entity.id).unwrap().status, status);
    }
}

#[test]
fn an_undocumented_status_is_refused() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", None);
    // Status must be one of upcoming|studying|done.
    assert!(matches!(
        update_exam(&conn, &x.entity.id, None, Some("bogus".into())),
        Err(AppError::InvalidInput(_))
    ));
    assert_ne!(get_exam(&conn, &x.entity.id).unwrap().status, "bogus");
}

#[test]
fn date_weight_and_room_clear_with_none() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", Some("2026-01-01"));
    update_exam_weight(&conn, &x.entity.id, Some(0.25)).unwrap();
    update_exam_room(&conn, &x.entity.id, Some("Hörsaal 1".into())).unwrap();
    assert_eq!(
        get_exam(&conn, &x.entity.id).unwrap().room.as_deref(),
        Some("Hörsaal 1")
    );
    update_exam_date(&conn, &x.entity.id, None).unwrap();
    update_exam_weight(&conn, &x.entity.id, None).unwrap();
    update_exam_room(&conn, &x.entity.id, None).unwrap();
    let stored = get_exam(&conn, &x.entity.id).unwrap();
    assert!(stored.exam_date.is_none() && stored.weight.is_none() && stored.room.is_none());
}

#[test]
fn a_new_exam_has_no_time_and_the_time_sets_and_clears() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", Some("2026-01-01"));
    assert_eq!(x.exam_time, None);
    update_exam_time(&conn, &x.entity.id, Some("09:30".into())).unwrap();
    assert_eq!(
        get_exam(&conn, &x.entity.id).unwrap().exam_time.as_deref(),
        Some("09:30")
    );
    update_exam_time(&conn, &x.entity.id, None).unwrap();
    assert_eq!(get_exam(&conn, &x.entity.id).unwrap().exam_time, None);
}

#[test]
fn a_time_that_is_not_a_clock_time_is_refused() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", None);
    for bad in ["9:30", "25:00", "noon", ""] {
        let r = update_exam_time(&conn, &x.entity.id, Some(bad.into()));
        assert!(matches!(r, Err(AppError::InvalidInput(_))), "{bad}: {r:?}");
    }
    assert_eq!(get_exam(&conn, &x.entity.id).unwrap().exam_time, None);
}

#[test]
fn cli_update_sets_and_clears_the_time() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &c.id, "Final", Some("2026-01-01"));
    let def = crate::db::schema::lookup("exam").unwrap();
    let set: crate::db::schema::JsonMap =
        serde_json::from_value(serde_json::json!({ "examTime": "14:00" })).unwrap();
    let out = (def.update)(&conn, &x.entity.id, &set).unwrap();
    assert_eq!(out["examTime"], "14:00");
    let clear: crate::db::schema::JsonMap =
        serde_json::from_value(serde_json::json!({ "examTime": null })).unwrap();
    let out = (def.update)(&conn, &x.entity.id, &clear).unwrap();
    assert!(out["examTime"].is_null());
}

#[test]
fn updates_on_an_unknown_exam_report_not_found() {
    let conn = test_conn();
    // Every exam setter must report NotFound for a missing id.
    let results = [
        update_exam(&conn, "ghost", Some(1.0), Some("done".into())),
        update_exam_date(&conn, "ghost", Some("2026-01-01".into())),
        update_exam_weight(&conn, "ghost", Some(0.5)),
        update_exam_grade(&conn, "ghost", Some(1.0)),
        update_exam_room(&conn, "ghost", Some("R".into())),
        update_exam_time(&conn, "ghost", Some("09:00".into())),
    ];
    for r in results {
        assert!(matches!(r, Err(AppError::NotFound(_))), "{r:?}");
    }
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM exams"), 0);
}

#[test]
fn get_exam_on_a_non_exam_is_not_found() {
    let conn = test_conn();
    let (_, course) = test_space_with_course(&conn, "Uni", "Algo");
    assert!(matches!(
        get_exam(&conn, &course.id),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn unicode_and_long_titles_round_trip() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let long = "Prüfung ".repeat(800);
    for title in ["Klausur Lineare Algebra 🧮", long.as_str(), ""] {
        let x = exam(&conn, &space.id, &c.id, title, None);
        assert_eq!(get_exam(&conn, &x.entity.id).unwrap().entity.title, title);
    }
}

#[test]
fn cli_update_moves_course_and_clears_fields() {
    let conn = test_conn();
    let (space, c1) = test_space_with_course(&conn, "Uni", "Algo");
    let c2 = crate::db::courses::create_course(&conn, space.id.clone(), "Math".into()).unwrap();
    let x = exam(&conn, &space.id, &c1.id, "Final", Some("2026-01-01"));
    let def = crate::db::schema::lookup("exam").unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("courseId".into(), serde_json::json!(c2.id));
    fields.insert("examDate".into(), serde_json::Value::Null);
    fields.insert("grade".into(), serde_json::json!(1.3));
    (def.update)(&conn, &x.entity.id, &fields).unwrap();
    let stored = get_exam(&conn, &x.entity.id).unwrap();
    assert!(stored.exam_date.is_none());
    assert_eq!(stored.grade, Some(1.3));
    assert_eq!(courses_of(&conn, &x.entity.id), vec![c2.id]);
}

#[test]
fn cli_create_requires_a_course() {
    let conn = test_conn();
    let space = test_space(&conn, "Uni");
    let def = crate::db::schema::lookup("exam").unwrap();
    let input = crate::db::schema::CreateInput {
        space_id: space.id.clone(),
        title: "Final".into(),
        fields: crate::db::schema::JsonMap::new(),
    };
    assert!((def.create)(&conn, input).is_err());
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM entities"), 0);
}
