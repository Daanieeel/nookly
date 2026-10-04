//! Spec tests for the relationship engine (`docs/02-entity-model.md`,
//! "Relationship System Implementation" and "Structural Relationships").

use crate::db::entities::{
    create_entity, empty_trash, get_entity, restore_entity, soft_delete_entity, Entity,
};
use crate::db::relationships::*;
use crate::db::{test_conn, test_space};
use crate::error::AppError;
use rusqlite::{params, Connection};

inventory::submit! {
    RelationshipTypeDef { name: "rtests-one-from-per-to", label: "Test", description: "Test type.", from_type: None, to_type: None, inverse_label: "test inverse", cardinality: Cardinality::OneFromPerTo, moves_with: MovesWith::Independent }
}

fn note(conn: &Connection, space_id: &str, title: &str) -> Entity {
    create_entity(conn, space_id.into(), "note".into(), title.into(), None).unwrap()
}

fn link(conn: &Connection, from: &str, to: &str, kind: &str) -> Relationship {
    create_relationship(conn, from.into(), to.into(), kind.into(), None, None).unwrap()
}

fn relationship_rows(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM relationships", [], |r| r.get(0))
        .unwrap()
}

fn ids(rels: &[Relationship]) -> Vec<String> {
    rels.iter().map(|r| r.id.clone()).collect()
}

#[test]
fn a_link_is_stored_once_with_its_direction() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");

    let rel = link(&conn, &a.id, &b.id, "relates-to");
    assert_eq!(rel.from_entity_id, a.id);
    assert_eq!(rel.to_entity_id, b.id);
    assert_eq!(rel.relationship_type, "relates-to");
    assert!(rel.from_block_id.is_none() && rel.to_block_id.is_none());
    assert!(!rel.created_at.is_empty());
    // The inverse is derived, never stored a second time.
    assert_eq!(relationship_rows(&conn), 1);
}

#[test]
fn listing_respects_direction() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let rel = link(&conn, &a.id, &b.id, "blocks");

    assert_eq!(
        ids(&list_relationships(&conn, &a.id, Direction::From).unwrap()),
        vec![rel.id.clone()]
    );
    assert!(list_relationships(&conn, &a.id, Direction::To)
        .unwrap()
        .is_empty());
    assert_eq!(
        ids(&list_relationships(&conn, &b.id, Direction::To).unwrap()),
        vec![rel.id.clone()]
    );
    assert!(list_relationships(&conn, &b.id, Direction::From)
        .unwrap()
        .is_empty());
}

#[test]
fn both_direction_listing_returns_outgoing_and_incoming() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let c = note(&conn, &space.id, "C");
    let out = link(&conn, &a.id, &b.id, "relates-to");
    let inc = link(&conn, &c.id, &a.id, "blocks");

    let both = list_relationships(&conn, &a.id, Direction::Both).unwrap();
    assert_eq!(ids(&both), vec![out.id, inc.id]);
    // B only sees the edge it takes part in.
    assert_eq!(
        list_relationships(&conn, &b.id, Direction::Both)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn listing_is_ordered_by_creation() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let hub = note(&conn, &space.id, "Hub");
    let mut expected = Vec::new();
    for i in 0..10 {
        let other = note(&conn, &space.id, &format!("N{i}"));
        expected.push(link(&conn, &hub.id, &other.id, "relates-to").id);
    }
    let listed = list_relationships(&conn, &hub.id, Direction::From).unwrap();
    assert_eq!(ids(&listed), expected);
    // Stable across reads.
    let again = list_relationships(&conn, &hub.id, Direction::From).unwrap();
    assert_eq!(ids(&again), expected);
}

#[test]
fn an_entity_cannot_relate_to_itself() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    // Self relations are forbidden for every relationship type.
    let r = create_relationship(
        &conn,
        a.id.clone(),
        a.id.clone(),
        "relates-to".into(),
        None,
        None,
    );
    assert!(r.is_err(), "a self link was stored");
    assert_eq!(relationship_rows(&conn), 0);
}

#[test]
fn no_relationship_type_allows_a_self_link() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    for info in list_relationship_types() {
        // Only types whose two ends accept the same entity type can be tried.
        if info.from_type != info.to_type {
            continue;
        }
        let kind = info.from_type.clone().unwrap_or_else(|| "note".into());
        let Ok(e) = create_entity(&conn, space.id.clone(), kind, "E".into(), None) else {
            continue;
        };
        let r = create_relationship(
            &conn,
            e.id.clone(),
            e.id.clone(),
            info.name.clone(),
            None,
            None,
        );
        assert!(r.is_err(), "'{}' allowed a self link", info.name);
    }
    assert_eq!(relationship_rows(&conn), 0);
}

