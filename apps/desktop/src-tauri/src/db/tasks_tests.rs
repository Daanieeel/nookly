//! Spec tests for Tasks and Sub-tasks (`docs/03-modules/tasks.md`,
//! `docs/02-entity-model.md` "Structural Relationships").

use crate::db::entities::{
    empty_trash, get_entity, list_entities, restore_entity, soft_delete_entity, update_entity,
    EntityPatch,
};
use crate::db::tasks::*;
use crate::db::{test_conn, test_space};
use crate::error::AppError;
use rusqlite::{params, Connection};

fn task(conn: &Connection, space_id: &str, title: &str) -> Task {
    create_task(conn, space_id.into(), title.into(), None, None).unwrap()
}

fn entity_count(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM entities", [], |r| r.get(0))
        .unwrap()
}

fn task_row_count(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
        .unwrap()
}

fn titles(tasks: &[Task]) -> Vec<String> {
    tasks.iter().map(|t| t.entity.title.clone()).collect()
}

fn parent_of(conn: &Connection, id: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'sub-task-of'",
        )
        .unwrap();
    stmt.query_map(params![id], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

// --- statuses ----------------------------------------------------------------

#[test]
fn default_statuses_ship_in_order_with_doneness() {
    let conn = test_conn();
    let statuses = list_task_statuses(&conn).unwrap();
    let summary: Vec<(&str, i64)> = statuses
        .iter()
        .map(|s| (s.id.as_str(), s.doneness))
        .collect();
    assert_eq!(
        summary,
        vec![
            ("backlog", 0),
            ("todo", 0),
            ("in_progress", 50),
            ("done", 100),
            ("cancelled", 100),
        ]
    );
    let positions: Vec<i64> = statuses.iter().map(|s| s.position).collect();
    assert_eq!(positions, vec![0, 1, 2, 3, 4]);
    assert!(statuses
        .iter()
        .all(|s| !s.name.is_empty() && s.color.starts_with('#')));
}

#[test]
fn status_config_is_global_not_per_space() {
    let conn = test_conn();
    let before = list_task_statuses(&conn).unwrap();
    test_space(&conn, "A");
    test_space(&conn, "B");
    let after = list_task_statuses(&conn).unwrap();
    assert_eq!(before.len(), after.len());
    // Status rows have no space column at all.
    let has_space: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('task_statuses') WHERE name = 'space_id'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(has_space, 0);
}

#[test]
fn a_new_task_starts_in_backlog_with_nothing_else_set() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "Write report");
    assert_eq!(t.status_id, "backlog");
    assert_eq!(t.entity.entity_type, "task");
    assert_eq!(t.entity.space_id, space.id);
    assert!(t.entity.key.starts_with("TSK-"));
    assert!(t.completed_at.is_none() && t.effort.is_none());
    assert!(t.start_date.is_none() && t.due_date.is_none());

    let stored = get_task(&conn, &t.entity.id).unwrap();
    assert_eq!(stored.status_id, "backlog");
    assert_eq!(stored.entity.key, t.entity.key);
}

#[test]
fn every_status_can_be_selected() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    for status in list_task_statuses(&conn).unwrap() {
        update_task_status(&conn, &t.entity.id, &status.id).unwrap();
        let stored = get_task(&conn, &t.entity.id).unwrap();
        assert_eq!(stored.status_id, status.id);
        assert_eq!(stored.completed_at.is_some(), status.doneness >= 100);
    }
}

#[test]
fn unknown_status_is_not_found_and_changes_nothing() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    update_task_status(&conn, &t.entity.id, "done").unwrap();
    let stamp = get_task(&conn, &t.entity.id).unwrap().completed_at;

    let result = update_task_status(&conn, &t.entity.id, "archived");
    assert!(matches!(result, Err(AppError::NotFound(_))));
    let stored = get_task(&conn, &t.entity.id).unwrap();
    assert_eq!(stored.status_id, "done");
    assert_eq!(stored.completed_at, stamp);
}

