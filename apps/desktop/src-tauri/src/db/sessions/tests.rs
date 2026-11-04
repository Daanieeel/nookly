use super::*;

fn setup() -> Connection {
    crate::db::test_conn()
}

fn monday_lecture(conn: &Connection, space_id: &str, course_id: &str, title: &str) -> Entity {
    create_session_template(
        conn,
        space_id.into(),
        title.into(),
        course_id.into(),
        0,
        "10:00".into(),
        "12:00".into(),
        None,
        "2026-01-05".into(),
    )
    .unwrap()
}

#[test]
fn generate_occurrences_creates_weekly_sessions_on_correct_weekday() {
    let conn = setup();
    let (space, course) = crate::db::test_space_with_course(&conn, "Study", "Algorithms");

    // 2026-01-05 is a Monday.
    let template = monday_lecture(&conn, &space.id, &course.id, "Algorithms Lecture");

    let occurrences = generate_occurrences(&conn, &template.id, "2026-01-26").unwrap();
    assert_eq!(occurrences.len(), 4);
    for occ in &occurrences {
        let date = NaiveDate::parse_from_str(&occ.date, "%Y-%m-%d").unwrap();
        assert_eq!(date.weekday().num_days_from_monday(), 0);
    }

    // Regenerating shouldn't duplicate.
    let again = generate_occurrences(&conn, &template.id, "2026-01-26").unwrap();
    assert!(again.is_empty());
}

#[test]
fn override_does_not_affect_template() {
    let conn = setup();
    let (space, course) = crate::db::test_space_with_course(&conn, "Study", "Algorithms");
    let template = monday_lecture(&conn, &space.id, &course.id, "Algorithms Lecture");
    let occurrences = generate_occurrences(&conn, &template.id, "2026-01-05").unwrap();
    let occ = &occurrences[0];

    override_occurrence(
        &conn,
        &occ.entity.id,
        OccurrenceOverride {
            cancelled: Some(true),
            ..Default::default()
        },
    )
    .unwrap();

    let (weekday,): (i64,) = conn
        .query_row(
            "SELECT weekday FROM session_templates WHERE entity_id = ?1",
            params![template.id],
            |r| Ok((r.get(0)?,)),
        )
        .unwrap();
    assert_eq!(weekday, 0);
}

fn weekly_series(conn: &Connection) -> (String, Vec<SessionOccurrence>) {
    let (space, course) = crate::db::test_space_with_course(conn, "Study", "Algorithms");
    let template = monday_lecture(conn, &space.id, &course.id, "Lecture");
    let occurrences = generate_occurrences(conn, &template.id, "2026-01-26").unwrap();
    (template.id, occurrences)
}

