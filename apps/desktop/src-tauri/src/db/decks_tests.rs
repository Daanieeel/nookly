//! Spec tests for Decks and their Index Cards (`docs/03-modules/decks.md`).

use crate::db::decks::*;
use crate::db::entities::{
    empty_trash, get_entity, list_entities, restore_entity, soft_delete_entity, Entity,
};
use crate::db::{test_conn, test_space, test_space_with_course};
use crate::error::AppError;
use chrono::{DateTime, Utc};
use rs_fsrs::Rating;
use rusqlite::{params, Connection};

fn exam(conn: &Connection, space_id: &str, course_id: &str, title: &str) -> Entity {
    crate::db::exams::create_exam(
        conn,
        space_id.into(),
        title.into(),
        course_id.into(),
        None,
        None,
    )
    .unwrap()
    .entity
}

fn deck(conn: &Connection, space_id: &str, title: &str) -> Entity {
    create_deck(conn, space_id.into(), title.into(), None).unwrap()
}

fn card(conn: &Connection, deck_id: &str, front: &str) -> IndexCard {
    create_card(conn, deck_id.into(), front.into(), "back".into()).unwrap()
}

fn time(raw: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(raw)
        .unwrap()
        .with_timezone(&Utc)
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap()
}

fn set_due(conn: &Connection, card_id: &str, state: &str, due: DateTime<Utc>) {
    conn.execute(
        "UPDATE index_cards SET state = ?1, due_at = ?2 WHERE id = ?3",
        params![state, due.to_rfc3339(), card_id],
    )
    .unwrap();
}

fn fronts(cards: &[IndexCard]) -> Vec<String> {
    cards.iter().map(|c| c.front.clone()).collect()
}

// --- decks -------------------------------------------------------------------

#[test]
fn a_deck_stands_on_its_own() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "Spanish");
    assert_eq!(d.entity_type, "index_card_deck");
    assert!(d.key.starts_with("DCK-"));
    assert_eq!(deck_exam_id(&conn, &d.id).unwrap(), None);
    let stats = deck_stats(&conn, &d.id).unwrap();
    assert_eq!(
        (stats.total, stats.new, stats.learning, stats.due),
        (0, 0, 0, 0)
    );
    assert!(stats.next_due_at.is_none());
    assert!(
        crate::db::space_modules::list_space_modules(&conn, &space.id)
            .unwrap()
            .contains(&"decks".to_string())
    );
}

#[test]
fn a_deck_can_be_filed_under_an_exam_at_creation() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &course.id, "Final");
    let d = create_deck(&conn, space.id.clone(), "Deck".into(), Some(x.id.clone())).unwrap();
    assert_eq!(deck_exam_id(&conn, &d.id).unwrap(), Some(x.id));
}

#[test]
fn refiling_a_deck_keeps_at_most_one_exam() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x1 = exam(&conn, &space.id, &course.id, "Mid");
    let x2 = exam(&conn, &space.id, &course.id, "Final");
    let d = create_deck(&conn, space.id.clone(), "Deck".into(), Some(x1.id.clone())).unwrap();

    set_deck_exam(&conn, &d.id, Some(x2.id.clone())).unwrap();
    assert_eq!(deck_exam_id(&conn, &d.id).unwrap(), Some(x2.id.clone()));
    let links = count(
        &conn,
        "SELECT COUNT(*) FROM relationships WHERE relationship_type = 'deck-exam'",
    );
    assert_eq!(links, 1);

    set_deck_exam(&conn, &d.id, None).unwrap();
    assert_eq!(deck_exam_id(&conn, &d.id).unwrap(), None);
    // Unfiling twice is harmless.
    set_deck_exam(&conn, &d.id, None).unwrap();
}

#[test]
fn the_raw_link_also_allows_only_one_exam() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x1 = exam(&conn, &space.id, &course.id, "Mid");
    let x2 = exam(&conn, &space.id, &course.id, "Final");
    let d = create_deck(&conn, space.id.clone(), "Deck".into(), Some(x1.id)).unwrap();
    let result = crate::db::relationships::create_relationship(
        &conn,
        d.id.clone(),
        x2.id,
        "deck-exam".into(),
        None,
        None,
    );
    assert!(matches!(result, Err(AppError::CardinalityViolation(_))));
}

#[test]
fn filing_under_a_non_exam_is_invalid_and_keeps_the_old_exam() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &course.id, "Mid");
    let d = create_deck(&conn, space.id.clone(), "Deck".into(), Some(x.id.clone())).unwrap();
    assert!(matches!(
        set_deck_exam(&conn, &d.id, Some(course.id.clone())),
        Err(AppError::InvalidInput(_))
    ));
    assert_eq!(deck_exam_id(&conn, &d.id).unwrap(), Some(x.id));
}