#[test]
fn status_of_an_unknown_task_is_not_found() {
    let conn = test_conn();
    assert!(matches!(
        update_task_status(&conn, "ghost", "done"),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn get_task_on_unknown_or_non_task_is_not_found() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let note = crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    assert!(matches!(
        get_task(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        get_task(&conn, &note.id),
        Err(AppError::NotFound(_))
    ));
}

// --- completed_at ------------------------------------------------------------

#[test]
fn completed_at_is_unset_by_partial_doneness() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    update_task_status(&conn, &t.entity.id, "in_progress").unwrap();
    assert!(get_task(&conn, &t.entity.id)
        .unwrap()
        .completed_at
        .is_none());
    update_task_status(&conn, &t.entity.id, "todo").unwrap();
    assert!(get_task(&conn, &t.entity.id)
        .unwrap()
        .completed_at
        .is_none());
}

#[test]
fn moving_between_two_finished_statuses_restamps_completed_at() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    update_task_status(&conn, &t.entity.id, "done").unwrap();
    let done_at = get_task(&conn, &t.entity.id).unwrap().completed_at.unwrap();
    // A change to a finished status sets the stamp.
    update_task_status(&conn, &t.entity.id, "cancelled").unwrap();
    let cancelled_at = get_task(&conn, &t.entity.id).unwrap().completed_at.unwrap();
    assert!(cancelled_at >= done_at);
}

#[test]
fn reopening_and_finishing_again_gives_a_new_stamp() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    update_task_status(&conn, &t.entity.id, "done").unwrap();
    let first = get_task(&conn, &t.entity.id).unwrap().completed_at.unwrap();
    update_task_status(&conn, &t.entity.id, "todo").unwrap();
    assert!(get_task(&conn, &t.entity.id)
        .unwrap()
        .completed_at
        .is_none());
    update_task_status(&conn, &t.entity.id, "done").unwrap();
    let second = get_task(&conn, &t.entity.id).unwrap().completed_at.unwrap();
    assert!(second >= first);
}

#[test]
fn renaming_or_pinning_never_touches_completed_at() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    update_task_status(&conn, &t.entity.id, "done").unwrap();
    let stamp = get_task(&conn, &t.entity.id).unwrap().completed_at;
    update_entity(
        &conn,
        &t.entity.id,
        EntityPatch {
            title: Some("Renamed".into()),
            pinned: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(get_task(&conn, &t.entity.id).unwrap().completed_at, stamp);
}

#[test]
fn completed_at_is_not_writable_through_the_cli_schema() {
    let def = crate::db::schema::lookup("task").unwrap();
    let field = def.fields.iter().find(|f| f.name == "completedAt").unwrap();
    assert!(!field.writable_on_update && !field.required_on_create);
}

// --- dates ---------------------------------------------------------------------

#[test]
fn start_and_due_dates_round_trip_and_clear() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = create_task(
        &conn,
        space.id.clone(),
        "T".into(),
        Some("2026-01-01".into()),
        Some("2026-01-31".into()),
    )
    .unwrap();
    let stored = get_task(&conn, &t.entity.id).unwrap();
    assert_eq!(stored.start_date.as_deref(), Some("2026-01-01"));
    assert_eq!(stored.due_date.as_deref(), Some("2026-01-31"));

    update_task_dates(&conn, &t.entity.id, None, Some("2026-02-15".into())).unwrap();
    let stored = get_task(&conn, &t.entity.id).unwrap();
    assert!(stored.start_date.is_none());
    assert_eq!(stored.due_date.as_deref(), Some("2026-02-15"));

    update_task_dates(&conn, &t.entity.id, None, None).unwrap();
    let stored = get_task(&conn, &t.entity.id).unwrap();
    assert!(stored.start_date.is_none() && stored.due_date.is_none());
}

#[test]
fn updating_dates_of_an_unknown_task_reports_it() {
    let conn = test_conn();
    // Like update_task_status/effort, an id that is not a task is refused.
    assert!(update_task_dates(&conn, "ghost", None, Some("2026-01-01".into())).is_err());
}

#[test]
fn updating_dates_of_a_non_task_entity_is_refused() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let note = crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    assert!(update_task_dates(&conn, &note.id, None, Some("2026-01-01".into())).is_err());
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE entity_id = ?1",
            [&note.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn cli_update_of_one_date_keeps_the_other() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = create_task(
        &conn,
        space.id.clone(),
        "T".into(),
        Some("2026-03-01".into()),
        Some("2026-03-10".into()),
    )
    .unwrap();
    let def = crate::db::schema::lookup("task").unwrap();
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("dueDate".into(), serde_json::json!("2026-03-20"));
    (def.update)(&conn, &t.entity.id, &fields).unwrap();
    let stored = get_task(&conn, &t.entity.id).unwrap();
    assert_eq!(stored.start_date.as_deref(), Some("2026-03-01"));
    assert_eq!(stored.due_date.as_deref(), Some("2026-03-20"));
}

