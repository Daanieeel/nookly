//! Spec tests for the Grade Report (`docs/03-modules/grades.md`).

use crate::db::assignments::{create_assignment, update_assignment_status};
use crate::db::courses::{
    create_course, create_semester, set_course_semester, set_current_semester,
};
use crate::db::entities::soft_delete_entity;
use crate::db::exams::{create_exam, update_exam};
use crate::db::grade_report::*;
use crate::db::{test_conn, test_space, test_space_with_course};
use rusqlite::Connection;

fn semester(conn: &Connection, space: &str, title: &str) -> String {
    create_semester(conn, space.into(), title.into(), None, None, None, None)
        .unwrap()
        .entity
        .id
}

fn graded_exam(conn: &Connection, space: &str, course: &str, weight: Option<f64>, grade: f64) {
    let exam = create_exam(
        conn,
        space.into(),
        "Exam".into(),
        course.into(),
        Some("2026-02-01".into()),
        weight,
    )
    .unwrap();
    update_exam(conn, &exam.entity.id, Some(grade), None).unwrap();
}

fn graded_assignment(conn: &Connection, space: &str, course: &str, grade: f64) {
    let a = create_assignment(
        conn,
        space.into(),
        "Sheet".into(),
        course.into(),
        Some("2026-01-15".into()),
    )
    .unwrap();
    update_assignment_status(conn, &a.entity.id, "graded".into(), Some(grade)).unwrap();
}

#[test]
fn courses_are_grouped_by_semester_with_a_grade_point_average_each() {
    let conn = test_conn();
    let (space, algo) = test_space_with_course(&conn, "Uni", "Algorithms");
    let logic = create_course(&conn, space.id.clone(), "Logic".into()).unwrap();
    let ws = semester(&conn, &space.id, "WS 25/26");
    set_course_semester(&conn, &algo.id, ws.clone()).unwrap();
    set_course_semester(&conn, &logic.id, ws.clone()).unwrap();
    graded_exam(&conn, &space.id, &algo.id, None, 1.0);
    graded_exam(&conn, &space.id, &logic.id, None, 2.0);

    let report = get_grade_report(&conn, &space.id).unwrap();
    assert_eq!(report.semesters.len(), 1);
    let group = &report.semesters[0];
    assert_eq!(group.semester.as_ref().unwrap().entity.id, ws);
    assert_eq!(group.courses.len(), 2);
    assert_eq!(group.gpa, Some(1.5));
    assert_eq!(group.graded_course_count, 2);
    assert_eq!(report.gpa, Some(1.5));
}

#[test]
fn the_cumulative_average_spans_every_semester() {
    let conn = test_conn();
    let (space, algo) = test_space_with_course(&conn, "Uni", "Algorithms");
    let logic = create_course(&conn, space.id.clone(), "Logic".into()).unwrap();
    let physics = create_course(&conn, space.id.clone(), "Physics".into()).unwrap();
    let ws = semester(&conn, &space.id, "WS");
    let ss = semester(&conn, &space.id, "SS");
    set_course_semester(&conn, &algo.id, ws.clone()).unwrap();
    set_course_semester(&conn, &logic.id, ws).unwrap();
    set_course_semester(&conn, &physics.id, ss).unwrap();
    graded_exam(&conn, &space.id, &algo.id, None, 1.0);
    graded_exam(&conn, &space.id, &logic.id, None, 2.0);
    graded_exam(&conn, &space.id, &physics.id, None, 4.0);

    let report = get_grade_report(&conn, &space.id).unwrap();
    // A mean of the three courses, not of the two semester averages (1.5 and 4.0).
    assert_eq!(report.gpa, Some((1.0 + 2.0 + 4.0) / 3.0));
}

