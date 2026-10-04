//! Tests for Spaces and per-Space module rows (`docs/04-navigation-spaces.md`,
//! `docs/01-philosophy.md` "Module Config Is Always Global").
//! Spaces have no Trash of their own: `delete_space` is permanent, so there
//! is no Space restore to test.

use crate::db::entities::{
    create_entity, get_entity, list_entities, restore_entity, soft_delete_entity,
};
use crate::db::space_modules::*;
use crate::db::spaces::*;
use crate::db::{test_conn, test_space};
use crate::error::AppError;
use rusqlite::Connection;

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn names(conn: &Connection) -> Vec<String> {
    list_spaces(conn)
        .unwrap()
        .into_iter()
        .map(|s| s.name)
        .collect()
}

#[test]
fn spaces_join_at_the_end_of_the_sidebar() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let c = test_space(&conn, "C");
    assert_eq!((a.position, b.position, c.position), (0, 1, 2));
    assert_eq!(names(&conn), vec!["A", "B", "C"]);
}

#[test]
fn reorder_applies_the_drop_and_ignores_unknown_ids() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let c = test_space(&conn, "C");
    reorder_spaces(
        &conn,
        vec![c.id.clone(), "ghost".into(), a.id.clone(), b.id.clone()],
    )
    .unwrap();
    assert_eq!(names(&conn), vec!["C", "A", "B"]);
    // A new space still goes last.
    test_space(&conn, "D");
    assert_eq!(names(&conn).last().unwrap(), "D");
}

#[test]
fn update_space_sets_icon_and_color() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    let u = update_space(
        &conn,
        &s.id,
        SpacePatch {
            name: None,
            icon: Some("🏠".into()),
            color: Some("#123456".into()),
        },
    )
    .unwrap();
    assert_eq!(
        (u.name.as_str(), u.icon.as_deref(), u.color.as_str()),
        ("S", Some("🏠"), "#123456")
    );
    assert_eq!(list_spaces(&conn).unwrap()[0].color, "#123456");
}