#[test]
fn series_update_skips_earlier_and_overridden_occurrences() {
    let conn = setup();
    let (template_id, occ) = weekly_series(&conn);
    override_occurrence(
        &conn,
        &occ[2].entity.id,
        OccurrenceOverride {
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    update_session_series(
        &conn,
        &template_id,
        &occ[1].date,
        SeriesPatch {
            title: Some("Lecture II".into()),
            start_time: Some("10:15".into()),
            end_time: Some("11:45".into()),
            location: None,
        },
    )
    .unwrap();
    let get = |i: usize| get_session_occurrence(&conn, &occ[i].entity.id).unwrap();
    assert_eq!(
        (get(0).start_time, get(0).entity.title),
        ("10:00".into(), "Lecture".into())
    );
    assert_eq!(
        (get(1).start_time, get(1).end_time),
        ("10:15".into(), "11:45".into())
    );
    assert_eq!(get(1).entity.title, "Lecture II");
    // The overridden start stays, the untouched end follows the series.
    assert_eq!(
        (get(2).start_time, get(2).end_time),
        ("09:00".into(), "11:45".into())
    );
    assert_eq!(
        get_session_template(&conn, &template_id)
            .unwrap()
            .start_time,
        "10:15"
    );
}

#[test]
fn series_delete_trashes_following_then_the_template() {
    let conn = setup();
    let (template_id, occ) = weekly_series(&conn);
    assert_eq!(
        delete_session_series(&conn, &template_id, &occ[2].date).unwrap(),
        2
    );
    assert!(get_session_template(&conn, &template_id)
        .unwrap()
        .entity
        .deleted_at
        .is_none());
    assert_eq!(
        delete_session_series(&conn, &template_id, &occ[0].date).unwrap(),
        2
    );
    assert!(get_session_template(&conn, &template_id)
        .unwrap()
        .entity
        .deleted_at
        .is_some());
}

#[test]
fn session_pages_link_once_and_replace_trashed_ones() {
    let conn = setup();
    let (_, occ) = weekly_series(&conn);
    let id = &occ[0].entity.id;
    assert!(get_session_pages(&conn, id).unwrap().jot.is_none());
    let jot = create_session_page(&conn, id, "jot", "Jot".into()).unwrap();
    assert_eq!(jot.entity_type, "jot");
    let again = create_session_page(&conn, id, "jot", "Other".into()).unwrap();
    assert_eq!(again.id, jot.id);
    crate::db::entities::soft_delete_entity(&conn, &jot.id).unwrap();
    assert!(get_session_pages(&conn, id).unwrap().jot.is_none());
    let fresh = create_session_page(&conn, id, "jot", "Jot".into()).unwrap();
    assert_ne!(fresh.id, jot.id);
    let note = create_session_page(&conn, id, "note", "Note".into()).unwrap();
    assert_eq!(
        get_session_pages(&conn, id).unwrap().note.unwrap().id,
        note.id
    );
    // A refined Note doesn't replace the Note the session already has.
    let space = occ[0].entity.space_id.clone();
    let refined = crate::db::notes::create_page(&conn, space, "note", "Refined".into()).unwrap();
    assert!(!link_session_page(&conn, id, "note", &refined.id).unwrap());
    crate::db::entities::soft_delete_entity(&conn, &note.id).unwrap();
    assert!(link_session_page(&conn, id, "note", &refined.id).unwrap());
    assert_eq!(
        get_session_pages(&conn, id).unwrap().note.unwrap().id,
        refined.id
    );
}

fn course_links(conn: &Connection, page_id: &str, link: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT from_entity_id FROM relationships
             WHERE to_entity_id = ?1 AND relationship_type = ?2",
        )
        .unwrap();
    stmt.query_map(params![page_id, link], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect()
}

#[test]
fn a_session_jot_and_note_are_also_linked_to_the_sessions_course() {
    let conn = setup();
    let (_, occ) = weekly_series(&conn);
    let id = &occ[0].entity.id;
    let course: String = conn
        .query_row(
            "SELECT to_entity_id FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'session-course'",
            params![id],
            |r| r.get(0),
        )
        .unwrap();

    let jot = create_session_page(&conn, id, "jot", "Jot".into()).unwrap();
    assert_eq!(
        course_links(&conn, &jot.id, "course-jots"),
        vec![course.clone()]
    );
    assert!(course_links(&conn, &jot.id, "course-notes").is_empty());

    let note = create_session_page(&conn, id, "note", "Note".into()).unwrap();
    assert_eq!(
        course_links(&conn, &note.id, "course-notes"),
        vec![course.clone()]
    );

    // A refined Note takes the same path.
    crate::db::entities::soft_delete_entity(&conn, &note.id).unwrap();
    let refined = crate::db::notes::create_page(
        &conn,
        occ[0].entity.space_id.clone(),
        "note",
        "Refined".into(),
    )
    .unwrap();
    assert!(link_session_page(&conn, id, "note", &refined.id).unwrap());
    assert_eq!(
        course_links(&conn, &refined.id, "course-notes"),
        vec![course]
    );
}

// --- Characterization tests: recurring series logic -------------------
// Pin the CURRENT behavior so a later refactor (shared series module with
// `calendar`) can be verified. Mirrored by tests in `calendar.rs`.

type Snap = (String, String, String, String, Option<String>, bool);

/// Every row of a template (trashed included), ordered by date.
fn snapshot(conn: &Connection, template_id: &str) -> Vec<Snap> {
    let mut stmt = conn
        .prepare(
            "SELECT e.id FROM entities e JOIN sessions s ON s.entity_id = e.id
             WHERE s.template_id = ?1 ORDER BY s.date ASC",
        )
        .unwrap();
    let ids: Vec<String> = stmt
        .query_map(params![template_id], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    ids.iter()
        .map(|id| {
            let o = get_session_occurrence(conn, id).unwrap();
            (
                o.date,
                o.entity.title,
                o.start_time,
                o.end_time,
                o.location,
                o.cancelled,
            )
        })
        .collect()
}

fn row_count(conn: &Connection, template_id: &str) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE template_id = ?1",
        params![template_id],
        |r| r.get(0),
    )
    .unwrap()
}

fn trashed(conn: &Connection, id: &str) -> bool {
    get_session_occurrence(conn, id)
        .unwrap()
        .entity
        .deleted_at
        .is_some()
}

fn set_title(conn: &Connection, id: &str, title: &str) {
    crate::db::entities::update_entity(
        conn,
        id,
        crate::db::entities::EntityPatch {
            title: Some(title.into()),
            ..Default::default()
        },
    )
    .unwrap();
}

struct Fixture {
    space: String,
    course: String,
    tid: String,
    occ: Vec<SessionOccurrence>,
}

/// Monday lecture at Room 1, 10:00 to 12:00, occurrences 01-05, 01-12, 01-19, 01-26.
fn fixture(conn: &Connection) -> Fixture {
    let (space, course) = crate::db::test_space_with_course(conn, "Study", "Algorithms");
    let template = create_session_template(
        conn,
        space.id.clone(),
        "Lecture".into(),
        course.id.clone(),
        0,
        "10:00".into(),
        "12:00".into(),
        Some("Room 1".into()),
        "2026-01-05".into(),
    )
    .unwrap();
    let occ = generate_occurrences(conn, &template.id, "2026-01-26").unwrap();
    Fixture {
        space: space.id,
        course: course.id,
        tid: template.id,
        occ,
    }
}

fn ov(date: &str) -> OccurrenceOverride {
    OccurrenceOverride {
        date: Some(date.into()),
        ..Default::default()
    }
}

#[test]
fn series_update_from_date_changes_only_later_occurrences() {
    let conn = setup();
    let f = fixture(&conn);
    let before = snapshot(&conn, &f.tid);
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[2].date,
        SeriesPatch {
            title: Some("Lecture II".into()),
            start_time: Some("11:00".into()),
            end_time: Some("13:00".into()),
            location: Some(Some("Hall".into())),
        },
    )
    .unwrap();
    let after = snapshot(&conn, &f.tid);
    assert_eq!(after[0], before[0]);
    assert_eq!(after[1], before[1]);
    for row in &after[2..] {
        assert_eq!(row.1, "Lecture II");
        assert_eq!(row.2, "11:00");
        assert_eq!(row.3, "13:00");
        assert_eq!(row.4.as_deref(), Some("Hall"));
    }
    let t = get_session_template(&conn, &f.tid).unwrap();
    assert_eq!(t.entity.title, "Lecture II");
    assert_eq!(
        (t.start_time.as_str(), t.end_time.as_str()),
        ("11:00", "13:00")
    );
    assert_eq!(t.location.as_deref(), Some("Hall"));
    // Weekday and anchor never change.
    assert_eq!((t.weekday, t.anchor_date.as_str()), (0, "2026-01-05"));
}