#[test]
fn a_sub_task_keeps_its_own_dates_independent_of_its_parent() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = create_task(
        &conn,
        space.id.clone(),
        "P".into(),
        None,
        Some("2026-05-01".into()),
    )
    .unwrap();
    let sub = create_subtask(&conn, parent.entity.id.clone(), "C".into()).unwrap();
    // A new sub-task does not copy the parent's dates.
    assert!(sub.due_date.is_none() && sub.start_date.is_none());
    update_task_dates(&conn, &sub.entity.id, None, Some("2026-04-20".into())).unwrap();
    assert_eq!(
        get_task(&conn, &parent.entity.id)
            .unwrap()
            .due_date
            .as_deref(),
        Some("2026-05-01")
    );
}

// --- effort ----------------------------------------------------------------------

#[test]
fn every_fibonacci_step_is_a_valid_effort() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    for step in EFFORT_STEPS {
        update_task_effort(&conn, &t.entity.id, Some(step)).unwrap();
        assert_eq!(get_task(&conn, &t.entity.id).unwrap().effort, Some(step));
    }
    assert_eq!(EFFORT_STEPS, [1, 2, 3, 5, 8, 13]);
}

#[test]
fn off_scale_effort_is_invalid_and_keeps_the_old_value() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    update_task_effort(&conn, &t.entity.id, Some(5)).unwrap();
    for bad in [0, -1, 4, 6, 21, i64::MAX] {
        assert!(matches!(
            update_task_effort(&conn, &t.entity.id, Some(bad)),
            Err(AppError::InvalidInput(_))
        ));
    }
    assert_eq!(get_task(&conn, &t.entity.id).unwrap().effort, Some(5));
}

#[test]
fn effort_of_an_unknown_task_is_not_found() {
    let conn = test_conn();
    assert!(matches!(
        update_task_effort(&conn, "ghost", Some(3)),
        Err(AppError::NotFound(_))
    ));
}

// --- listing ---------------------------------------------------------------------

#[test]
fn list_tasks_is_in_creation_order_and_stable() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let names: Vec<String> = (0..12).map(|i| format!("Task {i}")).collect();
    for n in &names {
        task(&conn, &space.id, n);
    }
    assert_eq!(titles(&list_tasks(&conn, &space.id).unwrap()), names);
    assert_eq!(titles(&list_tasks(&conn, &space.id).unwrap()), names);
}

#[test]
fn list_tasks_never_shows_sub_tasks_as_rows() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "Parent");
    create_subtask(&conn, parent.entity.id.clone(), "Child".into()).unwrap();
    assert_eq!(
        titles(&list_tasks(&conn, &space.id).unwrap()),
        vec!["Parent"]
    );
    assert_eq!(titles(&list_tasks_all(&conn).unwrap()), vec!["Parent"]);
}

#[test]
fn list_tasks_is_space_isolated() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    task(&conn, &a.id, "In A");
    task(&conn, &b.id, "In B");
    assert_eq!(titles(&list_tasks(&conn, &a.id).unwrap()), vec!["In A"]);
    assert_eq!(titles(&list_tasks(&conn, &b.id).unwrap()), vec!["In B"]);
    assert!(list_tasks(&conn, "no-such-space").unwrap().is_empty());
}

#[test]
fn trashed_tasks_leave_lists_and_come_back_on_restore() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let keep = task(&conn, &space.id, "Keep");
    let gone = task(&conn, &space.id, "Gone");
    soft_delete_entity(&conn, &gone.entity.id).unwrap();

    assert_eq!(titles(&list_tasks(&conn, &space.id).unwrap()), vec!["Keep"]);
    assert_eq!(titles(&list_tasks_all(&conn).unwrap()), vec!["Keep"]);
    // It sits in Trash, with its data intact.
    let trash: Vec<_> = list_entities(&conn, Some(&space.id), true)
        .unwrap()
        .into_iter()
        .filter(|e| e.deleted_at.is_some())
        .collect();
    assert_eq!(trash.len(), 1);
    assert_eq!(trash[0].id, gone.entity.id);
    assert_eq!(
        get_task(&conn, &gone.entity.id).unwrap().status_id,
        "backlog"
    );

    restore_entity(&conn, &gone.entity.id).unwrap();
    assert_eq!(
        titles(&list_tasks(&conn, &space.id).unwrap()),
        vec!["Keep", "Gone"]
    );
    let _ = keep;
}

