//! Spec tests for Study Blocks (`docs/03-modules/exam-tracking.md`).

use crate::db::entities::{
    empty_trash, get_entity, restore_entity, soft_delete_entity, update_entity, EntityPatch,
};
use crate::db::study_blocks::*;
use crate::db::{test_conn, test_space, test_space_with_course};
use crate::error::AppError;
use rusqlite::{params, Connection};

fn exam_in(conn: &Connection, space_id: &str, course_id: &str) -> String {
    crate::db::exams::create_exam(
        conn,
        space_id.into(),
        "Final".into(),
        course_id.into(),
        None,
        None,
    )
    .unwrap()
    .entity
    .id
}

fn block(
    conn: &Connection,
    space_id: &str,
    exam_id: &str,
    title: &str,
    date: &str,
    start: &str,
) -> StudyBlock {
    create_study_block(
        conn,
        space_id.into(),
        title.into(),
        exam_id.into(),
        date.into(),
        start.into(),
        "23:00".into(),
    )
    .unwrap()
}

fn exam_of(conn: &Connection, id: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'study-block-exam'",
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

fn titles(items: &[StudyBlock]) -> Vec<String> {
    items.iter().map(|b| b.entity.title.clone()).collect()
}

#[test]
fn a_study_block_stores_its_time_box_and_exam() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    let b = create_study_block(
        &conn,
        space.id.clone(),
        "Graphs".into(),
        exam.clone(),
        "2026-06-01".into(),
        "09:00".into(),
        "11:30".into(),
    )
    .unwrap();
    assert_eq!(b.entity.entity_type, "study_block");
    assert!(b.entity.key.starts_with("STB-"));
    let stored = get_study_block(&conn, &b.entity.id).unwrap();
    assert_eq!(
        (
            stored.date.as_str(),
            stored.start_time.as_str(),
            stored.end_time.as_str()
        ),
        ("2026-06-01", "09:00", "11:30")
    );
    assert_eq!(exam_of(&conn, &b.entity.id), vec![exam]);
}

#[test]
fn a_study_block_is_never_tied_to_a_course() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    let b = block(&conn, &space.id, &exam, "B", "2026-06-01", "09:00");
    let direct: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM relationships WHERE from_entity_id = ?1 AND to_entity_id = ?2",
            params![b.entity.id, c.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(direct, 0);
}

#[test]
fn a_study_block_with_an_unknown_exam_leaves_nothing_behind() {
    let conn = test_conn();
    let space = test_space(&conn, "Uni");
    let result = create_study_block(
        &conn,
        space.id.clone(),
        "B".into(),
        "ghost".into(),
        "2026-06-01".into(),
        "09:00".into(),
        "10:00".into(),
    );
    assert!(matches!(result, Err(AppError::NotFound(_))));
    // Every Study Block has exactly one Exam.
    assert!(
        list_study_blocks(&conn, &space.id).unwrap().is_empty(),
        "a study block without an exam was left behind"
    );
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM study_blocks"), 0);
}

#[test]
fn a_study_blocks_exam_must_be_an_exam() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let result = create_study_block(
        &conn,
        space.id.clone(),
        "B".into(),
        course.id,
        "2026-06-01".into(),
        "09:00".into(),
        "10:00".into(),
    );
    assert!(result.is_err(), "a study block was filed under a course");
}

#[test]
fn a_study_block_has_exactly_one_exam() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let e1 = exam_in(&conn, &space.id, &c.id);
    let e2 = exam_in(&conn, &space.id, &c.id);
    let b = block(&conn, &space.id, &e1, "B", "2026-06-01", "09:00");
    let second = crate::db::relationships::create_relationship(
        &conn,
        b.entity.id.clone(),
        e2,
        "study-block-exam".into(),
        None,
        None,
    );
    assert!(matches!(second, Err(AppError::CardinalityViolation(_))));
    assert_eq!(exam_of(&conn, &b.entity.id), vec![e1]);
}

#[test]
fn study_blocks_list_by_date_then_start_time() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    block(&conn, &space.id, &exam, "Day2 early", "2026-06-02", "08:00");
    block(&conn, &space.id, &exam, "Day1 late", "2026-06-01", "15:00");
    block(&conn, &space.id, &exam, "Day1 early", "2026-06-01", "09:00");
    assert_eq!(
        titles(&list_study_blocks(&conn, &space.id).unwrap()),
        vec!["Day1 early", "Day1 late", "Day2 early"]
    );
}