#[test]
fn series_update_title_only_reaches_occurrences_with_the_old_title() {
    let conn = setup();
    let f = fixture(&conn);
    set_title(&conn, &f.occ[2].entity.id, "Guest lecture");
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[1].date,
        SeriesPatch {
            title: Some("Lecture II".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let titles: Vec<String> = snapshot(&conn, &f.tid).into_iter().map(|r| r.1).collect();
    assert_eq!(
        titles,
        vec!["Lecture", "Lecture II", "Guest lecture", "Lecture II"]
    );
    assert_eq!(
        get_session_template(&conn, &f.tid).unwrap().entity.title,
        "Lecture II"
    );
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            title: Some("Lecture III".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let titles: Vec<String> = snapshot(&conn, &f.tid).into_iter().map(|r| r.1).collect();
    // Intended: occ[0] was never individually edited (it only kept the older series
    // title "Lecture"), so a rename starting at occ[0] must reach it too.
    assert_eq!(
        titles,
        vec!["Lecture III", "Lecture III", "Guest lecture", "Lecture III"]
    );
}

#[test]
fn series_update_same_title_is_a_noop_for_titles() {
    let conn = setup();
    let f = fixture(&conn);
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            title: Some("Lecture".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let titles: Vec<String> = snapshot(&conn, &f.tid).into_iter().map(|r| r.1).collect();
    assert_eq!(titles, vec!["Lecture"; 4]);
}

#[test]
fn series_update_empty_patch_changes_nothing() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(
        &conn,
        &f.occ[1].entity.id,
        OccurrenceOverride {
            cancelled: Some(true),
            location: Some(Some("Elsewhere".into())),
            ..Default::default()
        },
    )
    .unwrap();
    let before = snapshot(&conn, &f.tid);
    let tb = get_session_template(&conn, &f.tid).unwrap();
    assert!(update_session_series(&conn, &f.tid, &f.occ[0].date, SeriesPatch::default()).is_ok());
    assert_eq!(snapshot(&conn, &f.tid), before);
    let t = get_session_template(&conn, &f.tid).unwrap();
    assert_eq!(t.start_time, tb.start_time);
    assert_eq!(t.end_time, tb.end_time);
    assert_eq!(t.location, tb.location);
    assert_eq!(t.entity.title, tb.entity.title);
}

#[test]
fn series_update_from_date_before_first_reaches_all_after_last_reaches_none() {
    let conn = setup();
    let f = fixture(&conn);
    update_session_series(
        &conn,
        &f.tid,
        "2025-01-01",
        SeriesPatch {
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(snapshot(&conn, &f.tid).iter().all(|r| r.2 == "09:00"));
    update_session_series(
        &conn,
        &f.tid,
        "2027-01-01",
        SeriesPatch {
            title: Some("Renamed".into()),
            start_time: Some("08:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let rows = snapshot(&conn, &f.tid);
    assert!(rows.iter().all(|r| r.2 == "09:00"));
    assert!(rows.iter().all(|r| r.1 == "Lecture"));
    // The template itself is updated regardless of from_date.
    let t = get_session_template(&conn, &f.tid).unwrap();
    assert_eq!(t.start_time, "08:00");
    assert_eq!(t.entity.title, "Renamed");
}

#[test]
fn series_update_from_date_is_inclusive_and_by_string_date() {
    let conn = setup();
    let f = fixture(&conn);
    update_session_series(
        &conn,
        &f.tid,
        "2026-01-13",
        SeriesPatch {
            start_time: Some("10:30".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let starts: Vec<_> = snapshot(&conn, &f.tid).into_iter().map(|r| r.2).collect();
    assert_eq!(starts, vec!["10:00", "10:00", "10:30", "10:30"]);
}

#[test]
fn series_update_unknown_template_is_not_found() {
    let conn = setup();
    let err =
        update_session_series(&conn, "nope", "2026-01-01", SeriesPatch::default()).unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)));
    // An occurrence id is not a template id.
    let f = fixture(&conn);
    assert!(update_session_series(
        &conn,
        &f.occ[0].entity.id,
        "2026-01-01",
        SeriesPatch::default()
    )
    .is_err());
}

#[test]
fn series_update_invalid_times_error_and_leave_everything_untouched() {
    let conn = setup();
    let f = fixture(&conn);
    let before = snapshot(&conn, &f.tid);
    let err = update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            title: Some("Changed".into()),
            end_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap_err();
    assert!(matches!(err, AppError::InvalidInput(_)));
    assert!(update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            start_time: Some("12:00".into()),
            ..Default::default()
        }
    )
    .is_err());
    assert_eq!(snapshot(&conn, &f.tid), before);
    let t = get_session_template(&conn, &f.tid).unwrap();
    assert_eq!(t.entity.title, "Lecture");
    assert_eq!(t.end_time, "12:00");
}

#[test]
fn series_update_keeps_overridden_location_but_updates_the_rest() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(
        &conn,
        &f.occ[1].entity.id,
        OccurrenceOverride {
            location: Some(Some("Lab".into())),
            ..Default::default()
        },
    )
    .unwrap();
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            start_time: Some("09:00".into()),
            location: Some(Some("Hall".into())),
            ..Default::default()
        },
    )
    .unwrap();
    let rows = snapshot(&conn, &f.tid);
    assert_eq!(rows[1].2, "09:00");
    assert_eq!(rows[1].4.as_deref(), Some("Lab"));
    assert_eq!(rows[0].4.as_deref(), Some("Hall"));
}

#[test]
fn series_update_can_clear_location() {
    let conn = setup();
    let f = fixture(&conn);
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            location: Some(None),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(snapshot(&conn, &f.tid).iter().all(|r| r.4.is_none()));
    assert_eq!(get_session_template(&conn, &f.tid).unwrap().location, None);
}

#[test]
fn series_update_overrides_that_become_invalid_keep_their_own_times() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(
        &conn,
        &f.occ[1].entity.id,
        OccurrenceOverride {
            end_time: Some("10:30".into()),
            ..Default::default()
        },
    )
    .unwrap();
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            start_time: Some("10:45".into()),
            location: Some(Some("Hall".into())),
            ..Default::default()
        },
    )
    .unwrap();
    let rows = snapshot(&conn, &f.tid);
    assert_eq!(rows[0].2, "10:45");
    // 10:45 to 10:30 would be invalid, so both times stay; location still follows.
    assert_eq!((rows[1].2.as_str(), rows[1].3.as_str()), ("10:00", "10:30"));
    assert_eq!(rows[1].4.as_deref(), Some("Hall"));
}

#[test]
fn series_update_reaches_cancelled_and_skips_trashed_occurrences() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(
        &conn,
        &f.occ[1].entity.id,
        OccurrenceOverride {
            cancelled: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    crate::db::entities::soft_delete_entity(&conn, &f.occ[2].entity.id).unwrap();
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            title: Some("Lecture II".into()),
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let rows = snapshot(&conn, &f.tid);
    assert_eq!((rows[1].2.as_str(), rows[1].5), ("09:00", true));
    assert_eq!(rows[1].1, "Lecture II");
    assert_eq!(
        (rows[2].2.as_str(), rows[2].1.as_str()),
        ("10:00", "Lecture")
    );
    assert!(trashed(&conn, &f.occ[2].entity.id));
}

#[test]
fn series_update_judges_moved_occurrences_by_their_current_date() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(&conn, &f.occ[3].entity.id, ov("2026-01-06")).unwrap();
    override_occurrence(&conn, &f.occ[0].entity.id, ov("2026-02-02")).unwrap();
    update_session_series(
        &conn,
        &f.tid,
        "2026-01-19",
        SeriesPatch {
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let get = |i: usize| get_session_occurrence(&conn, &f.occ[i].entity.id).unwrap();
    assert_eq!(get(3).start_time, "10:00");
    assert_eq!(get(0).start_time, "09:00");
    assert_eq!(get(1).start_time, "10:00");
    assert_eq!(get(2).start_time, "09:00");
}

#[test]
fn series_update_on_a_trashed_template_still_applies() {
    // Pins current behavior: the template lookup does not filter deleted_at.
    let conn = setup();
    let f = fixture(&conn);
    delete_session_series(&conn, &f.tid, &f.occ[0].date).unwrap();
    assert!(update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            start_time: Some("09:00".into()),
            ..Default::default()
        }
    )
    .is_ok());
    let t = get_session_template(&conn, &f.tid).unwrap();
    assert_eq!(t.start_time, "09:00");
    assert!(t.entity.deleted_at.is_some());
    assert!(snapshot(&conn, &f.tid).iter().all(|r| r.2 == "10:00"));
}