#[test]
fn empty_trash_removes_the_task_row_too() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    update_task_effort(&conn, &t.entity.id, Some(8)).unwrap();
    soft_delete_entity(&conn, &t.entity.id).unwrap();
    assert_eq!(empty_trash(&conn).unwrap(), 1);
    assert_eq!(task_row_count(&conn), 0);
    assert!(get_task(&conn, &t.entity.id).is_err());
}

#[test]
fn list_tasks_all_follows_space_order() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    task(&conn, &b.id, "B1");
    task(&conn, &a.id, "A1");
    assert_eq!(titles(&list_tasks_all(&conn).unwrap()), vec!["A1", "B1"]);
    crate::db::spaces::reorder_spaces(&conn, vec![b.id.clone(), a.id.clone()]).unwrap();
    assert_eq!(titles(&list_tasks_all(&conn).unwrap()), vec!["B1", "A1"]);
}

#[test]
fn open_due_or_overdue_excludes_done_future_and_trashed() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let today = chrono::Local::now().date_naive();
    let fmt = |d: chrono::NaiveDate| d.format("%Y-%m-%d").to_string();
    let mk = |title: &str, due: Option<String>| {
        create_task(&conn, space.id.clone(), title.into(), None, due).unwrap()
    };
    let overdue = mk("Overdue", Some(fmt(today - chrono::Duration::days(3))));
    mk("Future", Some(fmt(today + chrono::Duration::days(30))));
    mk("No date", None);
    let done = mk("Done", Some(fmt(today - chrono::Duration::days(1))));
    update_task_status(&conn, &done.entity.id, "done").unwrap();
    let trashed = mk("Trashed", Some(fmt(today - chrono::Duration::days(2))));
    soft_delete_entity(&conn, &trashed.entity.id).unwrap();

    let open = list_open_tasks_due_or_overdue(&conn).unwrap();
    assert_eq!(titles(&open), vec!["Overdue"]);
    assert_eq!(count_open_tasks_due_or_overdue(&conn).unwrap(), 1);
    let _ = overdue;
}

#[test]
fn open_due_or_overdue_is_earliest_first() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let today = chrono::Local::now().date_naive();
    for (title, days) in [("Two", 2), ("Ten", 10), ("Five", 5)] {
        let due = (today - chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string();
        create_task(&conn, space.id.clone(), title.into(), None, Some(due)).unwrap();
    }
    assert_eq!(
        titles(&list_open_tasks_due_or_overdue(&conn).unwrap()),
        vec!["Ten", "Five", "Two"]
    );
}

#[test]
fn due_today_counts_done_and_total_across_spaces() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let today = chrono::Utc::now()
        .date_naive()
        .format("%Y-%m-%d")
        .to_string();
    let x = create_task(&conn, a.id.clone(), "X".into(), None, Some(today.clone())).unwrap();
    create_task(&conn, b.id.clone(), "Y".into(), None, Some(today.clone())).unwrap();
    let z = create_task(&conn, b.id.clone(), "Z".into(), None, Some(today)).unwrap();
    update_task_status(&conn, &x.entity.id, "done").unwrap();
    soft_delete_entity(&conn, &z.entity.id).unwrap();
    let summary = count_tasks_due_today(&conn).unwrap();
    assert_eq!((summary.done, summary.total), (1, 2));
}

// --- titles ----------------------------------------------------------------------

#[test]
fn unicode_empty_and_long_titles_round_trip() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let long = "Lorem ipsum ".repeat(1000);
    for title in [
        "Steuererklärung 📑 für 2026".to_string(),
        "日本語のタスク".to_string(),
        "".to_string(),
        long,
    ] {
        let t = task(&conn, &space.id, &title);
        assert_eq!(get_task(&conn, &t.entity.id).unwrap().entity.title, title);
    }
}