#[test]
fn filing_under_an_unknown_exam_is_not_found_and_keeps_the_old_exam() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &course.id, "Mid");
    let d = create_deck(&conn, space.id.clone(), "Deck".into(), Some(x.id.clone())).unwrap();
    assert!(matches!(
        set_deck_exam(&conn, &d.id, Some("ghost".into())),
        Err(AppError::NotFound(_))
    ));
    assert_eq!(deck_exam_id(&conn, &d.id).unwrap(), Some(x.id));
}

#[test]
fn a_failed_create_leaves_no_deck_behind() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let result = create_deck(&conn, space.id.clone(), "Deck".into(), Some("ghost".into()));
    assert!(result.is_err());
    assert!(
        list_decks(&conn, &space.id).unwrap().is_empty(),
        "a deck was left behind by a failed create"
    );
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_card_decks"), 0);
}

#[test]
fn decks_list_in_creation_order_per_space() {
    let conn = test_conn();
    let a = test_space(&conn, "A");
    let b = test_space(&conn, "B");
    for t in ["One", "Two", "Three"] {
        deck(&conn, &a.id, t);
    }
    deck(&conn, &b.id, "Other");
    let titles: Vec<String> = list_decks(&conn, &a.id)
        .unwrap()
        .into_iter()
        .map(|e| e.title)
        .collect();
    assert_eq!(titles, vec!["One", "Two", "Three"]);
    assert_eq!(list_decks(&conn, &b.id).unwrap().len(), 1);
}

#[test]
fn deck_listing_never_includes_other_entity_types() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    crate::db::tasks::create_task(&conn, space.id.clone(), "T".into(), None, None).unwrap();
    crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    deck(&conn, &space.id, "D");
    assert_eq!(list_decks(&conn, &space.id).unwrap().len(), 1);
}

#[test]
fn summaries_carry_exam_and_card_counts() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &course.id, "Mid");
    let d1 = create_deck(&conn, space.id.clone(), "Filed".into(), Some(x.id.clone())).unwrap();
    let d2 = deck(&conn, &space.id, "Loose");
    card(&conn, &d1.id, "a");
    card(&conn, &d1.id, "b");
    let summaries = list_deck_summaries(&conn, &space.id).unwrap();
    assert_eq!(summaries.len(), 2);
    assert_eq!(summaries[0].entity.id, d1.id);
    assert_eq!(summaries[0].exam_id, Some(x.id));
    assert_eq!(summaries[0].stats.total, 2);
    assert_eq!(summaries[1].entity.id, d2.id);
    assert_eq!(summaries[1].exam_id, None);
    assert_eq!(summaries[1].stats.total, 0);
}

#[test]
fn a_trashed_deck_keeps_its_cards_and_restores_with_them() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    card(&conn, &d.id, "a");
    card(&conn, &d.id, "b");

    soft_delete_entity(&conn, &d.id).unwrap();
    assert!(list_decks(&conn, &space.id).unwrap().is_empty());
    let trash: Vec<_> = list_entities(&conn, Some(&space.id), true)
        .unwrap()
        .into_iter()
        .filter(|e| e.deleted_at.is_some())
        .collect();
    assert_eq!(trash.len(), 1);
    assert_eq!(list_cards(&conn, &d.id, false).unwrap().len(), 2);

    restore_entity(&conn, &d.id).unwrap();
    assert_eq!(list_decks(&conn, &space.id).unwrap().len(), 1);
    assert_eq!(
        fronts(&list_cards(&conn, &d.id, false).unwrap()),
        vec!["a", "b"]
    );
}

#[test]
fn empty_trash_removes_a_deck_with_its_cards_and_reviews() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let gone = deck(&conn, &space.id, "Gone");
    let kept = deck(&conn, &space.id, "Kept");
    let c = card(&conn, &gone.id, "a");
    review_card(&conn, &c.id, Rating::Good).unwrap();
    let k = card(&conn, &kept.id, "k");
    review_card(&conn, &k.id, Rating::Good).unwrap();

    soft_delete_entity(&conn, &gone.id).unwrap();
    empty_trash(&conn).unwrap();

    assert!(get_entity(&conn, &gone.id).is_err());
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_cards"), 1);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_card_reviews"), 1);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_card_decks"), 1);
    assert_eq!(list_cards(&conn, &kept.id, false).unwrap().len(), 1);
}