// --- delete series ---

#[test]
fn series_delete_soft_deletes_from_date_and_keeps_rows() {
    let conn = setup();
    let f = fixture(&conn);
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[2].date).unwrap(),
        2
    );
    assert_eq!(row_count(&conn, &f.tid), 4);
    assert!(!trashed(&conn, &f.occ[0].entity.id));
    assert!(!trashed(&conn, &f.occ[1].entity.id));
    assert!(trashed(&conn, &f.occ[2].entity.id));
    assert!(trashed(&conn, &f.occ[3].entity.id));
    assert_eq!(list_sessions(&conn, Some(&f.space)).unwrap().len(), 2);
    let entity_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM entities WHERE id IN (?1, ?2)",
            params![f.occ[2].entity.id, f.occ[3].entity.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(entity_rows, 2);
    assert!(get_session_template(&conn, &f.tid)
        .unwrap()
        .entity
        .deleted_at
        .is_none());
    // Trashed occurrences keep their data and their course link.
    let kept = get_session_occurrence(&conn, &f.occ[3].entity.id).unwrap();
    assert_eq!(kept.start_time, "10:00");
    assert_eq!(kept.template_id.as_deref(), Some(f.tid.as_str()));
    let links: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM relationships WHERE from_entity_id = ?1 AND to_entity_id = ?2 AND relationship_type = 'session-course'",
            params![f.occ[3].entity.id, f.course],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(links, 1);
}

#[test]
fn series_delete_from_first_occurrence_trashes_template_too() {
    let conn = setup();
    let f = fixture(&conn);
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[0].date).unwrap(),
        4
    );
    assert!(get_session_template(&conn, &f.tid)
        .unwrap()
        .entity
        .deleted_at
        .is_some());
    assert_eq!(row_count(&conn, &f.tid), 4);
    assert!(list_session_templates(&conn, &f.space).unwrap().is_empty());
}

#[test]
fn series_delete_does_not_double_count_trashed_occurrences() {
    let conn = setup();
    let f = fixture(&conn);
    crate::db::entities::soft_delete_entity(&conn, &f.occ[3].entity.id).unwrap();
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[2].date).unwrap(),
        1
    );
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[2].date).unwrap(),
        0
    );
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[0].date).unwrap(),
        2
    );
}

#[test]
fn series_delete_after_last_occurrence_trashes_nothing() {
    let conn = setup();
    let f = fixture(&conn);
    assert_eq!(
        delete_session_series(&conn, &f.tid, "2027-01-01").unwrap(),
        0
    );
    assert_eq!(snapshot(&conn, &f.tid).len(), 4);
    assert!(get_session_template(&conn, &f.tid)
        .unwrap()
        .entity
        .deleted_at
        .is_none());
    assert_eq!(list_sessions(&conn, None).unwrap().len(), 4);
}

#[test]
fn series_delete_trashes_template_when_earlier_ones_were_trashed_by_hand() {
    let conn = setup();
    let f = fixture(&conn);
    crate::db::entities::soft_delete_entity(&conn, &f.occ[0].entity.id).unwrap();
    crate::db::entities::soft_delete_entity(&conn, &f.occ[1].entity.id).unwrap();
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[2].date).unwrap(),
        2
    );
    assert!(get_session_template(&conn, &f.tid)
        .unwrap()
        .entity
        .deleted_at
        .is_some());
}

#[test]
fn series_delete_includes_cancelled_and_uses_current_dates() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(
        &conn,
        &f.occ[3].entity.id,
        OccurrenceOverride {
            cancelled: Some(true),
            date: Some("2026-01-06".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[1].date).unwrap(),
        2
    );
    assert!(!trashed(&conn, &f.occ[3].entity.id));
    assert!(trashed(&conn, &f.occ[1].entity.id));
    assert!(trashed(&conn, &f.occ[2].entity.id));
    override_occurrence(&conn, &f.occ[3].entity.id, ov("2026-03-02")).unwrap();
    assert_eq!(
        delete_session_series(&conn, &f.tid, "2026-02-01").unwrap(),
        1
    );
    assert!(trashed(&conn, &f.occ[3].entity.id));
}

#[test]
fn series_delete_leaves_other_series_and_one_offs_alone() {
    let conn = setup();
    let f = fixture(&conn);
    let other = create_session_template(
        &conn,
        f.space.clone(),
        "Lab".into(),
        f.course.clone(),
        2,
        "14:00".into(),
        "16:00".into(),
        None,
        "2026-01-05".into(),
    )
    .unwrap();
    generate_occurrences(&conn, &other.id, "2026-01-26").unwrap();
    let one_off = create_one_off_session(
        &conn,
        f.space.clone(),
        "Workshop".into(),
        f.course.clone(),
        "2026-01-20".into(),
        "10:00".into(),
        "11:00".into(),
        None,
    )
    .unwrap();
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[0].date).unwrap(),
        4
    );
    assert!(!trashed(&conn, &one_off.entity.id));
    assert_eq!(snapshot(&conn, &other.id).len(), 3);
    assert_eq!(list_sessions(&conn, None).unwrap().len(), 4);
    assert!(get_session_template(&conn, &other.id)
        .unwrap()
        .entity
        .deleted_at
        .is_none());
}