#[test]
fn creating_a_task_in_an_unknown_space_is_rejected() {
    let conn = test_conn();
    // Every entity belongs to exactly one existing Space.
    let result = create_task(&conn, "no-such-space".into(), "Orphan".into(), None, None);
    assert!(result.is_err(), "a task was created in a missing space");
    assert_eq!(entity_count(&conn), 0);
}

// --- sub-tasks -------------------------------------------------------------------

#[test]
fn a_sub_task_lives_in_its_parents_space_and_starts_in_backlog() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "Parent");
    let sub = create_subtask(&conn, parent.entity.id.clone(), "Child".into()).unwrap();
    assert_eq!(sub.entity.entity_type, "sub_task");
    assert_eq!(sub.entity.space_id, space.id);
    assert_eq!(sub.status_id, "backlog");
    assert!(sub.entity.key.starts_with("TSK-"));
    assert_eq!(parent_of(&conn, &sub.entity.id), vec![parent.entity.id]);
}

#[test]
fn sub_tasks_list_in_creation_order() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "Parent");
    for n in ["a", "b", "c", "d"] {
        create_subtask(&conn, parent.entity.id.clone(), n.into()).unwrap();
    }
    assert_eq!(
        titles(&list_subtasks(&conn, &parent.entity.id).unwrap()),
        vec!["a", "b", "c", "d"]
    );
}

#[test]
fn sub_tasks_belong_to_one_parent_only() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let p1 = task(&conn, &space.id, "P1");
    let p2 = task(&conn, &space.id, "P2");
    create_subtask(&conn, p1.entity.id.clone(), "Only p1".into()).unwrap();
    assert!(list_subtasks(&conn, &p2.entity.id).unwrap().is_empty());
    assert_eq!(list_subtasks(&conn, &p1.entity.id).unwrap().len(), 1);
}

#[test]
fn a_sub_task_under_an_unknown_parent_is_not_found_and_stores_nothing() {
    let conn = test_conn();
    test_space(&conn, "S");
    assert!(matches!(
        create_subtask(&conn, "ghost".into(), "Child".into()),
        Err(AppError::NotFound(_))
    ));
    assert_eq!(entity_count(&conn), 0);
    assert_eq!(task_row_count(&conn), 0);
}

#[test]
fn a_sub_task_needs_a_task_as_its_parent() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let note = crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    assert!(create_subtask(&conn, note.id.clone(), "Child".into()).is_err());
    assert_eq!(entity_count(&conn), 1);
}

#[test]
fn a_rejected_grandchild_leaves_no_data_behind() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let sub = create_subtask(&conn, parent.entity.id.clone(), "C".into()).unwrap();
    let before = entity_count(&conn);
    assert!(matches!(
        create_subtask(&conn, sub.entity.id.clone(), "G".into()),
        Err(AppError::CardinalityViolation(_))
    ));
    assert_eq!(entity_count(&conn), before);
}

#[test]
fn a_sub_task_cannot_have_a_second_parent() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let p1 = task(&conn, &space.id, "P1");
    let p2 = task(&conn, &space.id, "P2");
    let sub = create_subtask(&conn, p1.entity.id.clone(), "C".into()).unwrap();
    let result = crate::db::relationships::create_relationship(
        &conn,
        sub.entity.id.clone(),
        p2.entity.id.clone(),
        "sub-task-of".into(),
        None,
        None,
    );
    assert!(matches!(result, Err(AppError::CardinalityViolation(_))));
    assert_eq!(parent_of(&conn, &sub.entity.id), vec![p1.entity.id]);
}

#[test]
fn a_parent_on_trash_takes_its_sub_tasks_along_and_restore_brings_them_back() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let s1 = create_subtask(&conn, parent.entity.id.clone(), "C1".into()).unwrap();
    let s2 = create_subtask(&conn, parent.entity.id.clone(), "C2".into()).unwrap();

    soft_delete_entity(&conn, &parent.entity.id).unwrap();
    // Changes cascade from a Task to its Sub-tasks.
    for sub in [&s1, &s2] {
        assert!(
            get_entity(&conn, &sub.entity.id)
                .unwrap()
                .deleted_at
                .is_some(),
            "sub-task stayed live after its parent went to Trash"
        );
    }
    restore_entity(&conn, &parent.entity.id).unwrap();
    for sub in [&s1, &s2] {
        assert!(get_entity(&conn, &sub.entity.id)
            .unwrap()
            .deleted_at
            .is_none());
    }
}

