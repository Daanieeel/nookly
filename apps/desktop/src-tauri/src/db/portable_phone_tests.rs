//! The Nookly files the phone writes (`packages/shared/src/generated/portable-samples`,
//! made by `packages/shared/src/data/portable.test.ts`) must be files this app imports, so
//! a change on either side that breaks the other fails where it is made.

use crate::db::{portable, test_conn, test_space_with_course};

const PAGE: &str =
    include_str!("../../../../../packages/shared/src/generated/portable-samples/page.json");
const TASK: &str =
    include_str!("../../../../../packages/shared/src/generated/portable-samples/task.json");
const DECK: &str =
    include_str!("../../../../../packages/shared/src/generated/portable-samples/deck.json");
const ASSIGNMENT: &str =
    include_str!("../../../../../packages/shared/src/generated/portable-samples/assignment.json");

#[test]
fn a_page_from_the_phone_imports_with_its_blocks() {
    let conn = test_conn();
    let (space, _) = test_space_with_course(&conn, "Uni", "Algo");
    let page = portable::import(&conn, &space.id, None, PAGE).unwrap();
    assert_eq!(page.title, "Week 1");
    assert_eq!(page.entity_type, "note");
    let blocks = crate::db::notes::list_blocks(&conn, &page.id).unwrap();
    let kinds: Vec<_> = blocks.iter().map(|b| b.block_type.as_str()).collect();
    assert_eq!(kinds, ["paragraph", "heading2", "code"]);
    assert_eq!(blocks[0].content, "Hello **world**");
    assert_eq!(blocks[2].language.as_deref(), Some("rust"));
}

#[test]
fn a_task_from_the_phone_imports_with_its_status_and_sub_task() {
    let conn = test_conn();
    let (space, _) = test_space_with_course(&conn, "Uni", "Algo");
    let task = portable::import(&conn, &space.id, None, TASK).unwrap();
    assert_eq!(task.title, "Write report");
    let loaded = crate::db::tasks::get_task(&conn, &task.id).unwrap();
    assert_eq!(loaded.status_id, "in_progress");
    assert_eq!(loaded.effort, Some(5));
    assert_eq!(loaded.due_date.as_deref(), Some("2026-10-30"));
    let subtasks = crate::db::tasks::list_subtasks(&conn, &task.id).unwrap();
    assert_eq!(subtasks.len(), 1);
    assert_eq!(subtasks[0].status_id, "done");
}

#[test]
fn a_deck_from_the_phone_imports_with_its_cards() {
    let conn = test_conn();
    let (space, _) = test_space_with_course(&conn, "Uni", "Algo");
    let deck = portable::import(&conn, &space.id, None, DECK).unwrap();
    assert_eq!(deck.title, "Sorting");
    let cards = crate::db::decks::list_cards(&conn, &deck.id, false).unwrap();
    assert_eq!(cards.len(), 2);
    assert_eq!(cards[0].front, "Quicksort average?");
}

#[test]
fn an_assignment_from_the_phone_imports_under_a_course() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let assignment = portable::import(&conn, &space.id, Some(&course.id), ASSIGNMENT).unwrap();
    assert_eq!(assignment.title, "Sheet 3");
    let loaded = crate::db::assignments::get_assignment(&conn, &assignment.id).unwrap();
    assert_eq!(loaded.status, "graded");
    assert_eq!(loaded.grade, Some(1.3));
    assert_eq!(loaded.due_date.as_deref(), Some("2026-11-02"));
}
