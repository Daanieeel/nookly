//! Spec tests for Labels (`docs/02-entity-model.md` "Labels").

use crate::db::entities::{empty_trash, get_entity, restore_entity, soft_delete_entity, Entity};
use crate::db::labels::*;
use crate::db::{test_conn, test_space, test_space_with_course};
use crate::error::AppError;
use rusqlite::Connection;

fn label(conn: &Connection, space_id: &str, name: &str) -> Label {
    create_label(conn, space_id.into(), name.into(), "#ff0000".into()).unwrap()
}

fn names(labels: &[Label]) -> Vec<String> {
    labels.iter().map(|l| l.name.clone()).collect()
}

fn note(conn: &Connection, space_id: &str) -> Entity {
    crate::db::notes::create_page(conn, space_id.into(), "note", "N".into()).unwrap()
}

#[test]
fn a_new_label_has_its_fields_and_no_usage() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let l = create_label(&conn, space.id.clone(), "Urgent".into(), "#abcdef".into()).unwrap();
    assert_eq!((l.name.as_str(), l.color.as_str()), ("Urgent", "#abcdef"));
    assert_eq!(l.space_id, space.id);
    assert_eq!(l.usage_count, 0);
    assert_eq!(
        names(&list_labels(&conn, &space.id).unwrap()),
        vec!["Urgent"]
    );
}

#[test]
fn labels_list_by_name() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    for n in ["zeta", "Alpha", "mid"] {
        label(&conn, &space.id, n);
    }
    assert_eq!(
        names(&list_labels(&conn, &space.id).unwrap()),
        vec!["Alpha", "mid", "zeta"]
    );
}

#[test]
fn rename_and_recolor_patch_only_what_is_given() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let l = label(&conn, &space.id, "Old");
    let renamed = update_label(&conn, &l.id, Some("New".into()), None).unwrap();
    assert_eq!(
        (renamed.name.as_str(), renamed.color.as_str()),
        ("New", "#ff0000")
    );
    let recolored = update_label(&conn, &l.id, None, Some("#00ff00".into())).unwrap();
    assert_eq!(
        (recolored.name.as_str(), recolored.color.as_str()),
        ("New", "#00ff00")
    );
    let both = update_label(&conn, &l.id, Some("Both".into()), Some("#0000ff".into())).unwrap();
    assert_eq!(
        (both.name.as_str(), both.color.as_str()),
        ("Both", "#0000ff")
    );
    assert_eq!(both.id, l.id);
    assert_eq!(both.created_at, l.created_at);
}

#[test]
fn renaming_keeps_attachments() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let n = note(&conn, &space.id);
    let l = label(&conn, &space.id, "Old");
    attach_label(&conn, &n.id, &l.id).unwrap();
    let renamed = update_label(&conn, &l.id, Some("New".into()), None).unwrap();
    assert_eq!(renamed.usage_count, 1);
    assert_eq!(
        names(&list_labels_for_entity(&conn, &n.id).unwrap()),
        vec!["New"]
    );
}