#[test]
fn study_blocks_are_space_isolated() {
    let conn = test_conn();
    let (a, ca) = test_space_with_course(&conn, "A", "Algo");
    let (b, cb) = test_space_with_course(&conn, "B", "Latin");
    let ea = exam_in(&conn, &a.id, &ca.id);
    let eb = exam_in(&conn, &b.id, &cb.id);
    block(&conn, &a.id, &ea, "In A", "2026-06-01", "09:00");
    block(&conn, &b.id, &eb, "In B", "2026-06-01", "09:00");
    assert_eq!(
        titles(&list_study_blocks(&conn, &a.id).unwrap()),
        vec!["In A"]
    );
    assert_eq!(
        titles(&list_study_blocks(&conn, &b.id).unwrap()),
        vec!["In B"]
    );
}

#[test]
fn trashed_blocks_leave_the_list_and_restore() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    let b = block(&conn, &space.id, &exam, "B", "2026-06-01", "09:00");
    soft_delete_entity(&conn, &b.entity.id).unwrap();
    assert!(list_study_blocks(&conn, &space.id).unwrap().is_empty());
    assert!(get_study_block(&conn, &b.entity.id)
        .unwrap()
        .entity
        .deleted_at
        .is_some());
    restore_entity(&conn, &b.entity.id).unwrap();
    assert_eq!(list_study_blocks(&conn, &space.id).unwrap().len(), 1);
}

#[test]
fn empty_trash_removes_the_block_row_and_its_exam_link() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    let b = block(&conn, &space.id, &exam, "B", "2026-06-01", "09:00");
    soft_delete_entity(&conn, &b.entity.id).unwrap();
    empty_trash(&conn).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM study_blocks"), 0);
    assert!(exam_of(&conn, &b.entity.id).is_empty());
    assert!(get_entity(&conn, &exam).is_ok());
}

#[test]
fn get_on_unknown_or_other_type_is_not_found() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    assert!(matches!(
        get_study_block(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        get_study_block(&conn, &exam),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn moving_the_course_carries_exam_study_blocks_and_decks() {
    let conn = test_conn();
    let (a, course) = test_space_with_course(&conn, "A", "Algo");
    let b = test_space(&conn, "B");
    let exam = exam_in(&conn, &a.id, &course.id);
    let blk = block(&conn, &a.id, &exam, "B", "2026-06-01", "09:00");
    let deck =
        crate::db::decks::create_deck(&conn, a.id.clone(), "D".into(), Some(exam.clone())).unwrap();
    let patch = |space: &str| EntityPatch {
        space_id: Some(space.into()),
        ..Default::default()
    };
    assert!(matches!(
        update_entity(&conn, &blk.entity.id, patch(&b.id)),
        Err(AppError::InvalidInput(_))
    ));
    update_entity(&conn, &course.id, patch(&b.id)).unwrap();
    for id in [&exam, &blk.entity.id, &deck.id] {
        assert_eq!(get_entity(&conn, id).unwrap().space_id, b.id);
    }
    assert!(list_study_blocks(&conn, &a.id).unwrap().is_empty());
    assert_eq!(list_study_blocks(&conn, &b.id).unwrap().len(), 1);
}

#[test]
fn cli_fields_are_create_only_and_update_changes_nothing() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    let b = block(&conn, &space.id, &exam, "B", "2026-06-01", "09:00");
    let def = crate::db::schema::lookup("study_block").unwrap();
    assert!(def
        .fields
        .iter()
        .all(|f| f.required_on_create && !f.writable_on_update));
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("date".into(), serde_json::json!("2030-01-01"));
    (def.update)(&conn, &b.entity.id, &fields).unwrap();
    assert_eq!(
        get_study_block(&conn, &b.entity.id).unwrap().date,
        "2026-06-01"
    );
}

#[test]
fn cli_create_without_times_stores_nothing() {
    let conn = test_conn();
    let (space, c) = test_space_with_course(&conn, "Uni", "Algo");
    let exam = exam_in(&conn, &space.id, &c.id);
    let before = count(&conn, "SELECT COUNT(*) FROM entities");
    let def = crate::db::schema::lookup("study_block").unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("examId".into(), serde_json::json!(exam));
    fields.insert("date".into(), serde_json::json!("2026-06-01"));
    let input = crate::db::schema::CreateInput {
        space_id: space.id.clone(),
        title: "B".into(),
        fields,
    };
    assert!((def.create)(&conn, input).is_err());
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM entities"), before);
}