#[test]
fn courses_without_a_semester_sit_in_their_own_group_last() {
    let conn = test_conn();
    let (space, loose) = test_space_with_course(&conn, "Uni", "Loose");
    let tied = create_course(&conn, space.id.clone(), "Tied".into()).unwrap();
    let ws = semester(&conn, &space.id, "WS");
    set_course_semester(&conn, &tied.id, ws).unwrap();
    graded_exam(&conn, &space.id, &loose.id, None, 3.0);

    let report = get_grade_report(&conn, &space.id).unwrap();
    assert_eq!(report.semesters.len(), 2);
    assert!(report.semesters[0].semester.is_some());
    assert!(report.semesters[1].semester.is_none());
    assert_eq!(report.semesters[1].courses[0].course.id, loose.id);
    assert_eq!(report.semesters[1].gpa, Some(3.0));
}

#[test]
fn a_course_with_nothing_graded_is_listed_but_stays_out_of_the_average() {
    let conn = test_conn();
    let (space, graded) = test_space_with_course(&conn, "Uni", "Graded");
    let empty = create_course(&conn, space.id.clone(), "Empty".into()).unwrap();
    graded_exam(&conn, &space.id, &graded.id, None, 2.0);
    // Ungraded work doesn't count either.
    create_exam(
        &conn,
        space.id.clone(),
        "Later".into(),
        empty.id.clone(),
        None,
        None,
    )
    .unwrap();

    let report = get_grade_report(&conn, &space.id).unwrap();
    let group = &report.semesters[0];
    assert_eq!(group.courses.len(), 2);
    let empty_report = group
        .courses
        .iter()
        .find(|c| c.course.id == empty.id)
        .unwrap();
    assert_eq!(empty_report.grades.grade, None);
    assert_eq!(empty_report.items.len(), 1);
    assert_eq!(group.gpa, Some(2.0));
    assert_eq!(group.graded_course_count, 1);
}

#[test]
fn nothing_graded_means_no_average() {
    let conn = test_conn();
    let (space, _course) = test_space_with_course(&conn, "Uni", "Algo");
    let report = get_grade_report(&conn, &space.id).unwrap();
    assert_eq!(report.gpa, None);
    assert_eq!(report.semesters[0].gpa, None);
    assert!(get_grade_report(&conn, &test_space(&conn, "Empty").id)
        .unwrap()
        .semesters
        .is_empty());
}

#[test]
fn items_carry_their_kind_weight_share_grade_and_date() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    graded_exam(&conn, &space.id, &course.id, Some(0.6), 1.0);
    graded_assignment(&conn, &space.id, &course.id, 2.0);

    let report = get_grade_report(&conn, &space.id).unwrap();
    let course_report = &report.semesters[0].courses[0];
    let exam = course_report
        .items
        .iter()
        .find(|i| i.kind == "exam")
        .unwrap();
    let assignment = course_report
        .items
        .iter()
        .find(|i| i.kind == "assignment")
        .unwrap();
    assert_eq!(exam.weight, Some(0.6));
    assert!((exam.share - 0.6).abs() < 1e-9);
    assert_eq!(exam.grade, Some(1.0));
    assert_eq!(exam.status, "upcoming");
    assert_eq!(assignment.status, "graded");
    assert_eq!(exam.date.as_deref(), Some("2026-02-01"));
    // An assignment has no weight of its own: it takes what the exams leave.
    assert_eq!(assignment.weight, None);
    assert!((assignment.share - 0.4).abs() < 1e-9);
    assert_eq!(assignment.date.as_deref(), Some("2026-01-15"));
    assert!((course_report.grades.grade.unwrap() - 1.4).abs() < 1e-9);
}

#[test]
fn items_are_listed_by_date_with_undated_last() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    create_exam(
        &conn,
        space.id.clone(),
        "Undated".into(),
        course.id.clone(),
        None,
        None,
    )
    .unwrap();
    graded_exam(&conn, &space.id, &course.id, None, 1.0);
    graded_assignment(&conn, &space.id, &course.id, 2.0);
    let report = get_grade_report(&conn, &space.id).unwrap();
    let dates: Vec<_> = report.semesters[0].courses[0]
        .items
        .iter()
        .map(|i| i.date.clone())
        .collect();
    assert_eq!(
        dates,
        vec![
            Some("2026-01-15".to_string()),
            Some("2026-02-01".to_string()),
            None
        ]
    );
}