#[test]
fn updating_an_unknown_label_is_not_found() {
    let conn = test_conn();
    assert!(matches!(
        update_label(&conn, "ghost", Some("x".into()), None),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn labels_attach_to_every_entity_type() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "S", "Algo");
    let sid = space.id.clone();
    let task = crate::db::tasks::create_task(&conn, sid.clone(), "T".into(), None, None).unwrap();
    let sub = crate::db::tasks::create_subtask(&conn, task.entity.id.clone(), "C".into()).unwrap();
    let exam = crate::db::exams::create_exam(
        &conn,
        sid.clone(),
        "E".into(),
        course.id.clone(),
        None,
        None,
    )
    .unwrap();
    let block = crate::db::study_blocks::create_study_block(
        &conn,
        sid.clone(),
        "B".into(),
        exam.entity.id.clone(),
        "2026-01-01".into(),
        "09:00".into(),
        "10:00".into(),
    )
    .unwrap();
    let assignment = crate::db::assignments::create_assignment(
        &conn,
        sid.clone(),
        "A".into(),
        course.id.clone(),
        None,
    )
    .unwrap();
    let deck = crate::db::decks::create_deck(&conn, sid.clone(), "D".into(), None).unwrap();
    let bookmark =
        crate::db::bookmarks::create_bookmark(&conn, sid.clone(), "https://a.dev".into()).unwrap();
    let recipe = crate::db::recipes::create_recipe(&conn, sid.clone(), "R".into()).unwrap();
    let file =
        crate::db::entities::create_entity(&conn, sid.clone(), "file".into(), "f.pdf".into(), None)
            .unwrap();
    let jot = crate::db::notes::create_page(&conn, sid.clone(), "jot", "J".into()).unwrap();
    let n = note(&conn, &sid);
    let ids = vec![
        task.entity.id,
        sub.entity.id,
        course.id,
        exam.entity.id,
        block.entity.id,
        assignment.entity.id,
        deck.id,
        bookmark.entity.id,
        recipe.id,
        file.id,
        jot.id,
        n.id,
    ];
    let l = label(&conn, &sid, "Everywhere");
    for id in &ids {
        attach_label(&conn, id, &l.id).unwrap();
        assert_eq!(
            label_ids_for(&conn, id).unwrap(),
            vec![l.id.clone()],
            "{id}"
        );
    }
    assert_eq!(
        list_labels(&conn, &sid).unwrap()[0].usage_count,
        ids.len() as i64
    );
    assert_eq!(
        list_entities_for_label(&conn, &l.id, false).unwrap().len(),
        ids.len()
    );
    for id in &ids {
        detach_label(&conn, id, &l.id).unwrap();
        assert!(label_ids_for(&conn, id).unwrap().is_empty());
    }
    assert_eq!(list_labels(&conn, &sid).unwrap()[0].usage_count, 0);
}

#[test]
fn attaching_twice_keeps_one_attachment() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let n = note(&conn, &space.id);
    let l = label(&conn, &space.id, "x");
    attach_label(&conn, &n.id, &l.id).unwrap();
    attach_label(&conn, &n.id, &l.id).unwrap();
    assert_eq!(list_labels_for_entity(&conn, &n.id).unwrap().len(), 1);
    assert_eq!(list_labels(&conn, &space.id).unwrap()[0].usage_count, 1);
}

#[test]
fn detaching_an_unattached_label_is_harmless() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let n = note(&conn, &space.id);
    let l = label(&conn, &space.id, "x");
    detach_label(&conn, &n.id, &l.id).unwrap();
    assert!(list_labels_for_entity(&conn, &n.id).unwrap().is_empty());
}

#[test]
fn deleting_a_label_detaches_it_everywhere_but_keeps_the_entities() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let n1 = note(&conn, &space.id);
    let n2 = note(&conn, &space.id);
    let gone = label(&conn, &space.id, "gone");
    let kept = label(&conn, &space.id, "kept");
    for n in [&n1, &n2] {
        attach_label(&conn, &n.id, &gone.id).unwrap();
        attach_label(&conn, &n.id, &kept.id).unwrap();
    }
    delete_label(&conn, &gone.id).unwrap();
    assert_eq!(names(&list_labels(&conn, &space.id).unwrap()), vec!["kept"]);
    for n in [&n1, &n2] {
        assert_eq!(label_ids_for(&conn, &n.id).unwrap(), vec![kept.id.clone()]);
        assert!(get_entity(&conn, &n.id).unwrap().deleted_at.is_none());
    }
    let rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM entity_labels WHERE label_id = ?1",
            [&gone.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(rows, 0);
}

#[test]
fn the_same_name_in_two_spaces_is_two_labels() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let la = label(&conn, &a.id, "Algorithms");
    let lb = label(&conn, &b.id, "Algorithms");
    assert_ne!(la.id, lb.id);
    assert_eq!(list_labels(&conn, &a.id).unwrap()[0].id, la.id);
    assert_eq!(list_labels(&conn, &b.id).unwrap()[0].id, lb.id);
    update_label(&conn, &la.id, Some("Algo".into()), None).unwrap();
    assert_eq!(list_labels(&conn, &b.id).unwrap()[0].name, "Algorithms");
}

#[test]
fn duplicate_names_within_one_space_are_refused() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    label(&conn, &space.id, "Dup");
    // Names are unique per Space, compared ignoring case (chosen reading).
    for name in ["Dup", "dup", "DUP"] {
        let second = create_label(&conn, space.id.clone(), name.into(), "#000".into());
        assert!(second.is_err(), "duplicate {name:?} was created");
    }
    assert_eq!(list_labels(&conn, &space.id).unwrap().len(), 1);
    // The same name in another Space stays allowed.
    let other = test_space(&conn, "T");
    assert!(create_label(&conn, other.id.clone(), "Dup".into(), "#000".into()).is_ok());
}