#[test]
fn restoring_a_parent_leaves_separately_trashed_sub_tasks_in_trash() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let kept = create_subtask(&conn, parent.entity.id.clone(), "kept".into()).unwrap();
    let gone = create_subtask(&conn, parent.entity.id.clone(), "gone".into()).unwrap();

    soft_delete_entity(&conn, &gone.entity.id).unwrap();
    soft_delete_entity(&conn, &parent.entity.id).unwrap();
    restore_entity(&conn, &parent.entity.id).unwrap();

    let trashed = |id: &str| get_entity(&conn, id).unwrap().deleted_at.is_some();
    assert!(!trashed(&parent.entity.id));
    assert!(!trashed(&kept.entity.id), "cascaded sub-task not restored");
    assert!(
        trashed(&gone.entity.id),
        "separately trashed sub-task came back"
    );
}

#[test]
fn trashing_and_restoring_a_parent_keeps_its_sub_task_links() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let sub = create_subtask(&conn, parent.entity.id.clone(), "C".into()).unwrap();
    soft_delete_entity(&conn, &parent.entity.id).unwrap();
    assert_eq!(
        parent_of(&conn, &sub.entity.id),
        vec![parent.entity.id.clone()]
    );
    restore_entity(&conn, &parent.entity.id).unwrap();
    assert_eq!(
        titles(&list_subtasks(&conn, &parent.entity.id).unwrap()),
        vec!["C"]
    );
}

#[test]
fn restoring_a_trashed_sub_task_puts_it_back_in_order() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let a = create_subtask(&conn, parent.entity.id.clone(), "a".into()).unwrap();
    create_subtask(&conn, parent.entity.id.clone(), "b".into()).unwrap();
    soft_delete_entity(&conn, &a.entity.id).unwrap();
    assert_eq!(
        titles(&list_subtasks(&conn, &parent.entity.id).unwrap()),
        vec!["b", "a"]
    );
    restore_entity(&conn, &a.entity.id).unwrap();
    assert_eq!(
        titles(&list_subtasks(&conn, &parent.entity.id).unwrap()),
        vec!["a", "b"]
    );
}

#[test]
fn moving_a_parent_carries_its_sub_tasks_to_the_new_space() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let parent = task(&conn, &a.id, "P");
    let sub = create_subtask(&conn, parent.entity.id.clone(), "C".into()).unwrap();
    update_entity(
        &conn,
        &parent.entity.id,
        EntityPatch {
            space_id: Some(b.id.clone()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(get_entity(&conn, &sub.entity.id).unwrap().space_id, b.id);
    assert_eq!(titles(&list_tasks(&conn, &b.id).unwrap()), vec!["P"]);
    assert!(list_tasks(&conn, &a.id).unwrap().is_empty());
}

// --- progress roll up -------------------------------------------------------------

#[test]
fn progress_is_none_without_sub_tasks() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    assert_eq!(subtask_progress(&conn, &parent.entity.id).unwrap(), None);
}

#[test]
fn progress_averages_doneness_including_cancelled_as_finished() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let ids: Vec<String> = (0..4)
        .map(|i| {
            create_subtask(&conn, parent.entity.id.clone(), format!("C{i}"))
                .unwrap()
                .entity
                .id
        })
        .collect();
    update_task_status(&conn, &ids[0], "done").unwrap();
    update_task_status(&conn, &ids[1], "cancelled").unwrap();
    update_task_status(&conn, &ids[2], "in_progress").unwrap();
    // (100 + 100 + 50 + 0) / 4
    assert_eq!(
        subtask_progress(&conn, &parent.entity.id).unwrap(),
        Some(62.5)
    );
}

#[test]
fn progress_is_none_when_every_sub_task_is_trashed() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let sub = create_subtask(&conn, parent.entity.id.clone(), "C".into()).unwrap();
    update_task_status(&conn, &sub.entity.id, "done").unwrap();
    soft_delete_entity(&conn, &sub.entity.id).unwrap();
    assert_eq!(subtask_progress(&conn, &parent.entity.id).unwrap(), None);
}