#[test]
fn unlink_removes_only_that_edge() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let gone = link(&conn, &a.id, &b.id, "relates-to");
    let kept = link(&conn, &a.id, &b.id, "blocks");

    delete_relationship(&conn, &gone.id).unwrap();

    assert_eq!(
        ids(&list_relationships(&conn, &a.id, Direction::Both).unwrap()),
        vec![kept.id]
    );
    // Unlinking never touches the entities themselves.
    assert!(get_entity(&conn, &a.id).unwrap().deleted_at.is_none());
    assert!(get_entity(&conn, &b.id).unwrap().deleted_at.is_none());
}

#[test]
fn unlinking_an_unknown_relationship_is_not_found() {
    let conn = test_conn();
    assert!(matches!(
        delete_relationship(&conn, "missing"),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn unlinking_twice_is_not_found_the_second_time() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let rel = link(&conn, &a.id, &b.id, "relates-to");
    delete_relationship(&conn, &rel.id).unwrap();
    assert!(matches!(
        delete_relationship(&conn, &rel.id),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn identical_unrestricted_links_are_stored_once() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let first = link(&conn, &a.id, &b.id, "relates-to");
    // The same (from, to, type) edge never exists twice: creating it again
    // returns the existing relationship.
    let dup = create_relationship(
        &conn,
        a.id.clone(),
        b.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    assert_eq!(dup.id, first.id);
    assert_eq!(relationship_rows(&conn), 1);
}

#[test]
fn opposite_directions_are_distinct_edges() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let ab = link(&conn, &a.id, &b.id, "blocks");
    let ba = link(&conn, &b.id, &a.id, "blocks");
    assert_ne!(ab.id, ba.id);
    assert_eq!(
        list_relationships(&conn, &a.id, Direction::From).unwrap()[0].to_entity_id,
        b.id
    );
    assert_eq!(
        list_relationships(&conn, &b.id, Direction::From).unwrap()[0].to_entity_id,
        a.id
    );
}

#[test]
fn unknown_from_or_to_entity_is_not_found_and_stores_nothing() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");

    let missing_to = create_relationship(
        &conn,
        a.id.clone(),
        "ghost".into(),
        "relates-to".into(),
        None,
        None,
    );
    assert!(matches!(missing_to, Err(AppError::NotFound(_))));
    let missing_from = create_relationship(
        &conn,
        "ghost".into(),
        a.id.clone(),
        "relates-to".into(),
        None,
        None,
    );
    assert!(matches!(missing_from, Err(AppError::NotFound(_))));
    assert_eq!(relationship_rows(&conn), 0);
}

#[test]
fn unknown_type_stores_nothing() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    for bad in ["", "Relates-To", "relates_to", "relates-to ", "parent-of"] {
        let result = create_relationship(&conn, a.id.clone(), b.id.clone(), bad.into(), None, None);
        assert!(
            matches!(result, Err(AppError::UnknownRelationshipType(_))),
            "{bad:?} was accepted"
        );
    }
    assert_eq!(relationship_rows(&conn), 0);
}

#[test]
fn every_core_and_module_type_is_registered() {
    let names: Vec<String> = list_relationship_types()
        .into_iter()
        .map(|t| t.name)
        .collect();
    for expected in [
        "relates-to",
        "blocks",
        "attached-file",
        "sub-task-of",
        "session-course",
        "exam-course",
        "study-block-exam",
        "assignment-course",
        "deck-exam",
        "sequel-of",
        "course-semester",
    ] {
        assert!(names.iter().any(|n| n == expected), "{expected} missing");
    }
    let mut unique = names.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), names.len(), "a type is registered twice");
}

#[test]
fn every_registered_type_has_labels_for_both_directions() {
    for t in list_relationship_types() {
        assert!(!t.label.is_empty(), "{} has no label", t.name);
        assert!(
            !t.inverse_label.is_empty(),
            "{} has no inverse label",
            t.name
        );
        assert!(!t.description.is_empty(), "{} has no description", t.name);
    }
}