#[test]
fn renaming_a_label_to_an_existing_name_is_refused() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    label(&conn, &space.id, "Taken");
    let other = label(&conn, &space.id, "Other");
    assert!(update_label(&conn, &other.id, Some("taken".into()), None).is_err());
    assert_eq!(list_labels(&conn, &space.id).unwrap().len(), 2);
    assert!(list_labels(&conn, &space.id)
        .unwrap()
        .iter()
        .any(|l| l.id == other.id && l.name == "Other"));
    // Keeping its own name (or only recoloring) is still fine.
    assert!(update_label(&conn, &other.id, Some("Other".into()), Some("#111".into())).is_ok());
}

#[test]
fn a_label_from_another_space_cannot_be_attached() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let n = note(&conn, &a.id);
    let foreign = label(&conn, &b.id, "Foreign");
    // Labels are strictly siloed per Space.
    let result = attach_label(&conn, &n.id, &foreign.id);
    assert!(result.is_err(), "a label from another space was attached");
    assert!(list_labels_for_entity(&conn, &n.id).unwrap().is_empty());
}

#[test]
fn usage_counts_only_live_entities() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let n1 = note(&conn, &space.id);
    let n2 = note(&conn, &space.id);
    let l = label(&conn, &space.id, "x");
    attach_label(&conn, &n1.id, &l.id).unwrap();
    attach_label(&conn, &n2.id, &l.id).unwrap();
    soft_delete_entity(&conn, &n1.id).unwrap();
    assert_eq!(list_labels(&conn, &space.id).unwrap()[0].usage_count, 1);
    restore_entity(&conn, &n1.id).unwrap();
    assert_eq!(list_labels(&conn, &space.id).unwrap()[0].usage_count, 2);
}

#[test]
fn trash_and_restore_keep_an_entitys_labels() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let n = note(&conn, &space.id);
    let l = label(&conn, &space.id, "x");
    attach_label(&conn, &n.id, &l.id).unwrap();
    soft_delete_entity(&conn, &n.id).unwrap();
    assert_eq!(label_ids_for(&conn, &n.id).unwrap(), vec![l.id.clone()]);
    restore_entity(&conn, &n.id).unwrap();
    assert_eq!(label_ids_for(&conn, &n.id).unwrap(), vec![l.id]);
}

#[test]
fn empty_trash_drops_the_attachment_but_keeps_the_label() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let n = note(&conn, &space.id);
    let l = label(&conn, &space.id, "x");
    attach_label(&conn, &n.id, &l.id).unwrap();
    soft_delete_entity(&conn, &n.id).unwrap();
    empty_trash(&conn).unwrap();
    assert_eq!(names(&list_labels(&conn, &space.id).unwrap()), vec!["x"]);
    assert!(list_entities_for_label(&conn, &l.id, true)
        .unwrap()
        .is_empty());
}

#[test]
fn entity_label_map_is_space_scoped_and_skips_trash() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    let na = note(&conn, &a.id);
    let trashed = note(&conn, &a.id);
    let nb = note(&conn, &b.id);
    let la = label(&conn, &a.id, "a");
    let lb = label(&conn, &b.id, "b");
    attach_label(&conn, &na.id, &la.id).unwrap();
    attach_label(&conn, &trashed.id, &la.id).unwrap();
    attach_label(&conn, &nb.id, &lb.id).unwrap();
    soft_delete_entity(&conn, &trashed.id).unwrap();
    let map = list_entity_label_ids(&conn, &a.id).unwrap();
    assert_eq!(map.len(), 1);
    assert_eq!(map[&na.id], vec![la.id]);
}

#[test]
fn entities_for_a_label_list_in_creation_order() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let l = label(&conn, &space.id, "x");
    let mut expected = Vec::new();
    for i in 0..5 {
        let e = crate::db::entities::create_entity(
            &conn,
            space.id.clone(),
            "note".into(),
            format!("N{i}"),
            None,
        )
        .unwrap();
        expected.push(e.id.clone());
    }
    for id in expected.iter().rev() {
        attach_label(&conn, id, &l.id).unwrap();
    }
    let listed: Vec<String> = list_entities_for_label(&conn, &l.id, false)
        .unwrap()
        .into_iter()
        .map(|e| e.id)
        .collect();
    assert_eq!(listed, expected);
}

#[test]
fn unicode_and_long_names_round_trip() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let long = "ラベル".repeat(1000);
    for n in ["Wichtig ❗", long.as_str(), ""] {
        let l = label(&conn, &space.id, n);
        let found = list_labels(&conn, &space.id)
            .unwrap()
            .into_iter()
            .find(|x| x.id == l.id)
            .unwrap();
        assert_eq!(found.name, n);
    }
}