#[test]
fn a_parents_own_status_does_not_count_toward_its_progress() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    create_subtask(&conn, parent.entity.id.clone(), "C".into()).unwrap();
    update_task_status(&conn, &parent.entity.id, "done").unwrap();
    assert_eq!(
        subtask_progress(&conn, &parent.entity.id).unwrap(),
        Some(0.0)
    );
}

// --- converting a task to a sub-task ---------------------------------------------

#[test]
fn converting_keeps_id_and_fields_and_links_the_parent() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let t = create_task(
        &conn,
        space.id.clone(),
        "Loose".into(),
        None,
        Some("2026-06-01".into()),
    )
    .unwrap();
    update_task_effort(&conn, &t.entity.id, Some(3)).unwrap();
    update_task_status(&conn, &t.entity.id, "in_progress").unwrap();

    let converted = convert_to_subtask(&conn, &t.entity.id, &parent.entity.id).unwrap();
    assert_eq!(converted.entity.id, t.entity.id);
    assert_eq!(converted.entity.entity_type, "sub_task");
    assert_eq!(converted.entity.key, t.entity.key);
    assert_eq!(converted.status_id, "in_progress");
    assert_eq!(converted.effort, Some(3));
    assert_eq!(converted.due_date.as_deref(), Some("2026-06-01"));
    assert_eq!(
        parent_of(&conn, &t.entity.id),
        vec![parent.entity.id.clone()]
    );
    // It leaves the main list.
    assert_eq!(titles(&list_tasks(&conn, &space.id).unwrap()), vec!["P"]);
}

#[test]
fn converting_moves_the_task_into_its_parents_space() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let parent = task(&conn, &b.id, "P");
    let t = task(&conn, &a.id, "Loose");
    let converted = convert_to_subtask(&conn, &t.entity.id, &parent.entity.id).unwrap();
    assert_eq!(converted.entity.space_id, b.id);
    assert!(list_tasks(&conn, &a.id).unwrap().is_empty());
}

#[test]
fn a_task_with_sub_tasks_cannot_be_converted() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let t = task(&conn, &space.id, "Has kids");
    create_subtask(&conn, t.entity.id.clone(), "Kid".into()).unwrap();
    assert!(matches!(
        convert_to_subtask(&conn, &t.entity.id, &parent.entity.id),
        Err(AppError::CardinalityViolation(_))
    ));
    assert_eq!(get_entity(&conn, &t.entity.id).unwrap().entity_type, "task");
    assert!(parent_of(&conn, &t.entity.id).is_empty());
}

#[test]
fn a_task_cannot_become_its_own_sub_task() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "Self");
    assert!(matches!(
        convert_to_subtask(&conn, &t.entity.id, &t.entity.id),
        Err(AppError::CardinalityViolation(_))
    ));
    assert_eq!(get_entity(&conn, &t.entity.id).unwrap().entity_type, "task");
}

#[test]
fn a_sub_task_cannot_be_the_new_parent() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let parent = task(&conn, &space.id, "P");
    let sub = create_subtask(&conn, parent.entity.id.clone(), "C".into()).unwrap();
    let t = task(&conn, &space.id, "Loose");
    assert!(matches!(
        convert_to_subtask(&conn, &t.entity.id, &sub.entity.id),
        Err(AppError::CardinalityViolation(_))
    ));
}

#[test]
fn converting_a_sub_task_again_is_invalid() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let p1 = task(&conn, &space.id, "P1");
    let p2 = task(&conn, &space.id, "P2");
    let sub = create_subtask(&conn, p1.entity.id.clone(), "C".into()).unwrap();
    assert!(matches!(
        convert_to_subtask(&conn, &sub.entity.id, &p2.entity.id),
        Err(AppError::InvalidInput(_))
    ));
    assert_eq!(parent_of(&conn, &sub.entity.id), vec![p1.entity.id]);
}