#[test]
fn structural_types_declare_their_end_types() {
    let expect = |name: &str, from: &str, to: &str| {
        let def = lookup_relationship_type(name).unwrap();
        assert_eq!(def.from_type, Some(from), "{name} from");
        assert_eq!(def.to_type, Some(to), "{name} to");
        assert_eq!(def.cardinality, Cardinality::OneToPerFrom, "{name}");
        assert_eq!(def.moves_with, MovesWith::FromFollowsTo, "{name}");
    };
    expect("sub-task-of", "sub_task", "task");
    expect("session-course", "session", "course");
    expect("exam-course", "exam", "course");
    expect("study-block-exam", "study_block", "exam");
    expect("assignment-course", "assignment", "course");
}

#[test]
fn generic_types_are_unrestricted_and_untyped() {
    for name in ["relates-to", "blocks", "attached-file"] {
        let def = lookup_relationship_type(name).unwrap();
        assert_eq!(def.cardinality, Cardinality::Unrestricted);
        assert_eq!(def.moves_with, MovesWith::Independent);
        assert!(def.from_type.is_none() && def.to_type.is_none());
    }
    assert!(lookup_relationship_type("nope").is_none());
}

#[test]
fn generic_links_have_unrestricted_cardinality() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let hub = note(&conn, &space.id, "Hub");
    for i in 0..5 {
        let other = note(&conn, &space.id, &format!("N{i}"));
        link(&conn, &hub.id, &other.id, "relates-to");
        link(&conn, &other.id, &hub.id, "relates-to");
    }
    assert_eq!(
        list_relationships(&conn, &hub.id, Direction::Both)
            .unwrap()
            .len(),
        10
    );
}

#[test]
fn one_from_per_to_allows_a_single_incoming_edge() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let target = note(&conn, &space.id, "T");
    link(&conn, &a.id, &target.id, "rtests-one-from-per-to");
    let second = create_relationship(
        &conn,
        b.id.clone(),
        target.id.clone(),
        "rtests-one-from-per-to".into(),
        None,
        None,
    );
    assert!(matches!(second, Err(AppError::CardinalityViolation(_))));
    // The same source may still point at a different target.
    let other_target = note(&conn, &space.id, "T2");
    link(&conn, &a.id, &other_target.id, "rtests-one-from-per-to");
    assert_eq!(relationship_rows(&conn), 2);
}

#[test]
fn cardinality_frees_up_after_unlink() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let c = note(&conn, &space.id, "C");
    let first = link(&conn, &a.id, &b.id, "rtests-one-from-per-to");
    delete_relationship(&conn, &first.id).unwrap();
    link(&conn, &c.id, &b.id, "rtests-one-from-per-to");
}

#[test]
fn structural_type_rejects_wrong_end_types() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    // An Exam must have exactly one Course; a Note is neither end.
    let result = create_relationship(
        &conn,
        a.id.clone(),
        b.id.clone(),
        "exam-course".into(),
        None,
        None,
    );
    assert!(
        result.is_err(),
        "exam-course was accepted between two notes"
    );
    assert_eq!(relationship_rows(&conn), 0);
}

#[test]
fn generic_link_cannot_nest_sub_tasks_two_levels_deep() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let top =
        crate::db::tasks::create_task(&conn, space.id.clone(), "Top".into(), None, None).unwrap();
    let middle =
        crate::db::tasks::create_task(&conn, space.id.clone(), "Middle".into(), None, None)
            .unwrap();
    crate::db::tasks::create_subtask(&conn, middle.entity.id.clone(), "Leaf".into()).unwrap();

    // Nesting is one level deep only, enforced at the data layer: a Task that
    // already has Sub-tasks can't become a Sub-task through the raw link either.
    let result = create_relationship(
        &conn,
        middle.entity.id.clone(),
        top.entity.id.clone(),
        "sub-task-of".into(),
        None,
        None,
    );
    assert!(result.is_err(), "sub-task-of created a two level nesting");
}

#[test]
fn links_may_cross_spaces() {
    let conn = test_conn();
    let s1 = test_space(&conn, "One");
    let s2 = test_space(&conn, "Two");
    let a = note(&conn, &s1.id, "A");
    let b = note(&conn, &s2.id, "B");
    let rel = link(&conn, &a.id, &b.id, "relates-to");
    assert_eq!(
        ids(&list_relationships(&conn, &b.id, Direction::To).unwrap()),
        vec![rel.id]
    );
}