#[test]
fn update_unknown_space_is_not_found() {
    let conn = test_conn();
    assert!(matches!(
        update_space(&conn, "ghost", SpacePatch::default()),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn unicode_and_long_space_names_round_trip() {
    let conn = test_conn();
    let long = "Studium ".repeat(500);
    test_space(&conn, "Uni 🎓 Zürich");
    test_space(&conn, &long);
    assert_eq!(names(&conn), vec!["Uni 🎓 Zürich".to_string(), long]);
}

#[test]
fn deleting_a_space_leaves_other_spaces_untouched() {
    let conn = test_conn();
    let gone = test_space(&conn, "Gone");
    let kept = test_space(&conn, "Kept");
    let a = create_entity(&conn, gone.id.clone(), "note".into(), "A".into(), None).unwrap();
    let b = create_entity(&conn, kept.id.clone(), "note".into(), "B".into(), None).unwrap();
    let c = create_entity(&conn, kept.id.clone(), "note".into(), "C".into(), None).unwrap();
    crate::db::relationships::create_relationship(
        &conn,
        a.id.clone(),
        b.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    let kept_rel = crate::db::relationships::create_relationship(
        &conn,
        b.id.clone(),
        c.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    let kept_label =
        crate::db::labels::create_label(&conn, kept.id.clone(), "k".into(), "#000".into()).unwrap();
    crate::db::labels::attach_label(&conn, &b.id, &kept_label.id).unwrap();

    delete_space(&conn, &gone.id).unwrap();

    assert_eq!(names(&conn), vec!["Kept"]);
    assert!(get_entity(&conn, &a.id).is_err());
    // A cross-space link into the deleted Space is gone, the other one stays.
    let rels = crate::db::relationships::list_relationships(
        &conn,
        &b.id,
        crate::db::relationships::Direction::Both,
    )
    .unwrap();
    assert_eq!(rels.len(), 1);
    assert_eq!(rels[0].id, kept_rel.id);
    assert_eq!(
        crate::db::labels::label_ids_for(&conn, &b.id).unwrap(),
        vec![kept_label.id]
    );
    assert_eq!(list_space_modules(&conn, &kept.id).unwrap(), vec!["notes"]);
}

#[test]
fn deleting_a_space_removes_its_module_rows_and_index_entries() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    crate::db::tasks::create_task(&conn, s.id.clone(), "T".into(), None, None).unwrap();
    let d = crate::db::decks::create_deck(&conn, s.id.clone(), "D".into(), None).unwrap();
    crate::db::decks::create_card(&conn, d.id.clone(), "q".into(), "a".into()).unwrap();
    delete_space(&conn, &s.id).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM space_modules"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM search_index"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM tasks"), 0);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_cards"), 0);
}

#[test]
fn a_space_with_a_recipe_can_be_deleted() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    let r = crate::db::recipes::create_recipe(&conn, s.id.clone(), "R".into()).unwrap();
    crate::db::recipes::create_ingredient(&conn, r.id.clone(), "a".into()).unwrap();
    crate::db::recipes::create_step(&conn, r.id.clone(), "s".into(), None).unwrap();
    // delete_space removes everything in the Space, whatever module it is from.
    delete_space(&conn, &s.id).unwrap();
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM entities"), 0);
    for table in ["recipes", "recipe_ingredients", "recipe_steps"] {
        assert_eq!(
            count(&conn, &format!("SELECT COUNT(*) FROM {table}")),
            0,
            "{table}"
        );
    }
}

#[test]
fn a_failed_space_delete_loses_no_data() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    let note = crate::db::notes::create_page(&conn, s.id.clone(), "note", "Diary".into()).unwrap();
    crate::db::notes::create_block(
        &conn,
        &note.id,
        "paragraph".into(),
        "precious".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let task = crate::db::tasks::create_task(&conn, s.id.clone(), "T".into(), None, None).unwrap();
    crate::db::relationships::create_relationship(
        &conn,
        task.entity.id.clone(),
        note.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    crate::db::recipes::create_recipe(&conn, s.id.clone(), "R".into()).unwrap();
    let blocks = count(&conn, "SELECT COUNT(*) FROM blocks");
    let tasks = count(&conn, "SELECT COUNT(*) FROM tasks");
    let rels = count(&conn, "SELECT COUNT(*) FROM relationships");

    if delete_space(&conn, &s.id).is_err() {
        // All or nothing: a delete that fails must leave every row in place.
        assert_eq!(names(&conn), vec!["S"]);
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM blocks"),
            blocks,
            "note content was lost"
        );
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM tasks"),
            tasks,
            "task rows were lost"
        );
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM relationships"),
            rels,
            "links were lost"
        );
    }
}

// --- module config is global ----------------------------------------------------

#[test]
fn module_config_has_no_space_dimension() {
    let conn = test_conn();
    test_space(&conn, "A");
    test_space(&conn, "B");
    for table in ["task_statuses", "recipe_tags"] {
        let cols = count(
            &conn,
            &format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = 'space_id'"),
        );
        assert_eq!(cols, 0, "{table} is per space");
    }
}

// --- space modules ----------------------------------------------------------------

#[test]
fn modules_list_in_the_order_they_were_added() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    add_space_module(&conn, &s.id, "notes").unwrap();
    crate::db::tasks::create_task(&conn, s.id.clone(), "T".into(), None, None).unwrap();
    add_space_module(&conn, &s.id, "bookmarks").unwrap();
    assert_eq!(
        list_space_modules(&conn, &s.id).unwrap(),
        vec!["notes", "tasks", "bookmarks"]
    );
}

#[test]
fn reordering_modules_never_adds_one() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    add_space_module(&conn, &s.id, "notes").unwrap();
    add_space_module(&conn, &s.id, "tasks").unwrap();
    reorder_space_modules(
        &conn,
        &s.id,
        vec!["files".into(), "tasks".into(), "notes".into()],
    )
    .unwrap();
    assert_eq!(
        list_space_modules(&conn, &s.id).unwrap(),
        vec!["tasks", "notes"]
    );
}

