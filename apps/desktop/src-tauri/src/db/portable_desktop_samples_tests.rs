//! The Nookly files this app writes, kept as samples (`packages/shared/src/generated/desktop-samples`)
//! that the phone's reader is tested against (`portable-import.test.ts`), the other way round
//! from `portable_phone_tests.rs`. A change to what the desktop writes fails here until the
//! samples are made again, so the phone's tests see it:
//!
//!     NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib db::portable_desktop_samples_tests

use crate::db::block_types::BlockAttrs;
use crate::db::tasks::{RepeatRule, RepeatUnit};
use crate::db::{assignments, decks, notes, portable, tasks, test_conn, test_space_with_course};

const DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/shared/src/generated/desktop-samples"
);

fn check(name: &str, text: &str) {
    let path = format!("{DIR}/{name}.json");
    if std::env::var_os("NOOKLY_UPDATE_SNAPSHOTS").is_some() {
        std::fs::create_dir_all(DIR).unwrap();
        std::fs::write(&path, format!("{text}\n")).unwrap();
        return;
    }
    let saved = std::fs::read_to_string(&path).unwrap_or_default();
    assert_eq!(
        saved.trim_end(),
        text,
        "{name} changed. If that is intended, run\n  NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib db::portable_desktop_samples_tests\nand commit the diff of {path}."
    );
}

fn attrs(pairs: &[(&str, &str)]) -> BlockAttrs {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

#[test]
fn the_files_the_desktop_writes_are_the_samples_the_phone_reads() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algorithms");

    let page = notes::create_page(&conn, space.id.clone(), "note", "Week 1".into()).unwrap();
    for (block_type, content, language, block_attrs) in [
        ("paragraph", "Hello **world**", None, attrs(&[])),
        ("heading1", "Part one", None, attrs(&[("toggle", "closed")])),
        (
            "numbered_list",
            "first\nsecond",
            None,
            attrs(&[("marker", "a)"), ("start", "2")]),
        ),
        ("code", "fn main() {}", Some("rust"), attrs(&[])),
        ("table", "A\tB\n1\t2", None, attrs(&[("pinned", "1")])),
        (
            "timeline",
            "2026-01-01\tStart\n2026-02-01\tEnd",
            None,
            attrs(&[("title", "Plan")]),
        ),
        ("checklist", "[x] done\n[ ] todo", None, attrs(&[])),
        ("divider", "", None, attrs(&[])),
    ] {
        notes::create_block_with_attrs(
            &conn,
            &page.id,
            block_type.into(),
            content.into(),
            None,
            language.map(str::to_string),
            None,
            block_attrs,
        )
        .unwrap();
    }
    check("page", &portable::export_entity(&conn, &page.id).unwrap());

    let task = tasks::create_task(
        &conn,
        space.id.clone(),
        "Write the report".into(),
        Some("2026-03-01".into()),
        Some("2026-03-10".into()),
    )
    .unwrap();
    let id = &task.entity.id;
    tasks::update_task_status(&conn, id, "in_progress").unwrap();
    tasks::update_task_effort(&conn, id, Some(5)).unwrap();
    tasks::set_task_repeat(
        &conn,
        id,
        Some(RepeatRule {
            every: 2,
            unit: RepeatUnit::Week,
        }),
    )
    .unwrap();
    notes::create_block(
        &conn,
        id,
        "paragraph".into(),
        "Cover **three** topics.".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let sub = tasks::create_subtask(&conn, id.clone(), "Outline".into()).unwrap();
    tasks::update_task_status(&conn, &sub.entity.id, "done").unwrap();
    tasks::update_task_dates(&conn, &sub.entity.id, None, Some("2026-03-05".into())).unwrap();
    check("task", &portable::export_entity(&conn, id).unwrap());

    let assignment = assignments::create_assignment(
        &conn,
        space.id.clone(),
        "Lab report 3".into(),
        course.id.clone(),
        Some("2026-03-10".into()),
    )
    .unwrap();
    let aid = &assignment.entity.id;
    assignments::update_assignment_status(&conn, aid, "graded".into(), Some(8.5)).unwrap();
    assignments::update_assignment_weight(&conn, aid, Some(0.25)).unwrap();
    notes::create_block(
        &conn,
        aid,
        "paragraph".into(),
        "Hand in **both** parts.".into(),
        None,
        None,
        None,
    )
    .unwrap();
    check("assignment", &portable::export_entity(&conn, aid).unwrap());

    let deck = decks::create_deck(&conn, space.id.clone(), "Sorting".into(), None).unwrap();
    decks::create_card(&conn, deck.id.clone(), "Quicksort?".into(), "n log n".into()).unwrap();
    check("deck", &portable::export_entity(&conn, &deck.id).unwrap());
}