#[test]
fn the_current_semester_is_flagged() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let other = create_course(&conn, space.id.clone(), "Other".into()).unwrap();
    let ws = semester(&conn, &space.id, "WS");
    let ss = semester(&conn, &space.id, "SS");
    set_course_semester(&conn, &course.id, ws).unwrap();
    set_course_semester(&conn, &other.id, ss.clone()).unwrap();
    set_current_semester(&conn, &space.id, &ss).unwrap();
    let report = get_grade_report(&conn, &space.id).unwrap();
    let current: Vec<_> = report
        .semesters
        .iter()
        .filter(|s| s.semester.as_ref().is_some_and(|s| s.is_current))
        .map(|s| s.semester.as_ref().unwrap().entity.id.clone())
        .collect();
    assert_eq!(current, vec![ss]);
}

#[test]
fn trashed_work_courses_and_semesters_drop_out() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let gone = create_course(&conn, space.id.clone(), "Gone".into()).unwrap();
    let ws = semester(&conn, &space.id, "WS");
    set_course_semester(&conn, &course.id, ws.clone()).unwrap();
    graded_exam(&conn, &space.id, &course.id, None, 1.0);
    graded_exam(&conn, &space.id, &course.id, None, 5.0);
    let trashed_exam = create_exam(
        &conn,
        space.id.clone(),
        "Trashed".into(),
        course.id.clone(),
        None,
        None,
    )
    .unwrap();
    soft_delete_entity(&conn, &trashed_exam.entity.id).unwrap();
    soft_delete_entity(&conn, &gone.id).unwrap();

    let report = get_grade_report(&conn, &space.id).unwrap();
    assert_eq!(report.semesters[0].courses.len(), 1);
    assert_eq!(report.semesters[0].courses[0].items.len(), 2);

    // A trashed semester leaves its courses without one, not lost.
    soft_delete_entity(&conn, &ws).unwrap();
    let report = get_grade_report(&conn, &space.id).unwrap();
    assert_eq!(report.semesters.len(), 1);
    assert!(report.semesters[0].semester.is_none());
    assert_eq!(report.semesters[0].courses[0].course.id, course.id);
}

#[test]
fn another_spaces_courses_stay_out() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let (other, other_course) = test_space_with_course(&conn, "Other", "Elsewhere");
    graded_exam(&conn, &space.id, &course.id, None, 1.0);
    graded_exam(&conn, &other.id, &other_course.id, None, 5.0);
    let report = get_grade_report(&conn, &space.id).unwrap();
    assert_eq!(report.gpa, Some(1.0));
    assert_eq!(report.semesters[0].courses.len(), 1);
}

#[test]
fn a_weighted_assignment_reports_its_weight_and_share() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    graded_exam(&conn, &space.id, &course.id, None, 1.0);
    graded_assignment(&conn, &space.id, &course.id, 3.0);
    let report = get_grade_report(&conn, &space.id).unwrap();
    let id = report.semesters[0].courses[0]
        .items
        .iter()
        .find(|i| i.kind == "assignment")
        .unwrap()
        .entity
        .id
        .clone();
    crate::db::assignments::update_assignment_weight(&conn, &id, Some(0.25)).unwrap();

    let report = get_grade_report(&conn, &space.id).unwrap();
    let items = &report.semesters[0].courses[0].items;
    let assignment = items.iter().find(|i| i.kind == "assignment").unwrap();
    let exam = items.iter().find(|i| i.kind == "exam").unwrap();
    assert_eq!(assignment.weight, Some(0.25));
    assert!((assignment.share - 0.25).abs() < 1e-9);
    assert!((exam.share - 0.75).abs() < 1e-9);
}