#[test]
fn modules_are_added_per_space() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    add_space_module(&conn, &a.id, "tasks").unwrap();
    crate::db::recipes::create_recipe(&conn, a.id.clone(), "R".into()).unwrap();
    assert_eq!(
        list_space_modules(&conn, &a.id).unwrap(),
        vec!["tasks", "recipes"]
    );
    assert!(list_space_modules(&conn, &b.id).unwrap().is_empty());
}

#[test]
fn removing_a_module_in_one_space_leaves_the_other_alone() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    crate::db::tasks::create_task(&conn, a.id.clone(), "TA".into(), None, None).unwrap();
    let tb = crate::db::tasks::create_task(&conn, b.id.clone(), "TB".into(), None, None).unwrap();
    remove_space_module(&conn, &a.id, "tasks", true).unwrap();
    assert_eq!(list_space_modules(&conn, &b.id).unwrap(), vec!["tasks"]);
    assert!(get_entity(&conn, &tb.entity.id)
        .unwrap()
        .deleted_at
        .is_none());
}

#[test]
fn a_module_readded_after_removal_keeps_its_place() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    add_space_module(&conn, &s.id, "tasks").unwrap();
    add_space_module(&conn, &s.id, "notes").unwrap();
    remove_space_module(&conn, &s.id, "tasks", false).unwrap();
    assert_eq!(list_space_modules(&conn, &s.id).unwrap(), vec!["notes"]);
    add_space_module(&conn, &s.id, "tasks").unwrap();
    assert_eq!(
        list_space_modules(&conn, &s.id).unwrap(),
        vec!["tasks", "notes"]
    );
}

#[test]
fn hidden_content_is_untouched_by_empty_trash_but_trashed_content_goes() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    let t =
        crate::db::tasks::create_task(&conn, s.id.clone(), "Hidden".into(), None, None).unwrap();
    let b =
        crate::db::bookmarks::create_bookmark(&conn, s.id.clone(), "https://a.dev".into()).unwrap();
    remove_space_module(&conn, &s.id, "tasks", false).unwrap();
    remove_space_module(&conn, &s.id, "bookmarks", true).unwrap();
    assert_eq!(crate::db::entities::empty_trash(&conn).unwrap(), 1);
    assert!(get_entity(&conn, &b.entity.id).is_err());
    add_space_module(&conn, &s.id, "tasks").unwrap();
    assert!(get_entity(&conn, &t.entity.id)
        .unwrap()
        .deleted_at
        .is_none());
}

#[test]
fn trashed_module_content_can_be_restored_one_by_one() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    let n1 = crate::db::notes::create_page(&conn, s.id.clone(), "note", "N1".into()).unwrap();
    crate::db::notes::create_page(&conn, s.id.clone(), "note", "N2".into()).unwrap();
    remove_space_module(&conn, &s.id, "notes", true).unwrap();
    restore_entity(&conn, &n1.id).unwrap();
    let live: Vec<String> = list_entities(&conn, Some(&s.id), false)
        .unwrap()
        .into_iter()
        .map(|e| e.title)
        .collect();
    assert_eq!(live, vec!["N1"]);
}

#[test]
fn removal_does_not_retrash_already_trashed_content() {
    let conn = test_conn();
    let s = test_space(&conn, "S");
    let t = crate::db::tasks::create_task(&conn, s.id.clone(), "T".into(), None, None).unwrap();
    soft_delete_entity(&conn, &t.entity.id).unwrap();
    let before = get_entity(&conn, &t.entity.id).unwrap().deleted_at;
    remove_space_module(&conn, &s.id, "tasks", true).unwrap();
    assert_eq!(get_entity(&conn, &t.entity.id).unwrap().deleted_at, before);
}