#[test]
fn series_delete_unknown_id_and_repeat_delete_error() {
    let conn = setup();
    let err = delete_session_series(&conn, "nope", "2026-01-01").unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)));
    let f = fixture(&conn);
    delete_session_series(&conn, &f.tid, &f.occ[0].date).unwrap();
    // Intended: deleting again is idempotent and removes nothing (Ok(0)).
    assert_eq!(
        delete_session_series(&conn, &f.tid, &f.occ[0].date).unwrap(),
        0
    );
}

#[test]
fn series_delete_with_no_generated_occurrences_trashes_the_template() {
    let conn = setup();
    let (space, course) = crate::db::test_space_with_course(&conn, "Study", "Algorithms");
    let template = monday_lecture(&conn, &space.id, &course.id, "Lecture");
    assert_eq!(
        delete_session_series(&conn, &template.id, "2026-01-01").unwrap(),
        0
    );
    assert!(get_session_template(&conn, &template.id)
        .unwrap()
        .entity
        .deleted_at
        .is_some());
}

// --- generate_occurrences ---

#[test]
fn generate_is_idempotent_and_extends_without_duplicates() {
    let conn = setup();
    let f = fixture(&conn);
    assert!(generate_occurrences(&conn, &f.tid, "2026-01-26")
        .unwrap()
        .is_empty());
    let more = generate_occurrences(&conn, &f.tid, "2026-02-09").unwrap();
    assert_eq!(
        more.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-02-02", "2026-02-09"]
    );
    assert_eq!(row_count(&conn, &f.tid), 6);
    assert_eq!(more[0].template_id.as_deref(), Some(f.tid.as_str()));
}