#[test]
fn soft_delete_keeps_the_link_in_the_graph() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let rel = link(&conn, &a.id, &b.id, "relates-to");

    soft_delete_entity(&conn, &b.id).unwrap();
    // Deleting never removes an entity from the graph.
    assert_eq!(
        ids(&list_relationships(&conn, &a.id, Direction::From).unwrap()),
        vec![rel.id.clone()]
    );
    assert_eq!(
        ids(&list_relationships(&conn, &b.id, Direction::To).unwrap()),
        vec![rel.id.clone()]
    );

    restore_entity(&conn, &b.id).unwrap();
    assert_eq!(
        ids(&list_relationships(&conn, &a.id, Direction::From).unwrap()),
        vec![rel.id]
    );
}

#[test]
fn soft_deleting_one_end_does_not_trash_the_other() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    link(&conn, &a.id, &b.id, "relates-to");
    soft_delete_entity(&conn, &a.id).unwrap();
    assert!(get_entity(&conn, &b.id).unwrap().deleted_at.is_none());
}

#[test]
fn a_trashed_entity_can_still_be_linked() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    soft_delete_entity(&conn, &b.id).unwrap();
    // Trashed entities stay in pickers, so linking to one works.
    link(&conn, &a.id, &b.id, "relates-to");
    assert_eq!(relationship_rows(&conn), 1);
}

#[test]
fn empty_trash_drops_the_edges_of_purged_entities_only() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let c = note(&conn, &space.id, "C");
    link(&conn, &a.id, &b.id, "relates-to");
    let kept = link(&conn, &a.id, &c.id, "relates-to");
    soft_delete_entity(&conn, &b.id).unwrap();

    assert_eq!(empty_trash(&conn).unwrap(), 1);

    assert_eq!(
        ids(&list_relationships(&conn, &a.id, Direction::Both).unwrap()),
        vec![kept.id]
    );
    assert!(list_relationships(&conn, &b.id, Direction::Both)
        .unwrap()
        .is_empty());
}

#[test]
fn listing_an_unknown_entity_is_empty() {
    let conn = test_conn();
    assert!(list_relationships(&conn, "ghost", Direction::Both)
        .unwrap()
        .is_empty());
}

#[test]
fn only_one_block_end_may_be_set() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let b = note(&conn, &space.id, "B");
    let rel = create_relationship(
        &conn,
        a.id.clone(),
        b.id.clone(),
        "relates-to".into(),
        None,
        Some("blk-9".into()),
    )
    .unwrap();
    assert!(rel.from_block_id.is_none());
    let listed = list_relationships(&conn, &b.id, Direction::To).unwrap();
    assert_eq!(listed[0].to_block_id.as_deref(), Some("blk-9"));
}

#[test]
fn moving_an_independent_entity_keeps_its_links() {
    let conn = test_conn();
    let s1 = test_space(&conn, "One");
    let s2 = test_space(&conn, "Two");
    let a = note(&conn, &s1.id, "A");
    let b = note(&conn, &s1.id, "B");
    let rel = link(&conn, &a.id, &b.id, "relates-to");
    crate::db::entities::update_entity(
        &conn,
        &a.id,
        crate::db::entities::EntityPatch {
            space_id: Some(s2.id.clone()),
            ..Default::default()
        },
    )
    .unwrap();
    // B is independent, so it stays where it was; the link survives the move.
    assert_eq!(get_entity(&conn, &b.id).unwrap().space_id, s1.id);
    assert_eq!(
        ids(&list_relationships(&conn, &a.id, Direction::From).unwrap()),
        vec![rel.id]
    );
}

#[test]
fn relationship_counts_follow_link_and_unlink() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let a = note(&conn, &space.id, "A");
    let count = |conn: &Connection| {
        list_relationships(conn, &a.id, Direction::Both)
            .unwrap()
            .len()
    };
    let mut made = Vec::new();
    for i in 0..4 {
        let other = note(&conn, &space.id, &format!("N{i}"));
        made.push(link(&conn, &a.id, &other.id, "attached-file"));
        assert_eq!(count(&conn), i + 1);
    }
    for (i, rel) in made.iter().enumerate() {
        delete_relationship(&conn, &rel.id).unwrap();
        assert_eq!(count(&conn), 3 - i);
    }
    let rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM relationships WHERE from_entity_id = ?1",
            params![a.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(rows, 0);
}