#[test]
fn a_deck_filed_under_a_trashed_exam_still_points_at_it() {
    let conn = test_conn();
    let (space, course) = test_space_with_course(&conn, "Uni", "Algo");
    let x = exam(&conn, &space.id, &course.id, "Mid");
    let d = create_deck(&conn, space.id.clone(), "D".into(), Some(x.id.clone())).unwrap();
    soft_delete_entity(&conn, &x.id).unwrap();
    // Trashed entities stay in the graph.
    assert_eq!(deck_exam_id(&conn, &d.id).unwrap(), Some(x.id));
    assert!(get_entity(&conn, &d.id).unwrap().deleted_at.is_none());
}

#[test]
fn a_filed_deck_moves_with_its_exam_and_cannot_move_alone() {
    let conn = test_conn();
    let (a, course) = test_space_with_course(&conn, "A", "Algo");
    let b = test_space(&conn, "B");
    let x = exam(&conn, &a.id, &course.id, "Mid");
    let d = create_deck(&conn, a.id.clone(), "D".into(), Some(x.id.clone())).unwrap();
    let patch = |space: &str| crate::db::entities::EntityPatch {
        space_id: Some(space.into()),
        ..Default::default()
    };
    assert!(matches!(
        crate::db::entities::update_entity(&conn, &d.id, patch(&b.id)),
        Err(AppError::InvalidInput(_))
    ));
    crate::db::entities::update_entity(&conn, &course.id, patch(&b.id)).unwrap();
    assert_eq!(get_entity(&conn, &d.id).unwrap().space_id, b.id);
    assert_eq!(list_decks(&conn, &b.id).unwrap().len(), 1);
}

// --- cards ---------------------------------------------------------------------

#[test]
fn a_new_card_is_due_right_away() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = create_card(&conn, d.id.clone(), "**Q**".into(), "$x^2$".into()).unwrap();
    assert_eq!(c.deck_entity_id, d.id);
    assert_eq!((c.front.as_str(), c.back.as_str()), ("**Q**", "$x^2$"));
    assert_eq!(c.state, "new");
    assert_eq!((c.reps, c.lapses), (0, 0));
    assert!(c.last_review_at.is_none() && c.deleted_at.is_none());
    assert!(time(&c.due_at) <= Utc::now());
    assert_eq!(study_queue(&conn, &d.id).unwrap().len(), 1);
}

#[test]
fn rating_previews_grow_from_again_to_easy() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = card(&conn, &d.id, "Q");
    let n = &c.next;
    assert!(time(&n.again) <= time(&n.hard));
    assert!(time(&n.hard) <= time(&n.good));
    assert!(time(&n.good) < time(&n.easy));
}

#[test]
fn cards_on_a_missing_deck_are_refused() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let note = crate::db::notes::create_page(&conn, space.id.clone(), "note", "N".into()).unwrap();
    assert!(create_card(&conn, "ghost".into(), "Q".into(), "A".into()).is_err());
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_cards"), 0);
    // Cards may only exist on decks: an entity of another type is refused.
    assert!(create_card(&conn, note.id, "Q".into(), "A".into()).is_err());
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_cards"), 0);
}

#[test]
fn updating_a_card_patches_only_given_sides() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = create_card(&conn, d.id.clone(), "F".into(), "B".into()).unwrap();
    let c2 = update_card(&conn, &c.id, Some("F2".into()), None).unwrap();
    assert_eq!((c2.front.as_str(), c2.back.as_str()), ("F2", "B"));
    let c3 = update_card(&conn, &c.id, None, Some("B2".into())).unwrap();
    assert_eq!((c3.front.as_str(), c3.back.as_str()), ("F2", "B2"));
    let c4 = update_card(&conn, &c.id, None, None).unwrap();
    assert_eq!((c4.front.as_str(), c4.back.as_str()), ("F2", "B2"));
    // Editing text never reschedules the card.
    assert_eq!(c4.state, "new");
    assert_eq!(c4.due_at, c.due_at);
}