#[test]
fn converting_to_an_unknown_parent_is_not_found_and_changes_nothing() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "Loose");
    assert!(matches!(
        convert_to_subtask(&conn, &t.entity.id, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert_eq!(get_entity(&conn, &t.entity.id).unwrap().entity_type, "task");
}

#[test]
fn parent_id_converts_once_and_cannot_be_undone_through_the_field() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let p1 = task(&conn, &space.id, "P1");
    let p2 = task(&conn, &space.id, "P2");
    let t = task(&conn, &space.id, "Loose");
    let task_def = crate::db::schema::lookup("task").unwrap();
    let sub_def = crate::db::schema::lookup("sub_task").unwrap();

    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("parentId".into(), serde_json::json!(p1.entity.id));
    (task_def.update)(&conn, &t.entity.id, &fields).unwrap();
    assert_eq!(
        get_entity(&conn, &t.entity.id).unwrap().entity_type,
        "sub_task"
    );

    // As a sub-task, parentId is not writable: setting it again re-parents nothing.
    assert!(
        !sub_def
            .fields
            .iter()
            .find(|f| f.name == "parentId")
            .unwrap()
            .writable_on_update
    );
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("parentId".into(), serde_json::json!(p2.entity.id));
    (sub_def.update)(&conn, &t.entity.id, &fields).unwrap();
    assert_eq!(parent_of(&conn, &t.entity.id), vec![p1.entity.id]);
    assert_eq!(
        get_entity(&conn, &t.entity.id).unwrap().entity_type,
        "sub_task"
    );
}

#[test]
fn cli_sub_task_create_requires_a_parent() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let def = crate::db::schema::lookup("sub_task").unwrap();
    let input = crate::db::schema::CreateInput {
        space_id: space.id.clone(),
        title: "Orphan".into(),
        fields: crate::db::schema::JsonMap::new(),
    };
    assert!((def.create)(&conn, input).is_err());
    assert_eq!(entity_count(&conn), 0);
}

#[test]
fn cli_task_list_requires_a_space() {
    let conn = test_conn();
    let def = crate::db::schema::lookup("task").unwrap();
    assert!(matches!(
        (def.list)(&conn, None, false),
        Err(AppError::InvalidInput(_))
    ));
}

// --- labels ----------------------------------------------------------------------

#[test]
fn get_task_with_labels_orders_by_name_and_plain_get_does_not_fill_them() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let t = task(&conn, &space.id, "T");
    let b = crate::db::labels::create_label(&conn, space.id.clone(), "beta".into(), "#111".into())
        .unwrap();
    let a = crate::db::labels::create_label(&conn, space.id.clone(), "alpha".into(), "#222".into())
        .unwrap();
    crate::db::labels::attach_label(&conn, &t.entity.id, &b.id).unwrap();
    crate::db::labels::attach_label(&conn, &t.entity.id, &a.id).unwrap();
    assert_eq!(
        get_task_with_labels(&conn, &t.entity.id).unwrap().label_ids,
        vec![a.id, b.id]
    );
    assert!(get_task(&conn, &t.entity.id).unwrap().label_ids.is_empty());
}

#[test]
fn a_task_relates_to_a_course_in_either_direction() {
    let conn = test_conn();
    let (space, course) = crate::db::test_space_with_course(&conn, "Uni", "Algo");
    let forward = task(&conn, &space.id, "Forward");
    let backward = task(&conn, &space.id, "Backward");
    crate::db::relationships::create_relationship(
        &conn,
        forward.entity.id.clone(),
        course.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    crate::db::relationships::create_relationship(
        &conn,
        course.id.clone(),
        backward.entity.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    let listed = list_tasks(&conn, &space.id).unwrap();
    assert!(listed
        .iter()
        .all(|t| t.course_ids == vec![course.id.clone()]));

    // A trashed Course no longer counts.
    soft_delete_entity(&conn, &course.id).unwrap();
    let listed = list_tasks(&conn, &space.id).unwrap();
    assert!(listed.iter().all(|t| t.course_ids.is_empty()));
}

#[test]
fn a_blocks_link_does_not_make_a_task_part_of_a_course() {
    let conn = test_conn();
    let (space, course) = crate::db::test_space_with_course(&conn, "Uni", "Algo");
    let t = task(&conn, &space.id, "T");
    crate::db::relationships::create_relationship(
        &conn,
        t.entity.id.clone(),
        course.id.clone(),
        "blocks".into(),
        None,
        None,
    )
    .unwrap();
    assert!(list_tasks(&conn, &space.id).unwrap()[0]
        .course_ids
        .is_empty());
}