#[test]
fn generate_does_not_resurrect_trashed_or_duplicate_cancelled_occurrences() {
    let conn = setup();
    let f = fixture(&conn);
    delete_session_series(&conn, &f.tid, &f.occ[2].date).unwrap();
    override_occurrence(
        &conn,
        &f.occ[0].entity.id,
        OccurrenceOverride {
            cancelled: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(generate_occurrences(&conn, &f.tid, "2026-01-26")
        .unwrap()
        .is_empty());
    assert_eq!(row_count(&conn, &f.tid), 4);
    assert!(trashed(&conn, &f.occ[2].entity.id));
}

#[test]
fn generate_does_not_refill_a_date_vacated_by_a_moved_occurrence() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(&conn, &f.occ[1].entity.id, ov("2026-01-14")).unwrap();
    let created = generate_occurrences(&conn, &f.tid, "2026-01-26").unwrap();
    // Fixed: generate skips every slot it already filled, so the vacated
    // 01-12 stays empty instead of getting a fresh occurrence.
    assert!(created.is_empty());
    assert_eq!(row_count(&conn, &f.tid), 4);
    assert_eq!(
        get_session_occurrence(&conn, &f.occ[1].entity.id)
            .unwrap()
            .date,
        "2026-01-14"
    );
}

#[test]
fn generate_copies_current_template_values_and_links_course() {
    let conn = setup();
    let f = fixture(&conn);
    update_session_series(
        &conn,
        &f.tid,
        "2026-01-01",
        SeriesPatch {
            title: Some("Lecture II".into()),
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let created = generate_occurrences(&conn, &f.tid, "2026-02-02").unwrap();
    assert_eq!(created.len(), 1);
    let c = &created[0];
    assert_eq!(c.entity.title, "Lecture II");
    assert_eq!(c.entity.entity_type, "session");
    assert_eq!(c.entity.space_id, f.space);
    assert_eq!(
        (c.start_time.as_str(), c.end_time.as_str()),
        ("09:00", "12:00")
    );
    assert_eq!(c.location.as_deref(), Some("Room 1"));
    assert!(!c.cancelled);
    assert_eq!(c.notes, None);
    let course_id: String = conn
        .query_row(
            "SELECT to_entity_id FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'session-course'",
            params![c.entity.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(course_id, f.course);
    let dates: Vec<_> = snapshot(&conn, &f.tid).into_iter().map(|r| r.0).collect();
    for pair in dates.windows(2) {
        let a = NaiveDate::parse_from_str(&pair[0], "%Y-%m-%d").unwrap();
        let b = NaiveDate::parse_from_str(&pair[1], "%Y-%m-%d").unwrap();
        assert_eq!((b - a).num_days(), 7);
    }
}

#[test]
fn generate_boundaries_and_errors() {
    let conn = setup();
    let (space, course) = crate::db::test_space_with_course(&conn, "Study", "Algorithms");
    let template = monday_lecture(&conn, &space.id, &course.id, "Lecture");
    assert!(generate_occurrences(&conn, &template.id, "2026-01-04")
        .unwrap()
        .is_empty());
    assert_eq!(
        generate_occurrences(&conn, &template.id, "2026-01-05")
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        generate_occurrences(&conn, &template.id, "2026-01-18")
            .unwrap()
            .len(),
        1
    );
    assert!(matches!(
        generate_occurrences(&conn, "nope", "2026-01-18").unwrap_err(),
        AppError::NotFound(_)
    ));
    assert!(matches!(
        generate_occurrences(&conn, &template.id, "garbage").unwrap_err(),
        AppError::InvalidInput(_)
    ));
}

#[test]
fn generate_works_for_trashed_templates() {
    // Pins current behavior: nothing checks the template's deleted_at.
    let conn = setup();
    let f = fixture(&conn);
    delete_session_series(&conn, &f.tid, &f.occ[0].date).unwrap();
    assert_eq!(
        generate_occurrences(&conn, &f.tid, "2026-02-02")
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn generate_snaps_the_anchor_forward_to_the_template_weekday() {
    // DIFFERS: a calendar template's first occurrence is always its anchor
    // date; a session template's is the first matching weekday on or after it.
    let conn = setup();
    let (space, course) = crate::db::test_space_with_course(&conn, "Study", "Algorithms");
    // Wednesday (2), anchored on a Monday.
    let wed = create_session_template(
        &conn,
        space.id.clone(),
        "Lab".into(),
        course.id.clone(),
        2,
        "10:00".into(),
        "11:00".into(),
        None,
        "2026-01-05".into(),
    )
    .unwrap();
    let created = generate_occurrences(&conn, &wed.id, "2026-01-21").unwrap();
    assert_eq!(
        created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-01-07", "2026-01-14", "2026-01-21"]
    );
    // Monday (0) anchored on a Tuesday rolls to the next Monday.
    let mon = create_session_template(
        &conn,
        space.id,
        "Seminar".into(),
        course.id,
        0,
        "10:00".into(),
        "11:00".into(),
        None,
        "2026-01-06".into(),
    )
    .unwrap();
    let created = generate_occurrences(&conn, &mon.id, "2026-01-19").unwrap();
    assert_eq!(
        created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-01-12", "2026-01-19"]
    );
    // The anchor itself is used when it already matches.
    let f = fixture(&conn);
    assert_eq!(f.occ[0].date, "2026-01-05");
}

// --- template creation and override ---

#[test]
fn template_creation_validates_times() {
    // Fixed: a session template has to end after it starts, checked by the
    // same `series::validate_times` calendar entries use.
    let conn = setup();
    let (space, course) = crate::db::test_space_with_course(&conn, "Study", "Algorithms");
    let make = |start: &str, end: &str| {
        create_session_template(
            &conn,
            space.id.clone(),
            "T".into(),
            course.id.clone(),
            0,
            start.into(),
            end.into(),
            None,
            "2026-01-05".into(),
        )
    };
    assert!(is_backwards(make("12:00", "10:00").unwrap_err()));
    assert!(is_backwards(make("10:00", "10:00").unwrap_err()));
    // Nothing half-created: no entity and no Course link for a rejected one.
    assert!(list_session_templates(&conn, &space.id).unwrap().is_empty());
    let ok = make("10:00", "10:01").unwrap();
    assert_eq!(list_session_templates(&conn, &space.id).unwrap().len(), 1);
    assert_eq!(
        get_session_template(&conn, &ok.id).unwrap().end_time,
        "10:01"
    );
}

#[test]
fn override_validates_times_and_persists_nothing_on_error() {
    // Fixed: like `calendar::override_occurrence`, an override that would end
    // before (or when) it starts is rejected and nothing of it is stored.
    // DIFFERS: only checked when the patch changes a time; see
    // `legacy_sessions_with_odd_times_stay_usable`.
    let conn = setup();
    let f = fixture(&conn);
    let before = snapshot(&conn, &f.tid);
    let bad = |patch: OccurrenceOverride| {
        is_backwards(override_occurrence(&conn, &f.occ[0].entity.id, patch).unwrap_err())
    };
    assert!(bad(OccurrenceOverride {
        end_time: Some("09:00".into()),
        ..Default::default()
    }));
    assert!(bad(OccurrenceOverride {
        start_time: Some("12:00".into()),
        ..Default::default()
    }));
    // Every other field of a rejected patch is dropped too.
    assert!(bad(OccurrenceOverride {
        date: Some("2026-01-06".into()),
        start_time: Some("13:00".into()),
        end_time: Some("11:00".into()),
        cancelled: Some(true),
        location: Some(None),
        notes: Some(Some("lost".into())),
    }));
    assert_eq!(snapshot(&conn, &f.tid), before);
    assert_eq!(
        get_session_occurrence(&conn, &f.occ[0].entity.id)
            .unwrap()
            .notes,
        None
    );
    assert!(matches!(
        override_occurrence(&conn, "nope", OccurrenceOverride::default()).unwrap_err(),
        AppError::NotFound(_)
    ));
}

fn is_backwards(err: AppError) -> bool {
    matches!(err, AppError::InvalidInput(m) if m == "a session has to end after it starts")
}

#[test]
fn override_accepts_valid_times_and_untimed_patches() {
    let conn = setup();
    let f = fixture(&conn);
    let id = &f.occ[0].entity.id;
    let o = override_occurrence(
        &conn,
        id,
        OccurrenceOverride {
            start_time: Some("08:00".into()),
            end_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        (o.start_time.as_str(), o.end_time.as_str()),
        ("08:00", "09:00")
    );
    // One side alone is fine while the result still ends after it starts.
    let o = override_occurrence(
        &conn,
        id,
        OccurrenceOverride {
            end_time: Some("08:01".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(o.end_time, "08:01");
    override_occurrence(&conn, id, OccurrenceOverride::default()).unwrap();
    override_occurrence(&conn, id, ov("2026-01-07")).unwrap();
    let stored = get_session_occurrence(&conn, id).unwrap();
    assert_eq!(
        (
            stored.date.as_str(),
            stored.start_time.as_str(),
            stored.end_time.as_str()
        ),
        ("2026-01-07", "08:00", "08:01")
    );
}

#[test]
fn one_off_creation_validates_times() {
    let conn = setup();
    let (space, course) = crate::db::test_space_with_course(&conn, "Study", "Algorithms");
    let make = |start: &str, end: &str| {
        create_one_off_session(
            &conn,
            space.id.clone(),
            "Office hour".into(),
            course.id.clone(),
            "2026-01-05".into(),
            start.into(),
            end.into(),
            None,
        )
    };
    assert!(is_backwards(make("12:00", "10:00").unwrap_err()));
    assert!(is_backwards(make("10:00", "10:00").unwrap_err()));
    assert!(list_sessions(&conn, Some(&space.id)).unwrap().is_empty());
    make("10:00", "11:00").unwrap();
    assert_eq!(list_sessions(&conn, Some(&space.id)).unwrap().len(), 1);
}

#[test]
fn legacy_sessions_with_odd_times_stay_usable() {
    // A database from before the check can hold a template and occurrences
    // that end before they start. They still load, list and take every
    // change that doesn't touch their times, and nothing rewrites them.
    let conn = setup();
    let f = fixture(&conn);
    conn.execute(
        "UPDATE session_templates SET start_time = '12:00', end_time = '10:00' WHERE entity_id = ?1",
        params![f.tid],
    )
    .unwrap();
    conn.execute(
        "UPDATE sessions SET start_time = '12:00', end_time = '10:00' WHERE template_id = ?1",
        params![f.tid],
    )
    .unwrap();
    let id = &f.occ[0].entity.id;
    assert_eq!(
        get_session_template(&conn, &f.tid).unwrap().start_time,
        "12:00"
    );
    assert_eq!(list_session_templates(&conn, &f.space).unwrap().len(), 1);
    assert_eq!(list_sessions(&conn, Some(&f.space)).unwrap().len(), 4);
    let o = override_occurrence(
        &conn,
        id,
        OccurrenceOverride {
            date: Some("2026-01-06".into()),
            cancelled: Some(true),
            location: Some(None),
            notes: Some(Some("Moved".into())),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        (o.start_time.as_str(), o.end_time.as_str()),
        ("12:00", "10:00")
    );
    assert!(o.cancelled);
    // Changing only one time to something still backwards is rejected...
    assert!(is_backwards(
        override_occurrence(
            &conn,
            id,
            OccurrenceOverride {
                start_time: Some("11:00".into()),
                ..Default::default()
            },
        )
        .unwrap_err()
    ));
    // ...fixing both is accepted.
    let fixed = override_occurrence(
        &conn,
        id,
        OccurrenceOverride {
            start_time: Some("10:00".into()),
            end_time: Some("12:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(fixed.notes.as_deref(), Some("Moved"));
    // A series update always checks the times it ends up with, as before.
    assert!(is_backwards(
        update_session_series(&conn, &f.tid, "2026-01-01", SeriesPatch::default()).unwrap_err()
    ));
    update_session_series(
        &conn,
        &f.tid,
        "2026-01-01",
        SeriesPatch {
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
}

#[test]
fn generate_does_not_refill_dates_vacated_by_trashing_or_cancelling() {
    let conn = setup();
    let f = fixture(&conn);
    crate::db::entities::soft_delete_entity(&conn, &f.occ[1].entity.id).unwrap();
    override_occurrence(
        &conn,
        &f.occ[2].entity.id,
        OccurrenceOverride {
            date: Some("2026-01-20".into()),
            cancelled: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    let before = snapshot(&conn, &f.tid);
    let created = generate_occurrences(&conn, &f.tid, "2026-02-02").unwrap();
    assert_eq!(
        created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-02-02"]
    );
    assert_eq!(&snapshot(&conn, &f.tid)[..4], &before[..]);
    assert!(trashed(&conn, &f.occ[1].entity.id));
}

#[test]
fn generate_after_moving_back_onto_the_original_date_adds_nothing() {
    let conn = setup();
    let f = fixture(&conn);
    let id = &f.occ[1].entity.id;
    override_occurrence(&conn, id, ov("2026-01-14")).unwrap();
    assert!(generate_occurrences(&conn, &f.tid, "2026-01-26")
        .unwrap()
        .is_empty());
    override_occurrence(&conn, id, ov("2026-01-12")).unwrap();
    assert!(generate_occurrences(&conn, &f.tid, "2026-01-26")
        .unwrap()
        .is_empty());
    assert_eq!(row_count(&conn, &f.tid), 4);
    assert_eq!(
        get_session_occurrence(&conn, id).unwrap().date,
        "2026-01-12"
    );
}

#[test]
fn generate_after_a_move_still_extends_the_series_forward() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(&conn, &f.occ[1].entity.id, ov("2026-01-14")).unwrap();
    let created = generate_occurrences(&conn, &f.tid, "2026-02-09").unwrap();
    assert_eq!(
        created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-02-02", "2026-02-09"]
    );
    assert_eq!(row_count(&conn, &f.tid), 6);
    assert!(generate_occurrences(&conn, &f.tid, "2026-02-09")
        .unwrap()
        .is_empty());
}

#[test]
fn generate_gives_no_twin_to_an_occurrence_moved_onto_a_later_slot() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(&conn, &f.occ[3].entity.id, ov("2026-02-02")).unwrap();
    let created = generate_occurrences(&conn, &f.tid, "2026-02-09").unwrap();
    assert_eq!(
        created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-02-09"]
    );
    assert!(generate_occurrences(&conn, &f.tid, "2026-02-09")
        .unwrap()
        .is_empty());
}

#[test]
fn generate_does_not_resurrect_dates_after_empty_trash() {
    let conn = setup();
    let f = fixture(&conn);
    crate::db::entities::soft_delete_entity(&conn, &f.occ[1].entity.id).unwrap();
    crate::db::entities::empty_trash(&conn).unwrap();
    assert_eq!(row_count(&conn, &f.tid), 3);
    assert!(generate_occurrences(&conn, &f.tid, "2026-01-26")
        .unwrap()
        .is_empty());
    let created = generate_occurrences(&conn, &f.tid, "2026-02-02").unwrap();
    assert_eq!(created.len(), 1);
    assert_eq!(created[0].date, "2026-02-02");
}

#[test]
fn generate_on_existing_moved_data_alters_nothing() {
    // A released database: the series was generated once, then one
    // occurrence moved and another trashed. Generating further only adds new
    // slots and leaves every existing row exactly as it was.
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(&conn, &f.occ[1].entity.id, ov("2026-01-14")).unwrap();
    crate::db::entities::soft_delete_entity(&conn, &f.occ[2].entity.id).unwrap();
    let rows = |conn: &Connection| {
        f.occ
            .iter()
            .map(|o| {
                let s = get_session_occurrence(conn, &o.entity.id).unwrap();
                (
                    s.date,
                    s.start_time,
                    s.end_time,
                    s.cancelled,
                    s.entity.deleted_at,
                )
            })
            .collect::<Vec<_>>()
    };
    let before = rows(&conn);
    let created = generate_occurrences(&conn, &f.tid, "2026-02-09").unwrap();
    assert_eq!(
        created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-02-02", "2026-02-09"]
    );
    assert_eq!(rows(&conn), before);
}

#[test]
fn generate_on_data_the_old_refill_already_touched_alters_nothing() {
    // The old date check could refill a vacated slot. No released build ever
    // generated a series twice, but if such a twin exists it is kept as is,
    // and as the count reads one slot ahead the next new slot is skipped.
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(&conn, &f.occ[1].entity.id, ov("2026-01-14")).unwrap();
    let twin = create_occurrence(
        &conn,
        &f.space,
        "Lecture",
        &f.course,
        Some(f.tid.clone()),
        "2026-01-12".into(),
        "10:00".into(),
        "12:00".into(),
        Some("Room 1".into()),
    )
    .unwrap();
    crate::db::series::make_legacy::<SessionOccurrence>(&conn, &f.tid);
    let before = snapshot(&conn, &f.tid);
    let created = generate_occurrences(&conn, &f.tid, "2026-02-09").unwrap();
    assert_eq!(
        created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
        vec!["2026-02-09"]
    );
    assert_eq!(&snapshot(&conn, &f.tid)[..5], &before[..]);
    assert!(!trashed(&conn, &twin.entity.id));
}

#[test]
fn override_can_move_clear_and_toggle_without_touching_series_link() {
    let conn = setup();
    let f = fixture(&conn);
    let o = override_occurrence(
        &conn,
        &f.occ[0].entity.id,
        OccurrenceOverride {
            date: Some("2026-01-06".into()),
            location: Some(None),
            notes: Some(Some("Bring laptop".into())),
            cancelled: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(o.template_id.as_deref(), Some(f.tid.as_str()));
    let stored = get_session_occurrence(&conn, &f.occ[0].entity.id).unwrap();
    assert_eq!(stored.date, "2026-01-06");
    assert_eq!(stored.location, None);
    assert_eq!(stored.notes.as_deref(), Some("Bring laptop"));
    assert!(stored.cancelled);
    assert_eq!(
        get_session_template(&conn, &f.tid)
            .unwrap()
            .location
            .as_deref(),
        Some("Room 1")
    );
    update_session_series(
        &conn,
        &f.tid,
        "2026-01-01",
        SeriesPatch {
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    let after = get_session_occurrence(&conn, &f.occ[0].entity.id).unwrap();
    assert!(after.cancelled);
    // Notes are never templated, so a series update leaves them alone.
    assert_eq!(after.notes.as_deref(), Some("Bring laptop"));
}

// --- Explicit overrides (`overridden_fields`) ---------------------------

fn times(start: &str, end: &str) -> SeriesPatch {
    SeriesPatch {
        start_time: Some(start.into()),
        end_time: Some(end.into()),
        ..Default::default()
    }
}

#[test]
fn edit_all_after_edit_following_reaches_every_occurrence() {
    // The reported bug, mirrored from `calendar`: occurrences an earlier
    // edit from a later date didn't reach were skipped by an edit of all.
    let conn = setup();
    let f = fixture(&conn);
    update_session_series(&conn, &f.tid, &f.occ[2].date, times("11:00", "13:00")).unwrap();
    let rows = snapshot(&conn, &f.tid);
    assert_eq!((rows[1].2.as_str(), rows[2].2.as_str()), ("10:00", "11:00"));

    update_session_series(&conn, &f.tid, &f.occ[0].date, times("08:00", "09:30")).unwrap();
    for row in snapshot(&conn, &f.tid) {
        assert_eq!((row.2.as_str(), row.3.as_str()), ("08:00", "09:30"));
    }
}

#[test]
fn overridden_fields_keep_their_value_across_split_edits() {
    let conn = setup();
    let f = fixture(&conn);
    override_occurrence(
        &conn,
        &f.occ[0].entity.id,
        OccurrenceOverride {
            start_time: Some("09:00".into()),
            ..Default::default()
        },
    )
    .unwrap();
    override_occurrence(
        &conn,
        &f.occ[3].entity.id,
        OccurrenceOverride {
            location: Some(Some("Lab".into())),
            ..Default::default()
        },
    )
    .unwrap();
    update_session_series(&conn, &f.tid, &f.occ[2].date, times("11:00", "13:00")).unwrap();
    update_session_series(
        &conn,
        &f.tid,
        &f.occ[0].date,
        SeriesPatch {
            location: Some(Some("Hall".into())),
            ..times("08:00", "09:30")
        },
    )
    .unwrap();
    let rows = snapshot(&conn, &f.tid);
    assert_eq!(
        (rows[0].2.as_str(), rows[0].3.as_str(), rows[0].4.as_deref()),
        ("09:00", "09:30", Some("Hall"))
    );
    assert_eq!(
        (rows[1].2.as_str(), rows[1].4.as_deref()),
        ("08:00", Some("Hall"))
    );
    assert_eq!(
        (rows[3].2.as_str(), rows[3].4.as_deref()),
        ("08:00", Some("Lab"))
    );
}

#[test]
fn edit_following_back_then_edit_all_reaches_every_occurrence() {
    let conn = setup();
    let f = fixture(&conn);
    update_session_series(&conn, &f.tid, &f.occ[2].date, times("11:00", "13:00")).unwrap();
    update_session_series(&conn, &f.tid, &f.occ[2].date, times("10:00", "12:00")).unwrap();
    update_session_series(&conn, &f.tid, &f.occ[3].date, times("14:00", "15:00")).unwrap();
    update_session_series(&conn, &f.tid, &f.occ[0].date, times("08:00", "09:00")).unwrap();
    assert!(snapshot(&conn, &f.tid).iter().all(|r| r.2 == "08:00"));
}

#[test]
fn an_override_set_back_to_the_series_value_follows_again() {
    let conn = setup();
    let f = fixture(&conn);
    let id = &f.occ[1].entity.id;
    let start = |v: &str| OccurrenceOverride {
        start_time: Some(v.into()),
        ..Default::default()
    };
    override_occurrence(&conn, id, start("09:00")).unwrap();
    override_occurrence(&conn, id, start("10:00")).unwrap();
    update_session_series(&conn, &f.tid, &f.occ[0].date, times("08:00", "12:00")).unwrap();
    assert_eq!(
        get_session_occurrence(&conn, id).unwrap().start_time,
        "08:00"
    );
}

#[test]
fn resending_unchanged_values_is_not_an_override() {
    let conn = setup();
    let f = fixture(&conn);
    let id = &f.occ[1].entity.id;
    override_occurrence(
        &conn,
        id,
        OccurrenceOverride {
            date: Some(f.occ[1].date.clone()),
            start_time: Some("10:00".into()),
            end_time: Some("12:00".into()),
            location: Some(Some("Room 1".into())),
            cancelled: Some(true),
            notes: Some(Some("Bring laptop".into())),
        },
    )
    .unwrap();
    assert_eq!(
        get_session_occurrence(&conn, id).unwrap().overridden_fields,
        0
    );
    update_session_series(&conn, &f.tid, &f.occ[2].date, times("11:00", "13:00")).unwrap();
    update_session_series(&conn, &f.tid, &f.occ[0].date, times("08:00", "09:00")).unwrap();
    let o = get_session_occurrence(&conn, id).unwrap();
    assert_eq!(
        (o.start_time.as_str(), o.end_time.as_str()),
        ("08:00", "09:00")
    );
    assert_eq!(o.notes.as_deref(), Some("Bring laptop"));
}

#[test]
fn overridden_fields_stay_out_of_the_serialized_session() {
    let conn = setup();
    let f = fixture(&conn);
    let json = cli_get_session(&conn, &f.occ[0].entity.id).unwrap();
    assert!(json.get("overriddenFields").is_none());
    assert!(json.get("overridden_fields").is_none());
}