#[test]
fn unknown_cards_are_not_found() {
    let conn = test_conn();
    assert!(matches!(
        get_card(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        update_card(&conn, "ghost", Some("x".into()), None),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        delete_card(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        restore_card(&conn, "ghost"),
        Err(AppError::NotFound(_))
    ));
    assert!(matches!(
        review_card(&conn, "ghost", Rating::Good),
        Err(AppError::NotFound(_))
    ));
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_card_reviews"), 0);
}

#[test]
fn cards_list_in_creation_order_and_stay_in_their_deck() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d1 = deck(&conn, &space.id, "D1");
    let d2 = deck(&conn, &space.id, "D2");
    for f in ["one", "two", "three", "four"] {
        card(&conn, &d1.id, f);
    }
    card(&conn, &d2.id, "elsewhere");
    assert_eq!(
        fronts(&list_cards(&conn, &d1.id, false).unwrap()),
        vec!["one", "two", "three", "four"]
    );
    assert_eq!(
        fronts(&list_cards(&conn, &d2.id, false).unwrap()),
        vec!["elsewhere"]
    );
}

#[test]
fn reviewing_keeps_creation_order_in_the_card_list() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let a = card(&conn, &d.id, "a");
    card(&conn, &d.id, "b");
    review_card(&conn, &a.id, Rating::Easy).unwrap();
    assert_eq!(
        fronts(&list_cards(&conn, &d.id, false).unwrap()),
        vec!["a", "b"]
    );
}

#[test]
fn deleted_cards_are_out_of_the_queue_and_stats() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let a = card(&conn, &d.id, "a");
    card(&conn, &d.id, "b");
    delete_card(&conn, &a.id).unwrap();
    assert_eq!(fronts(&study_queue(&conn, &d.id).unwrap()), vec!["b"]);
    let stats = deck_stats(&conn, &d.id).unwrap();
    assert_eq!((stats.total, stats.new), (1, 1));
    assert!(get_card(&conn, &a.id).unwrap().deleted_at.is_some());
    restore_card(&conn, &a.id).unwrap();
    assert!(get_card(&conn, &a.id).unwrap().deleted_at.is_none());
    assert_eq!(deck_stats(&conn, &d.id).unwrap().total, 2);
}

#[test]
fn card_text_round_trips_unicode_and_long_content() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let long = "∑ ".repeat(5000);
    let c = create_card(&conn, d.id.clone(), "¿Qué hora es? 🕐".into(), long.clone()).unwrap();
    let stored = get_card(&conn, &c.id).unwrap();
    assert_eq!(stored.front, "¿Qué hora es? 🕐");
    assert_eq!(stored.back, long);
    let empty = create_card(&conn, d.id.clone(), "".into(), "".into()).unwrap();
    assert_eq!(get_card(&conn, &empty.id).unwrap().front, "");
}

// --- reviews ---------------------------------------------------------------------

#[test]
fn ratings_parse_from_names_and_digits() {
    for (raw, rating) in [
        ("again", Rating::Again),
        ("1", Rating::Again),
        ("hard", Rating::Hard),
        ("2", Rating::Hard),
        ("good", Rating::Good),
        ("3", Rating::Good),
        ("easy", Rating::Easy),
        ("4", Rating::Easy),
    ] {
        assert_eq!(parse_rating(raw).unwrap(), rating, "{raw}");
    }
    for bad in ["", "0", "5", "Good", "perfect"] {
        assert!(
            matches!(parse_rating(bad), Err(AppError::InvalidInput(_))),
            "{bad:?} accepted"
        );
    }
}

#[test]
fn each_review_counts_and_is_logged() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = card(&conn, &d.id, "Q");
    let first = review_card(&conn, &c.id, Rating::Good).unwrap();
    assert_eq!(first.reps, 1);
    assert!(first.last_review_at.is_some());
    let second = review_card(&conn, &c.id, Rating::Good).unwrap();
    assert_eq!(second.reps, 2);
    assert_eq!(deck_stats(&conn, &d.id).unwrap().reviewed_today, 2);
}

#[test]
fn easy_comes_back_later_than_good_from_a_new_card() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let a = card(&conn, &d.id, "a");
    let b = card(&conn, &d.id, "b");
    let good = review_card(&conn, &a.id, Rating::Good).unwrap();
    let easy = review_card(&conn, &b.id, Rating::Easy).unwrap();
    assert!(time(&easy.due_at) > time(&good.due_at));
    assert!(time(&good.due_at) > Utc::now());
}

#[test]
fn undo_reverts_only_the_latest_review() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = card(&conn, &d.id, "Q");
    let after_one = review_card(&conn, &c.id, Rating::Good).unwrap();
    review_card(&conn, &c.id, Rating::Easy).unwrap();

    let undone = undo_review(&conn, &c.id).unwrap();
    assert_eq!(undone.reps, after_one.reps);
    assert_eq!(undone.state, after_one.state);
    assert_eq!(undone.due_at, after_one.due_at);
    assert_eq!(count(&conn, "SELECT COUNT(*) FROM index_card_reviews"), 1);

    let original = undo_review(&conn, &c.id).unwrap();
    assert_eq!((original.state.as_str(), original.reps), ("new", 0));
    assert!(matches!(
        undo_review(&conn, &c.id),
        Err(AppError::InvalidInput(_))
    ));
}

#[test]
fn undo_on_one_card_never_touches_another() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let a = card(&conn, &d.id, "a");
    let b = card(&conn, &d.id, "b");
    let b_reviewed = review_card(&conn, &b.id, Rating::Easy).unwrap();
    review_card(&conn, &a.id, Rating::Good).unwrap();
    undo_review(&conn, &a.id).unwrap();
    let b_now = get_card(&conn, &b.id).unwrap();
    assert_eq!(b_now.reps, b_reviewed.reps);
    assert_eq!(b_now.due_at, b_reviewed.due_at);
}

#[test]
fn queue_orders_learning_then_review_then_new() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let past = Utc::now() - chrono::Duration::hours(1);
    let n = card(&conn, &d.id, "new");
    let r = card(&conn, &d.id, "review");
    let l = card(&conn, &d.id, "learning");
    set_due(&conn, &n.id, "new", past - chrono::Duration::hours(5));
    set_due(&conn, &r.id, "review", past);
    set_due(&conn, &l.id, "learning", past);
    assert_eq!(
        fronts(&study_queue(&conn, &d.id).unwrap()),
        vec!["learning", "review", "new"]
    );
}

#[test]
fn queue_orders_by_due_date_within_a_state() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let now = Utc::now();
    let late = card(&conn, &d.id, "late");
    let early = card(&conn, &d.id, "early");
    set_due(&conn, &late.id, "review", now - chrono::Duration::hours(1));
    set_due(&conn, &early.id, "review", now - chrono::Duration::days(2));
    assert_eq!(
        fronts(&study_queue(&conn, &d.id).unwrap()),
        vec!["early", "late"]
    );
}

#[test]
fn future_reviews_are_not_queued_and_set_next_due() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = card(&conn, &d.id, "Q");
    let reviewed = review_card(&conn, &c.id, Rating::Easy).unwrap();
    assert!(study_queue(&conn, &d.id).unwrap().is_empty());
    let stats = deck_stats(&conn, &d.id).unwrap();
    assert_eq!((stats.new, stats.due, stats.learning), (0, 0, 0));
    assert_eq!(stats.next_due_at, Some(reviewed.due_at));
}

#[test]
fn learning_cards_far_ahead_are_not_learned_ahead() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = card(&conn, &d.id, "Q");
    set_due(
        &conn,
        &c.id,
        "learning",
        Utc::now() + chrono::Duration::hours(2),
    );
    assert!(study_queue(&conn, &d.id).unwrap().is_empty());
    set_due(
        &conn,
        &c.id,
        "learning",
        Utc::now() + chrono::Duration::minutes(5),
    );
    assert_eq!(study_queue(&conn, &d.id).unwrap().len(), 1);
}

#[test]
fn stats_count_each_state() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let past = Utc::now() - chrono::Duration::minutes(10);
    card(&conn, &d.id, "n1");
    card(&conn, &d.id, "n2");
    let l = card(&conn, &d.id, "l");
    let r = card(&conn, &d.id, "r");
    let rl = card(&conn, &d.id, "rl");
    set_due(&conn, &l.id, "learning", past);
    set_due(&conn, &r.id, "review", past);
    set_due(&conn, &rl.id, "relearning", past);
    let stats = deck_stats(&conn, &d.id).unwrap();
    assert_eq!(stats.total, 5);
    assert_eq!(stats.new, 2);
    assert_eq!(stats.learning, 2);
    assert_eq!(stats.due, 1);
}

#[test]
fn cli_card_review_requires_a_valid_rating() {
    let conn = test_conn();
    let space = test_space(&conn, "S");
    let d = deck(&conn, &space.id, "D");
    let c = card(&conn, &d.id, "Q");
    let coll = crate::db::schema::child_collections("index_card_deck")
        .into_iter()
        .find(|c| c.plural == "cards")
        .unwrap();
    let review = coll.actions.iter().find(|a| a.name == "review").unwrap();
    let empty = crate::db::schema::JsonMap::new();
    assert!(matches!(
        (review.run)(&conn, &c.id, &empty),
        Err(AppError::InvalidInput(_))
    ));
    let mut fields = crate::db::schema::JsonMap::new();
    fields.insert("rating".into(), serde_json::json!(3));
    let value = (review.run)(&conn, &c.id, &fields).unwrap();
    assert_eq!(value["reps"], 1);
}
