//! Scenario tests for recurring calendar entries (`calendar`) and course
//! sessions (`sessions`): long sequences of user actions that mix series
//! occurrences and one-off instances, with the full stored state checked after
//! every step.
//!
//! Stories both entity types share run against each through the `Kind`
//! adapter (`shared!` generates one test per type). Entity specific stories
//! follow at the end. Rows are compared through `fmt`, one readable line per
//! occurrence: `2026-01-05 10:00-12:00 Lecture @Room 1 #notes ~end_date cancelled trashed`.

use crate::db::entities;
use crate::db::{calendar as cal, sessions as ses};
use crate::error::{AppError, AppResult};
use chrono::{Datelike, Days, Months, NaiveDate};
use rusqlite::Connection;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

// --- Rows -------------------------------------------------------------------

/// One stored occurrence, as the user sees it. Field order makes the derived
/// `Ord` sort by date, then start time.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Row {
    date: String,
    start: Option<String>,
    end: Option<String>,
    title: String,
    location: Option<String>,
    /// A calendar entry's description, a session's notes.
    text: Option<String>,
    all_day: bool,
    end_date: Option<String>,
    cancelled: bool,
    trashed: bool,
}

fn fmt(r: &Row) -> String {
    let mut s = format!("{} ", r.date);
    if r.all_day {
        s.push_str("all-day");
    } else {
        s.push_str(&format!(
            "{}-{}",
            r.start.as_deref().unwrap_or("?"),
            r.end.as_deref().unwrap_or("?")
        ));
    }
    s.push_str(&format!(" {}", r.title));
    if let Some(l) = &r.location {
        s.push_str(&format!(" @{l}"));
    }
    if let Some(t) = &r.text {
        s.push_str(&format!(" #{t}"));
    }
    if let Some(e) = &r.end_date {
        s.push_str(&format!(" ~{e}"));
    }
    if r.cancelled {
        s.push_str(" cancelled");
    }
    if r.trashed {
        s.push_str(" trashed");
    }
    s
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Occ {
    id: String,
    template_id: Option<String>,
    row: Row,
    /// `overridden_fields`.
    mask: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Tpl {
    title: String,
    start: Option<String>,
    end: Option<String>,
    location: Option<String>,
    text: Option<String>,
    all_day: bool,
    cadence: String,
    anchor: String,
    /// A session template's weekday; calendar templates have none.
    weekday: Option<i64>,
    trashed: bool,
}

fn fmt_tpl(t: &Tpl) -> String {
    let mut s = t.title.clone();
    if t.all_day {
        s.push_str(" all-day");
    } else {
        s.push_str(&format!(
            " {}-{}",
            t.start.as_deref().unwrap_or("?"),
            t.end.as_deref().unwrap_or("?")
        ));
    }
    if let Some(l) = &t.location {
        s.push_str(&format!(" @{l}"));
    }
    if let Some(d) = &t.text {
        s.push_str(&format!(" #{d}"));
    }
    if t.trashed {
        s.push_str(" trashed");
    }
    s
}

/// Reads every occurrence row with one query; `sql` selects the 13 columns
/// in the order below.
fn read_occs(conn: &Connection, sql: &str) -> Vec<Occ> {
    let mut stmt = conn.prepare(sql).unwrap();
    stmt.query_map([], |r| {
        Ok(Occ {
            id: r.get(0)?,
            template_id: r.get(3)?,
            row: Row {
                title: r.get(1)?,
                trashed: r.get::<_, Option<String>>(2)?.is_some(),
                date: r.get(4)?,
                end_date: r.get(5)?,
                start: r.get(6)?,
                end: r.get(7)?,
                all_day: r.get::<_, i64>(8)? != 0,
                cancelled: r.get::<_, i64>(9)? != 0,
                location: r.get(10)?,
                text: r.get(11)?,
            },
            mask: r.get(12)?,
        })
    })
    .unwrap()
    .collect::<Result<_, _>>()
    .unwrap()
}

/// Every stored row of the occurrence tables and their templates, as text, for
/// "a failed call changed nothing" checks.
fn dump(conn: &Connection) -> Vec<String> {
    let mut out = Vec::new();
    for table in [
        "entities",
        "calendar_entries",
        "calendar_entry_templates",
        "sessions",
        "session_templates",
        "relationships",
    ] {
        let mut stmt = conn.prepare(&format!("SELECT * FROM {table}")).unwrap();
        let n = stmt.column_count();
        let rows: Vec<String> = stmt
            .query_map([], |row| {
                let values = (0..n)
                    .map(|i| row.get::<_, rusqlite::types::Value>(i))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(format!("{table}: {values:?}"))
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        out.extend(rows);
    }
    out.sort();
    out
}

/// Runs a call that must fail and checks it left every stored row as it was.
fn fails_cleanly<T: std::fmt::Debug>(
    conn: &Connection,
    call: impl FnOnce() -> AppResult<T>,
) -> AppError {
    let before = dump(conn);
    let err = call().expect_err("expected the call to fail");
    assert_eq!(dump(conn), before, "a failed call changed stored data");
    err
}

fn is_invalid(err: &AppError) -> bool {
    matches!(err, AppError::InvalidInput(_))
}

// --- Inputs -----------------------------------------------------------------

struct Spec<'a> {
    title: &'a str,
    cadence: &'a str,
    anchor: &'a str,
    start: &'a str,
    end: &'a str,
    location: Option<&'a str>,
}

fn weekly<'a>(title: &'a str, anchor: &'a str, start: &'a str, end: &'a str) -> Spec<'a> {
    Spec {
        title,
        cadence: "weekly",
        anchor,
        start,
        end,
        location: None,
    }
}

/// A single occurrence change, as the "this one" scope sends it.
#[derive(Debug, Clone, Default)]
struct Ov {
    date: Option<String>,
    start: Option<String>,
    end: Option<String>,
    cancelled: Option<bool>,
    location: Option<Option<String>>,
}

fn ov() -> Ov {
    Ov::default()
}

impl Ov {
    fn date(mut self, d: &str) -> Self {
        self.date = Some(d.into());
        self
    }
    fn start(mut self, t: &str) -> Self {
        self.start = Some(t.into());
        self
    }
    fn end(mut self, t: &str) -> Self {
        self.end = Some(t.into());
        self
    }
    fn times(self, s: &str, e: &str) -> Self {
        self.start(s).end(e)
    }
    fn cancel(mut self, c: bool) -> Self {
        self.cancelled = Some(c);
        self
    }
    fn loc(mut self, l: Option<&str>) -> Self {
        self.location = Some(l.map(Into::into));
        self
    }
}

/// A series change; `None` fields stay as they are.
#[derive(Debug, Clone, Default)]
struct Edit {
    title: Option<String>,
    start: Option<String>,
    end: Option<String>,
    location: Option<Option<String>>,
}

fn edit() -> Edit {
    Edit::default()
}

impl Edit {
    fn title(mut self, t: &str) -> Self {
        self.title = Some(t.into());
        self
    }
    fn start(mut self, t: &str) -> Self {
        self.start = Some(t.into());
        self
    }
    fn end(mut self, t: &str) -> Self {
        self.end = Some(t.into());
        self
    }
    fn times(self, s: &str, e: &str) -> Self {
        self.start(s).end(e)
    }
    fn loc(mut self, l: Option<&str>) -> Self {
        self.location = Some(l.map(Into::into));
        self
    }
}

#[derive(Clone)]
struct Ctx {
    space: String,
    /// The Course a session belongs to; empty for calendar entries.
    course: String,
}

// --- The adapter ----------------------------------------------------------

/// What a series story needs from an entity type.
trait Kind {
    /// Cadences this type supports.
    const CADENCES: &'static [&'static str];
    fn ctx(conn: &Connection, name: &str) -> Ctx;
    fn series(conn: &Connection, ctx: &Ctx, spec: &Spec) -> AppResult<String>;
    fn generate(conn: &Connection, tid: &str, until: &str) -> AppResult<Vec<String>>;
    fn override_(conn: &Connection, id: &str, ov: Ov) -> AppResult<()>;
    fn edit(conn: &Connection, tid: &str, from: &str, e: Edit) -> AppResult<()>;
    fn delete(conn: &Connection, tid: &str, from: &str) -> AppResult<usize>;
    fn one_off(conn: &Connection, ctx: &Ctx, spec: &Spec) -> AppResult<String>;
    /// Every occurrence row (one-offs and trashed included), by date then key.
    fn all(conn: &Connection) -> Vec<Occ>;
    /// One occurrence through the module's public getter.
    fn get(conn: &Connection, id: &str) -> Row;
    fn template(conn: &Connection, tid: &str) -> Tpl;
    /// Titles from the module's template listing.
    fn templates(conn: &Connection, space: &str) -> Vec<String>;
    /// The module's occurrence listing for one Space, in its own order.
    fn listed(conn: &Connection, space: &str) -> Vec<String>;
    /// The edit form's "this one" scope: every field re-sent as JSON, the way
    /// the popover submits it.
    fn ui_this(conn: &Connection, id: &str, start: &str, end: &str, location: Option<&str>);
    /// The edit form's series scopes: a JSON patch holding only the fields that
    /// differ from the opened occurrence, from that occurrence's date
    /// ("This and following") or from `today` ("All upcoming").
    /// Both scopes pass the opened occurrence as the edit's anchor.
    fn ui_series(
        conn: &Connection,
        opened: &str,
        today: Option<&str>,
        start: &str,
        end: &str,
        location: Option<&str>,
    );
}

struct Cal;
struct Ses;

const CAL_SQL: &str = "SELECT e.id, e.title, e.deleted_at, a.template_id, a.date, a.end_date,
        a.start_time, a.end_time, a.all_day, a.cancelled, a.location, a.description, a.overridden_fields
     FROM entities e JOIN calendar_entries a ON a.entity_id = e.id ORDER BY a.date, e.key_number";
const SES_SQL: &str = "SELECT e.id, e.title, e.deleted_at, s.template_id, s.date, NULL,
        s.start_time, s.end_time, 0, s.cancelled, s.location, s.notes, s.overridden_fields
     FROM entities e JOIN sessions s ON s.entity_id = e.id ORDER BY s.date, e.key_number";

fn cal_row(o: cal::CalendarEntry) -> Row {
    Row {
        date: o.date,
        start: o.start_time,
        end: o.end_time,
        title: o.entity.title,
        location: o.location,
        text: o.description,
        all_day: o.all_day,
        end_date: o.end_date,
        cancelled: o.cancelled,
        trashed: o.entity.deleted_at.is_some(),
    }
}

fn ses_row(o: ses::SessionOccurrence) -> Row {
    Row {
        date: o.date,
        start: Some(o.start_time),
        end: Some(o.end_time),
        title: o.entity.title,
        location: o.location,
        text: o.notes,
        all_day: false,
        end_date: None,
        cancelled: o.cancelled,
        trashed: o.entity.deleted_at.is_some(),
    }
}

/// The JSON patch the series scopes send: only fields that differ from the
/// opened occurrence (`CalendarEntryEditForm` / `SessionEditForm`).
fn ui_patch(
    row: &Row,
    start: &str,
    end: &str,
    location: Option<&str>,
) -> serde_json::Map<String, serde_json::Value> {
    let mut patch = serde_json::Map::new();
    if row.start.as_deref() != Some(start) {
        patch.insert("startTime".into(), json!(start));
    }
    if row.end.as_deref() != Some(end) {
        patch.insert("endTime".into(), json!(end));
    }
    if row.location.as_deref() != location {
        patch.insert("location".into(), json!(location));
    }
    patch
}

impl Kind for Cal {
    const CADENCES: &'static [&'static str] = &["daily", "weekly", "monthly"];

    fn ctx(conn: &Connection, name: &str) -> Ctx {
        Ctx {
            space: crate::db::test_space(conn, name).id,
            course: String::new(),
        }
    }

    fn series(conn: &Connection, ctx: &Ctx, s: &Spec) -> AppResult<String> {
        cal::create_calendar_entry_template(
            conn,
            ctx.space.clone(),
            s.title.into(),
            s.cadence.into(),
            Some(s.start.into()),
            Some(s.end.into()),
            false,
            s.location.map(Into::into),
            None,
            s.anchor.into(),
        )
        .map(|e| e.id)
    }

    fn generate(conn: &Connection, tid: &str, until: &str) -> AppResult<Vec<String>> {
        Ok(cal::generate_occurrences(conn, tid, until)?
            .into_iter()
            .map(|o| o.date)
            .collect())
    }

    fn override_(conn: &Connection, id: &str, o: Ov) -> AppResult<()> {
        cal::override_occurrence(
            conn,
            id,
            cal::CalendarEntryOverride {
                date: o.date,
                start_time: o.start.map(Some),
                end_time: o.end.map(Some),
                cancelled: o.cancelled,
                location: o.location,
                ..Default::default()
            },
        )
        .map(|_| ())
    }

    fn edit(conn: &Connection, tid: &str, from: &str, e: Edit) -> AppResult<()> {
        cal::update_calendar_entry_series(
            conn,
            tid,
            from,
            cal::CalendarEntrySeriesPatch {
                title: e.title,
                start_time: e.start.map(Some),
                end_time: e.end.map(Some),
                location: e.location,
                ..Default::default()
            },
        )
    }

    fn delete(conn: &Connection, tid: &str, from: &str) -> AppResult<usize> {
        cal::delete_calendar_entry_series(conn, tid, from)
    }

    fn one_off(conn: &Connection, ctx: &Ctx, s: &Spec) -> AppResult<String> {
        cal::create_one_off_calendar_entry(
            conn,
            ctx.space.clone(),
            s.title.into(),
            s.anchor.into(),
            None,
            Some(s.start.into()),
            Some(s.end.into()),
            false,
            s.location.map(Into::into),
            None,
        )
        .map(|o| o.entity.id)
    }

    fn all(conn: &Connection) -> Vec<Occ> {
        read_occs(conn, CAL_SQL)
    }

    fn get(conn: &Connection, id: &str) -> Row {
        cal_row(cal::get_calendar_entry(conn, id).unwrap())
    }

    fn template(conn: &Connection, tid: &str) -> Tpl {
        let t = cal::get_calendar_entry_template(conn, tid).unwrap();
        Tpl {
            title: t.entity.title,
            start: t.start_time,
            end: t.end_time,
            location: t.location,
            text: t.description,
            all_day: t.all_day,
            cadence: t.recurrence,
            anchor: t.anchor_date,
            weekday: None,
            trashed: t.entity.deleted_at.is_some(),
        }
    }

    fn templates(conn: &Connection, space: &str) -> Vec<String> {
        cal::list_calendar_entry_templates(conn, space)
            .unwrap()
            .into_iter()
            .map(|t| t.entity.title)
            .collect()
    }

    fn listed(conn: &Connection, space: &str) -> Vec<String> {
        cal::list_calendar_entries(conn, Some(space))
            .unwrap()
            .into_iter()
            .map(|o| fmt(&cal_row(o)))
            .collect()
    }

    fn ui_this(conn: &Connection, id: &str, start: &str, end: &str, location: Option<&str>) {
        let e = cal::get_calendar_entry(conn, id).unwrap();
        let patch: cal::CalendarEntryOverride = serde_json::from_value(json!({
            "date": e.date,
            "endDate": e.end_date,
            "startTime": start,
            "endTime": end,
            "allDay": false,
            "location": location,
        }))
        .unwrap();
        cal::override_occurrence(conn, id, patch).unwrap();
    }

    fn ui_series(
        conn: &Connection,
        opened: &str,
        today: Option<&str>,
        start: &str,
        end: &str,
        location: Option<&str>,
    ) {
        let e = cal::get_calendar_entry(conn, opened).unwrap();
        let tid = e.template_id.clone().unwrap();
        let from = today.map(String::from).unwrap_or_else(|| e.date.clone());
        let patch = ui_patch(&cal_row(e), start, end, location);
        let patch: cal::CalendarEntrySeriesPatch =
            serde_json::from_value(serde_json::Value::Object(patch)).unwrap();
        cal::update_calendar_entry_series_anchored(conn, &tid, &from, Some(opened), patch).unwrap();
    }
}

fn weekday_of(date: &str) -> i64 {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| i64::from(d.weekday().num_days_from_monday()))
        .unwrap_or(0)
}

impl Kind for Ses {
    const CADENCES: &'static [&'static str] = &["weekly"];

    fn ctx(conn: &Connection, name: &str) -> Ctx {
        let (space, course) = crate::db::test_space_with_course(conn, name, "Algorithms");
        Ctx {
            space: space.id,
            course: course.id,
        }
    }

    fn series(conn: &Connection, ctx: &Ctx, s: &Spec) -> AppResult<String> {
        assert_eq!(s.cadence, "weekly", "sessions only repeat weekly");
        ses::create_session_template(
            conn,
            ctx.space.clone(),
            s.title.into(),
            ctx.course.clone(),
            weekday_of(s.anchor),
            s.start.into(),
            s.end.into(),
            s.location.map(Into::into),
            s.anchor.into(),
        )
        .map(|e| e.id)
    }

    fn generate(conn: &Connection, tid: &str, until: &str) -> AppResult<Vec<String>> {
        Ok(ses::generate_occurrences(conn, tid, until)?
            .into_iter()
            .map(|o| o.date)
            .collect())
    }

    fn override_(conn: &Connection, id: &str, o: Ov) -> AppResult<()> {
        ses::override_occurrence(
            conn,
            id,
            ses::OccurrenceOverride {
                date: o.date,
                start_time: o.start,
                end_time: o.end,
                cancelled: o.cancelled,
                location: o.location,
                notes: None,
            },
        )
        .map(|_| ())
    }

    fn edit(conn: &Connection, tid: &str, from: &str, e: Edit) -> AppResult<()> {
        ses::update_session_series(
            conn,
            tid,
            from,
            ses::SeriesPatch {
                title: e.title,
                start_time: e.start,
                end_time: e.end,
                location: e.location,
            },
        )
    }

    fn delete(conn: &Connection, tid: &str, from: &str) -> AppResult<usize> {
        ses::delete_session_series(conn, tid, from)
    }

    fn one_off(conn: &Connection, ctx: &Ctx, s: &Spec) -> AppResult<String> {
        ses::create_one_off_session(
            conn,
            ctx.space.clone(),
            s.title.into(),
            ctx.course.clone(),
            s.anchor.into(),
            s.start.into(),
            s.end.into(),
            s.location.map(Into::into),
        )
        .map(|o| o.entity.id)
    }

    fn all(conn: &Connection) -> Vec<Occ> {
        read_occs(conn, SES_SQL)
    }

    fn get(conn: &Connection, id: &str) -> Row {
        ses_row(ses::get_session_occurrence(conn, id).unwrap())
    }

    fn template(conn: &Connection, tid: &str) -> Tpl {
        let t = ses::get_session_template(conn, tid).unwrap();
        Tpl {
            title: t.entity.title,
            start: Some(t.start_time),
            end: Some(t.end_time),
            location: t.location,
            text: None,
            all_day: false,
            cadence: "weekly".into(),
            anchor: t.anchor_date,
            weekday: Some(t.weekday),
            trashed: t.entity.deleted_at.is_some(),
        }
    }

    fn templates(conn: &Connection, space: &str) -> Vec<String> {
        ses::list_session_templates(conn, space)
            .unwrap()
            .into_iter()
            .map(|t| t.entity.title)
            .collect()
    }

    fn listed(conn: &Connection, space: &str) -> Vec<String> {
        ses::list_sessions(conn, Some(space))
            .unwrap()
            .into_iter()
            .map(|o| fmt(&ses_row(o)))
            .collect()
    }

    fn ui_this(conn: &Connection, id: &str, start: &str, end: &str, location: Option<&str>) {
        let o = ses::get_session_occurrence(conn, id).unwrap();
        let patch: ses::OccurrenceOverride = serde_json::from_value(json!({
            "date": o.date,
            "startTime": start,
            "endTime": end,
            "location": location,
        }))
        .unwrap();
        ses::override_occurrence(conn, id, patch).unwrap();
    }

    fn ui_series(
        conn: &Connection,
        opened: &str,
        today: Option<&str>,
        start: &str,
        end: &str,
        location: Option<&str>,
    ) {
        let o = ses::get_session_occurrence(conn, opened).unwrap();
        let tid = o.template_id.clone().unwrap();
        let from = today.map(String::from).unwrap_or_else(|| o.date.clone());
        let patch = ui_patch(&ses_row(o), start, end, location);
        let patch: ses::SeriesPatch =
            serde_json::from_value(serde_json::Value::Object(patch)).unwrap();
        ses::update_session_series_anchored(conn, &tid, &from, Some(opened), patch).unwrap();
    }
}

// --- Scenario helpers -----------------------------------------------------

fn rows<K: Kind>(c: &Connection, tid: &str) -> Vec<Occ> {
    K::all(c)
        .into_iter()
        .filter(|o| o.template_id.as_deref() == Some(tid))
        .collect()
}

/// A series' occurrences (trashed included), sorted, one line each.
fn view<K: Kind>(c: &Connection, tid: &str) -> Vec<String> {
    let mut r: Vec<Row> = rows::<K>(c, tid).into_iter().map(|o| o.row).collect();
    r.sort();
    r.iter().map(fmt).collect()
}

fn one_offs<K: Kind>(c: &Connection) -> Vec<String> {
    let mut r: Vec<Row> = K::all(c)
        .into_iter()
        .filter(|o| o.template_id.is_none())
        .map(|o| o.row)
        .collect();
    r.sort();
    r.iter().map(fmt).collect()
}

fn tpl<K: Kind>(c: &Connection, tid: &str) -> String {
    fmt_tpl(&K::template(c, tid))
}

/// The one occurrence of `tid` sitting on `date`.
fn on<K: Kind>(c: &Connection, tid: &str, date: &str) -> String {
    let ids: Vec<String> = rows::<K>(c, tid)
        .into_iter()
        .filter(|o| o.row.date == date)
        .map(|o| o.id)
        .collect();
    assert_eq!(ids.len(), 1, "expected exactly one occurrence on {date}");
    ids[0].clone()
}

fn row_of<K: Kind>(c: &Connection, id: &str) -> String {
    fmt(&K::get(c, id))
}

const A: &str = "2026-01-05";
const B: &str = "2026-01-12";
const C: &str = "2026-01-19";
const D: &str = "2026-01-26";

/// A Monday "Lecture", 10:00 to 12:00 in Room 1, generated 01-05 to 01-26.
fn lecture<K: Kind>(c: &Connection, ctx: &Ctx) -> String {
    let tid = K::series(
        c,
        ctx,
        &Spec {
            location: Some("Room 1"),
            ..weekly("Lecture", A, "10:00", "12:00")
        },
    )
    .unwrap();
    assert_eq!(K::generate(c, &tid, D).unwrap(), [A, B, C, D]);
    tid
}

fn setup<K: Kind>() -> (Connection, Ctx, String) {
    let c = crate::db::test_conn();
    let ctx = K::ctx(&c, "Study");
    let tid = lecture::<K>(&c, &ctx);
    (c, ctx, tid)
}

fn add(date: &str, cadence: &str, n: u32) -> String {
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap();
    let mut cur = d;
    for _ in 0..n {
        cur = match cadence {
            "daily" => cur + Days::new(1),
            "monthly" => cur.checked_add_months(Months::new(1)).unwrap(),
            _ => cur + Days::new(7),
        };
    }
    cur.format("%Y-%m-%d").to_string()
}

fn trash(c: &Connection, id: &str) {
    entities::soft_delete_entity(c, id).unwrap();
}

fn restore(c: &Connection, id: &str) {
    entities::restore_entity(c, id).unwrap();
}

/// One test per entity type for each generic story.
macro_rules! shared {
    ($($name:ident),* $(,)?) => {
        mod calendar_entries {
            $( #[test] fn $name() { super::$name::<super::Cal>(); } )*
        }
        mod course_sessions {
            $( #[test] fn $name() { super::$name::<super::Ses>(); } )*
        }
    };
}

// ===========================================================================
// 0. The reported bug, written from how series edits are SUPPOSED to work:
//    every occurrence from the from-date on follows a series edit, except a
//    field the user changed on that one occurrence alone ("This one"). The
//    sequences replay what the edit popovers send (`ui_this`, `ui_series`).
// ===========================================================================

const T1: (&str, &str) = ("09:00", "10:00");
const T2: (&str, &str) = ("11:00", "12:00");
const T3: (&str, &str) = ("14:00", "15:30");
const SPEC_OCCURRENCES: u32 = 10;

/// A ten occurrence series at T1 in Room 1, by cadence.
fn spec_series<K: Kind>(c: &Connection, cadence: &str) -> (String, Vec<String>) {
    let ctx = K::ctx(c, cadence);
    let anchor = match cadence {
        "daily" => "2026-03-04",
        "monthly" => "2026-01-15",
        _ => "2026-03-02",
    };
    let tid = K::series(
        c,
        &ctx,
        &Spec {
            title: "Standup",
            cadence,
            anchor,
            start: T1.0,
            end: T1.1,
            location: Some("Room 1"),
        },
    )
    .unwrap();
    let dates = K::generate(c, &tid, &add(anchor, cadence, SPEC_OCCURRENCES - 1)).unwrap();
    assert_eq!(dates.len(), SPEC_OCCURRENCES as usize);
    let ids = dates.iter().map(|d| on::<K>(c, &tid, d)).collect();
    (tid, ids)
}

/// `date start-end @location` of every occurrence, in date order.
fn times<K: Kind>(c: &Connection, tid: &str) -> Vec<String> {
    rows::<K>(c, tid)
        .into_iter()
        .map(|o| {
            format!(
                "{} {}-{} @{}",
                o.row.date,
                o.row.start.unwrap_or_default(),
                o.row.end.unwrap_or_default(),
                o.row.location.unwrap_or_default()
            )
        })
        .collect()
}

/// What `times` should show: `expected(i)` gives occurrence i's times.
fn expect_times<K: Kind>(
    c: &Connection,
    tid: &str,
    location: &str,
    expected: impl Fn(usize) -> (&'static str, &'static str),
) -> Vec<String> {
    rows::<K>(c, tid)
        .iter()
        .enumerate()
        .map(|(i, o)| {
            let (s, e) = expected(i);
            format!("{} {s}-{e} @{location}", o.row.date)
        })
        .collect()
}

/// (a) "This and following" from a middle occurrence X to T2, then the series
/// from the first occurrence F to T3: every occurrence, F..X-1 included, is T3.
fn spec_following_from_middle_then_from_first_reaches_every_occurrence<K: Kind>() {
    for cadence in K::CADENCES {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_series(&c, &ids[5], None, T2.0, T2.1, Some("Room 1"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |i| if i < 5 { T1 } else { T2 }),
            "{cadence}: after the following edit"
        );
        K::ui_series(&c, &ids[0], None, T3.0, T3.1, Some("Room 1"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |_| T3),
            "{cadence}: an edit from the first occurrence reaches every occurrence"
        );
    }
}

/// (b) "This one" on F to T2, "This one" on F back to T1, then the series from
/// F to T3. Setting F back to the series value ends its override, so every
/// occurrence, F included, is T3.
fn spec_this_edit_and_back_then_series_edit_from_first<K: Kind>() {
    for cadence in K::CADENCES {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_this(&c, &ids[0], T2.0, T2.1, Some("Room 1"));
        K::ui_this(&c, &ids[0], T1.0, T1.1, Some("Room 1"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |_| T1),
            "{cadence}"
        );
        K::ui_series(&c, &ids[0], None, T3.0, T3.1, Some("Room 1"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |_| T3),
            "{cadence}"
        );
    }
}

/// (c) The series from F to T2, back to T1 from F, then T3 from F.
fn spec_series_edit_there_and_back_then_again_from_first<K: Kind>() {
    for cadence in K::CADENCES {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        for (step, t) in [T2, T1, T3].into_iter().enumerate() {
            K::ui_series(&c, &ids[0], None, t.0, t.1, Some("Room 1"));
            assert_eq!(
                times::<K>(&c, &tid),
                expect_times::<K>(&c, &tid, "Room 1", |_| t),
                "{cadence}: step {step}"
            );
        }
    }
}

/// (d) "This one" on five consecutive occurrences (2..=6) to T2, then the
/// series from F to T3 and to another location. Spec: those five were edited
/// on their own, so they keep their T2 times; the location they never touched
/// follows the series like everywhere else.
fn spec_five_individually_edited_occurrences_keep_their_time<K: Kind>() {
    for cadence in K::CADENCES {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        for id in &ids[2..7] {
            K::ui_this(&c, id, T2.0, T2.1, Some("Room 1"));
        }
        K::ui_series(&c, &ids[0], None, T3.0, T3.1, Some("Hall"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Hall", |i| if (2..7).contains(&i) {
                T2
            } else {
                T3
            }),
            "{cadence}"
        );
    }
}

/// The user's report, step by step: open occurrence X, edit its time
/// ("This and following"), open it again and edit it back, then edit
/// "All upcoming" (from today, here X's date) to a third time. Every
/// occurrence from X on must show T3, the ones before X stay T1. Replayed
/// for X as the first, a middle and a late occurrence, and with every
/// combination of series scopes for the first two edits.
fn spec_users_report_edit_edit_back_then_all_upcoming<K: Kind>() {
    for cadence in K::CADENCES {
        for x in [0usize, 3, 7] {
            for (s1, s2) in [(false, false), (false, true), (true, false), (true, true)] {
                let c = crate::db::test_conn();
                let (tid, ids) = spec_series::<K>(&c, cadence);
                let today = rows::<K>(&c, &tid)[x].row.date.clone();
                let scope = |upcoming: bool| upcoming.then_some(today.as_str());
                K::ui_series(&c, &ids[x], scope(s1), T2.0, T2.1, Some("Room 1"));
                K::ui_series(&c, &ids[x], scope(s2), T1.0, T1.1, Some("Room 1"));
                assert_eq!(
                    times::<K>(&c, &tid),
                    expect_times::<K>(&c, &tid, "Room 1", |_| T1),
                    "{cadence} x={x} scopes={s1},{s2}: after editing back"
                );
                K::ui_series(&c, &ids[x], Some(&today), T3.0, T3.1, Some("Room 1"));
                assert_eq!(
                    times::<K>(&c, &tid),
                    expect_times::<K>(&c, &tid, "Room 1", |i| if i < x { T1 } else { T3 }),
                    "{cadence} x={x} scopes={s1},{s2}: after all upcoming"
                );
            }
        }
    }
}

/// The same with "This one" for the first two edits (edit X, edit X back),
/// then "All upcoming" from X.
fn spec_users_report_with_this_one_edits_then_all_upcoming<K: Kind>() {
    for cadence in K::CADENCES {
        for x in [0usize, 3, 7] {
            let c = crate::db::test_conn();
            let (tid, ids) = spec_series::<K>(&c, cadence);
            let today = rows::<K>(&c, &tid)[x].row.date.clone();
            K::ui_this(&c, &ids[x], T2.0, T2.1, Some("Room 1"));
            K::ui_this(&c, &ids[x], T1.0, T1.1, Some("Room 1"));
            K::ui_series(&c, &ids[x], Some(&today), T3.0, T3.1, Some("Room 1"));
            assert_eq!(
                times::<K>(&c, &tid),
                expect_times::<K>(&c, &tid, "Room 1", |i| if i < x { T1 } else { T3 }),
                "{cadence} x={x}"
            );
        }
    }
}

/// Every pair of series edits (opened on the first, a middle or the last
/// occurrence, "This and following" or "All upcoming" from the first date)
/// to T2 and back to T1, then "All upcoming" from the first occurrence's date
/// opened on any occurrence: no individual override exists, so every
/// occurrence ends up T3.
fn spec_every_series_edit_combination_then_all_upcoming_reaches_everything<K: Kind>() {
    for cadence in K::CADENCES {
        for o1 in [0usize, 4, 9] {
            for o2 in [0usize, 4, 9] {
                for s1 in [false, true] {
                    for s2 in [false, true] {
                        for o3 in [0usize, 4, 9] {
                            let c = crate::db::test_conn();
                            let (tid, ids) = spec_series::<K>(&c, cadence);
                            let first = rows::<K>(&c, &tid)[0].row.date.clone();
                            let scope = |u: bool| u.then_some(first.as_str());
                            K::ui_series(&c, &ids[o1], scope(s1), T2.0, T2.1, Some("Room 1"));
                            K::ui_series(&c, &ids[o2], scope(s2), T1.0, T1.1, Some("Room 1"));
                            K::ui_series(&c, &ids[o3], Some(&first), T3.0, T3.1, Some("Room 1"));
                            assert_eq!(
                                times::<K>(&c, &tid),
                                expect_times::<K>(&c, &tid, "Room 1", |_| T3),
                                "{cadence} opened {o1}/{o2}/{o3} upcoming {s1}/{s2}"
                            );
                        }
                    }
                }
            }
        }
    }
}

/// (e) Clearing the location of the whole series from the form: the popover
/// sends `{"location": null}`. Spec: every occurrence loses its location.
fn spec_clearing_the_series_location_from_the_form_clears_it<K: Kind>() {
    let c = crate::db::test_conn();
    let (tid, ids) = spec_series::<K>(&c, "weekly");
    let first = rows::<K>(&c, &tid)[0].row.date.clone();
    K::ui_series(&c, &ids[0], Some(&first), T1.0, T1.1, None);
    assert_eq!(K::template(&c, &tid).location, None, "template location");
    assert!(
        rows::<K>(&c, &tid).iter().all(|o| o.row.location.is_none()),
        "occurrence locations: {:?}",
        times::<K>(&c, &tid)
    );
}

/// (e) Clearing one occurrence's location ("This one" re-sends every field,
/// `location: null` when the input is empty). Spec: that occurrence has none.
fn spec_clearing_one_occurrences_location_from_the_form_clears_it<K: Kind>() {
    let c = crate::db::test_conn();
    let (tid, ids) = spec_series::<K>(&c, "weekly");
    K::ui_this(&c, &ids[1], T1.0, T1.1, None);
    assert_eq!(K::get(&c, &ids[1]).location, None);
    assert_eq!(K::template(&c, &tid).location.as_deref(), Some("Room 1"));
}

/// (e) The JSON the popovers send, deserialized the way the Tauri command
/// receives it. An absent field leaves the value alone; `null` clears it.
#[test]
fn spec_frontend_patch_json_round_trips() {
    let p: cal::CalendarEntrySeriesPatch =
        serde_json::from_value(json!({"startTime": "10:00"})).unwrap();
    assert_eq!(p.start_time, Some(Some("10:00".into())));
    assert_eq!((p.end_time, p.location, p.all_day), (None, None, None));
    let p: ses::SeriesPatch = serde_json::from_value(json!({"startTime": "10:00"})).unwrap();
    assert_eq!(p.start_time.as_deref(), Some("10:00"));
    assert_eq!(p.end_time, None);
    let p: cal::CalendarEntrySeriesPatch = serde_json::from_value(json!({})).unwrap();
    assert_eq!(p.location, None, "absent means unchanged");

    // Clearing: the form sends null.
    let p: cal::CalendarEntrySeriesPatch =
        serde_json::from_value(json!({"location": null})).unwrap();
    assert_eq!(p.location, Some(None), "calendar series patch: null clears");
    let p: ses::SeriesPatch = serde_json::from_value(json!({"location": null})).unwrap();
    assert_eq!(p.location, Some(None), "session series patch: null clears");
    let p: cal::CalendarEntryOverride =
        serde_json::from_value(json!({"location": null, "endDate": null})).unwrap();
    assert_eq!(p.location, Some(None), "calendar override: null clears");
    assert_eq!(
        p.end_date,
        Some(None),
        "calendar override: null clears endDate"
    );
    let p: ses::OccurrenceOverride = serde_json::from_value(json!({"location": null})).unwrap();
    assert_eq!(p.location, Some(None), "session override: null clears");
}

/// (e) An all-day switch from the calendar form sends `startTime: null`.
/// Spec: the series becomes all day with no times.
#[test]
fn spec_calendar_all_day_switch_from_the_form_drops_the_times() {
    let c = crate::db::test_conn();
    let (tid, _) = spec_series::<Cal>(&c, "daily");
    let patch: cal::CalendarEntrySeriesPatch = serde_json::from_value(json!({
        "allDay": true, "startTime": null, "endTime": null
    }))
    .unwrap();
    cal::update_calendar_entry_series(&c, &tid, "2026-01-01", patch).unwrap();
    let t = cal::get_calendar_entry_template(&c, &tid).unwrap();
    assert!(t.all_day);
    assert_eq!((t.start_time, t.end_time), (None, None));
}

// --- (f) Databases from before `overridden_fields` --------------------------

/// The schema version right before the `overridden_fields` migration.
const BEFORE_OVERRIDDEN_FIELDS: usize = 31;

fn old_db() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    crate::db::migrations::MIGRATIONS
        .to_version(&mut conn, BEFORE_OVERRIDDEN_FIELDS)
        .unwrap();
    conn.execute(
        "INSERT INTO spaces (id, name, color, created_at, updated_at)
         VALUES ('space', 'Life', '#000', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')",
        [],
    )
    .unwrap();
    conn
}

fn old_entity(conn: &Connection, id: &str, kind: &str, title: &str, n: i64) {
    conn.execute(
        "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number)
         VALUES (?1, 'space', ?2, ?3, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00', 'OLD', ?4)",
        rusqlite::params![id, kind, title, n],
    )
    .unwrap();
}

/// A released database where the old bug already left a daily series split:
/// "This and following" from the 6th occurrence moved the template and
/// occurrences 6..10 to T2, occurrences 1..5 were never reached and still
/// hold T1. Ideally an edit of the series from the first occurrence would
/// reach all ten, but the stored data can't tell these stale occurrences from
/// ones the user edited on their own before the migration. The migration's
/// backfill therefore marks every field that differs from the template as
/// overridden ON PURPOSE: losing a real individual edit would be data loss,
/// a stale time is not. Pins that documented safe behavior: occurrences 1..5
/// keep T1, 6..10 follow to T3. (A fresh split, without the migration,
/// follows: `spec_following_from_middle_then_from_first_reaches_every_occurrence`.)
#[test]
fn migrated_split_calendar_series_keeps_differing_occurrences_protected() {
    let mut conn = old_db();
    old_entity(&conn, "t", "calendar_entry_template", "Standup", 1);
    conn.execute(
        "INSERT INTO calendar_entry_templates (entity_id, recurrence, start_time, end_time, all_day, location, description, anchor_date)
         VALUES ('t', 'daily', ?1, ?2, 0, 'Room 1', NULL, '2026-03-04')",
        rusqlite::params![T2.0, T2.1],
    )
    .unwrap();
    for i in 0..10u32 {
        let id = format!("o{i}");
        let t = if i < 5 { T1 } else { T2 };
        old_entity(&conn, &id, "calendar_entry", "Standup", 2 + i64::from(i));
        conn.execute(
            "INSERT INTO calendar_entries (entity_id, template_id, date, end_date, start_time, end_time, all_day, cancelled, location, description)
             VALUES (?1, 't', ?2, NULL, ?3, ?4, 0, 0, 'Room 1', NULL)",
            rusqlite::params![id, add("2026-03-04", "daily", i), t.0, t.1],
        )
        .unwrap();
    }
    crate::db::migrations::MIGRATIONS
        .to_latest(&mut conn)
        .unwrap();
    cal_edit_all_from_first(&conn);
    assert_eq!(
        times::<Cal>(&conn, "t"),
        expect_times::<Cal>(&conn, "t", "Room 1", |i| if i < 5 { T1 } else { T3 }),
        "fields that differed from the template at migration time stay protected"
    );
}

fn cal_edit_all_from_first(conn: &Connection) {
    cal::update_calendar_entry_series(
        conn,
        "t",
        "2026-03-04",
        cal::CalendarEntrySeriesPatch {
            start_time: Some(Some(T3.0.into())),
            end_time: Some(Some(T3.1.into())),
            ..Default::default()
        },
    )
    .unwrap();
}

/// The same for a weekly session series: the occurrences that differed from
/// the template when the migration ran keep their times.
#[test]
fn migrated_split_session_series_keeps_differing_occurrences_protected() {
    let mut conn = old_db();
    old_entity(&conn, "course", "course", "Algorithms", 1);
    old_entity(&conn, "t", "session_template", "Lecture", 2);
    conn.execute(
        "INSERT INTO session_templates (entity_id, weekday, start_time, end_time, location, anchor_date)
         VALUES ('t', 0, ?1, ?2, 'Room 1', '2026-03-02')",
        rusqlite::params![T2.0, T2.1],
    )
    .unwrap();
    for i in 0..10u32 {
        let id = format!("o{i}");
        let t = if i < 5 { T1 } else { T2 };
        old_entity(&conn, &id, "session", "Lecture", 3 + i64::from(i));
        conn.execute(
            "INSERT INTO sessions (entity_id, template_id, date, start_time, end_time, cancelled, location, notes)
             VALUES (?1, 't', ?2, ?3, ?4, 0, 'Room 1', NULL)",
            rusqlite::params![id, add("2026-03-02", "weekly", i), t.0, t.1],
        )
        .unwrap();
    }
    crate::db::migrations::MIGRATIONS
        .to_latest(&mut conn)
        .unwrap();
    ses::update_session_series(
        &conn,
        "t",
        "2026-03-02",
        ses::SeriesPatch {
            start_time: Some(T3.0.into()),
            end_time: Some(T3.1.into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        times::<Ses>(&conn, "t"),
        expect_times::<Ses>(&conn, "t", "Room 1", |i| if i < 5 { T1 } else { T3 }),
        "fields that differed from the template at migration time stay protected"
    );
}

/// "This one" on X to T2, back to T1 (X now equals the series again), then an
/// "All upcoming" edit from a later day moves the series to T3 without
/// reaching X, then "This and following" opened on X to T4. Spec: X was set
/// back to the series value, so it is not an individual override any more
/// and follows the T4 edit like every other occurrence from X on.
fn spec_occurrence_set_back_to_the_series_follows_after_a_later_split<K: Kind>() {
    const T4: (&str, &str) = ("16:00", "17:00");
    for cadence in K::CADENCES {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_this(&c, &ids[2], T2.0, T2.1, Some("Room 1"));
        K::ui_this(&c, &ids[2], T1.0, T1.1, Some("Room 1"));
        let later = rows::<K>(&c, &tid)[5].row.date.clone();
        K::ui_series(&c, &ids[5], Some(&later), T3.0, T3.1, Some("Room 1"));
        K::ui_series(&c, &ids[2], None, T4.0, T4.1, Some("Room 1"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |i| if i < 2 { T1 } else { T4 }),
            "{cadence}"
        );
    }
}

/// "All upcoming" starts from today, as its form says ("Changes every entry
/// from today on"). Opened on an occurrence older than today, that one and
/// every other one before today keep their time. Pins the scope's from-date
/// (the cause of the user's first report; the fix belongs in the frontend).
fn all_upcoming_opened_before_today_leaves_earlier_days_alone<K: Kind>() {
    let c = crate::db::test_conn();
    let (tid, ids) = spec_series::<K>(&c, "weekly");
    let today = rows::<K>(&c, &tid)[5].row.date.clone();
    K::ui_series(&c, &ids[1], Some(&today), T3.0, T3.1, Some("Room 1"));
    assert_eq!(
        times::<K>(&c, &tid),
        expect_times::<K>(&c, &tid, "Room 1", |i| if i < 5 { T1 } else { T3 })
    );
}

// --- The anchor of a "This and following" edit ------------------------------
// The occurrence the user opened and edits with "This and following" is the
// anchor of the edit: it must receive every patched field, even one it had
// overridden on its own before. Later occurrences that were overridden keep
// their own value. The patch is built like the form builds it: only fields
// that differ from the opened occurrence.

fn anchor_cadences<K: Kind>() -> Vec<&'static str> {
    K::CADENCES
        .iter()
        .copied()
        .filter(|c| *c != "monthly")
        .collect()
}

/// (a) "This one" on X to T2, then "This and following" opened on X to T3:
/// X and every later untouched occurrence are T3.
fn anchor_this_then_following_from_the_same_occurrence_updates_it<K: Kind>() {
    for cadence in anchor_cadences::<K>() {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_this(&c, &ids[4], T2.0, T2.1, Some("Room 1"));
        K::ui_series(&c, &ids[4], None, T3.0, T3.1, Some("Room 1"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |i| if i < 4 { T1 } else { T3 }),
            "{cadence}"
        );
    }
}

/// (b) X overrode only its location ("Lab"); "This and following" from X
/// changes the time (the form still shows "Lab", so the patch has no
/// location). X takes the new time and keeps "Lab"; later ones take the time.
fn anchor_location_override_keeps_location_and_takes_the_new_time<K: Kind>() {
    for cadence in anchor_cadences::<K>() {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_this(&c, &ids[4], T1.0, T1.1, Some("Lab"));
        K::ui_series(&c, &ids[4], None, T3.0, T3.1, Some("Lab"));
        let got = times::<K>(&c, &tid);
        let want: Vec<String> = rows::<K>(&c, &tid)
            .iter()
            .enumerate()
            .map(|(i, o)| match i {
                0..=3 => format!("{} {}-{} @Room 1", o.row.date, T1.0, T1.1),
                4 => format!("{} {}-{} @Lab", o.row.date, T3.0, T3.1),
                _ => format!("{} {}-{} @Room 1", o.row.date, T3.0, T3.1),
            })
            .collect();
        assert_eq!(got, want, "{cadence}");
    }
}

/// (c) X and a later Y both overrode their time (X to T2, Y to 07:00-08:00).
/// "This and following" opened on X to T3: X (the anchor) is T3, Y keeps its
/// own time, every other occurrence from X on is T3.
fn anchor_gets_the_patched_field_while_a_later_override_keeps_its_own<K: Kind>() {
    const OWN: (&str, &str) = ("07:00", "08:00");
    for cadence in anchor_cadences::<K>() {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_this(&c, &ids[3], T2.0, T2.1, Some("Room 1"));
        K::ui_this(&c, &ids[6], OWN.0, OWN.1, Some("Room 1"));
        K::ui_series(&c, &ids[3], None, T3.0, T3.1, Some("Room 1"));
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |i| match i {
                0..=2 => T1,
                6 => OWN,
                _ => T3,
            }),
            "{cadence}"
        );
    }
}

/// (d) The patch only holds fields that differ from the opened X. X overrode
/// its location to "Lab"; the user changes only the time, so "location" is
/// absent from the patch. No other occurrence's location is touched: the
/// later ones keep "Room 1", and a later Y that overrode its own location to
/// "Hall" keeps "Hall".
fn anchor_patch_without_a_field_leaves_that_field_alone_everywhere<K: Kind>() {
    for cadence in anchor_cadences::<K>() {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_this(&c, &ids[3], T1.0, T1.1, Some("Lab"));
        K::ui_this(&c, &ids[7], T1.0, T1.1, Some("Hall"));
        K::ui_series(&c, &ids[3], None, T3.0, T3.1, Some("Lab"));
        let locations: Vec<String> = rows::<K>(&c, &tid)
            .into_iter()
            .map(|o| o.row.location.unwrap_or_default())
            .collect();
        let mut want = vec!["Room 1".to_string(); SPEC_OCCURRENCES as usize];
        want[3] = "Lab".into();
        want[7] = "Hall".into();
        assert_eq!(locations, want, "{cadence}");
        assert_eq!(
            K::template(&c, &tid).location.as_deref(),
            Some("Room 1"),
            "{cadence}: the series location is not part of the patch"
        );
    }
}

/// (e) After the anchor took the patch its override is over: a later series
/// edit from the first occurrence (no anchor, as the CLI sends it) reaches it
/// like every other occurrence.
fn anchor_follows_later_series_edits_after_taking_the_patch<K: Kind>() {
    for cadence in anchor_cadences::<K>() {
        let c = crate::db::test_conn();
        let (tid, ids) = spec_series::<K>(&c, cadence);
        K::ui_this(&c, &ids[4], T2.0, T2.1, Some("Room 1"));
        K::ui_series(&c, &ids[4], None, T3.0, T3.1, Some("Room 1"));
        let first = rows::<K>(&c, &tid)[0].row.date.clone();
        K::edit(&c, &tid, &first, edit().times(T1.0, T1.1)).unwrap();
        assert_eq!(
            times::<K>(&c, &tid),
            expect_times::<K>(&c, &tid, "Room 1", |_| T1),
            "{cadence}"
        );
        assert!(rows::<K>(&c, &tid).iter().all(|o| o.mask == 0), "{cadence}");
    }
}

// ===========================================================================
// 1. Create, then edit in sequence
// ===========================================================================

/// Edit all from the first occurrence, then from a middle one, from the last
/// one, and finally from before the series even started.
fn edits_from_first_middle_last_and_before_first_in_sequence<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::edit(&c, &t, A, edit().times("09:00", "11:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-11:00 Lecture @Room 1",
            "2026-01-12 09:00-11:00 Lecture @Room 1",
            "2026-01-19 09:00-11:00 Lecture @Room 1",
            "2026-01-26 09:00-11:00 Lecture @Room 1",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Lecture 09:00-11:00 @Room 1");

    K::edit(&c, &t, C, edit().loc(Some("Hall"))).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-11:00 Lecture @Room 1",
            "2026-01-12 09:00-11:00 Lecture @Room 1",
            "2026-01-19 09:00-11:00 Lecture @Hall",
            "2026-01-26 09:00-11:00 Lecture @Hall",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Lecture 09:00-11:00 @Hall");

    K::edit(
        &c,
        &t,
        D,
        edit().title("Lecture II").times("13:00", "14:00"),
    )
    .unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-11:00 Lecture @Room 1",
            "2026-01-12 09:00-11:00 Lecture @Room 1",
            "2026-01-19 09:00-11:00 Lecture @Hall",
            "2026-01-26 13:00-14:00 Lecture II @Hall",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Lecture II 13:00-14:00 @Hall");

    // A location-only edit from before the first occurrence: every occurrence
    // follows the whole series, so the times the 01-26 split left on the
    // template reach 01-05 to 01-19 too (see
    // `location_only_edit_of_all_pulls_times_from_a_later_split`).
    K::edit(&c, &t, "2025-12-01", edit().loc(Some("Aula"))).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 13:00-14:00 Lecture @Aula",
            "2026-01-12 13:00-14:00 Lecture @Aula",
            "2026-01-19 13:00-14:00 Lecture @Aula",
            "2026-01-26 13:00-14:00 Lecture II @Aula",
        ]
    );
    // A rename only reaches occurrences carrying the template's old title.
    K::edit(&c, &t, "2025-12-01", edit().title("Lecture III")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 13:00-14:00 Lecture @Aula",
            "2026-01-12 13:00-14:00 Lecture @Aula",
            "2026-01-19 13:00-14:00 Lecture @Aula",
            "2026-01-26 13:00-14:00 Lecture III @Aula",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Lecture III 13:00-14:00 @Aula");
}

/// T1 to T2 from 01-19, T2 to T3 from the first, back to T1 from 01-19, then
/// further splits: each edit reaches exactly the occurrences from its date.
fn time_edits_ping_pong_between_split_points<K: Kind>() {
    let (c, _, t) = setup::<K>();
    let lines = |ts: [&str; 4]| -> Vec<String> {
        [A, B, C, D]
            .iter()
            .zip(ts)
            .map(|(d, t)| format!("{d} {t} Lecture @Room 1"))
            .collect()
    };
    K::edit(&c, &t, C, edit().times("11:00", "13:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        lines(["10:00-12:00", "10:00-12:00", "11:00-13:00", "11:00-13:00"])
    );
    K::edit(&c, &t, A, edit().times("08:00", "09:00")).unwrap();
    assert_eq!(view::<K>(&c, &t), lines(["08:00-09:00"; 4]));
    K::edit(&c, &t, C, edit().times("10:00", "12:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        lines(["08:00-09:00", "08:00-09:00", "10:00-12:00", "10:00-12:00"])
    );
    K::edit(&c, &t, B, edit().times("11:00", "13:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        lines(["08:00-09:00", "11:00-13:00", "11:00-13:00", "11:00-13:00"])
    );
    K::edit(&c, &t, D, edit().times("10:00", "12:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        lines(["08:00-09:00", "11:00-13:00", "11:00-13:00", "10:00-12:00"])
    );
    K::edit(&c, &t, "2025-01-01", edit().times("10:00", "12:00")).unwrap();
    assert_eq!(view::<K>(&c, &t), lines(["10:00-12:00"; 4]));
    assert_eq!(tpl::<K>(&c, &t), "Lecture 10:00-12:00 @Room 1");
}

/// Time, then location, then title, then end time, then a rename of all,
/// each from a different occurrence.
fn interleaved_time_location_title_edits_from_different_dates<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::edit(&c, &t, B, edit().start("09:00")).unwrap();
    K::edit(&c, &t, C, edit().loc(Some("Hall"))).unwrap();
    K::edit(&c, &t, D, edit().title("Seminar")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-12 09:00-12:00 Lecture @Room 1",
            "2026-01-19 09:00-12:00 Lecture @Hall",
            "2026-01-26 09:00-12:00 Seminar @Hall",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Seminar 09:00-12:00 @Hall");
    K::edit(&c, &t, B, edit().end("11:30")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-12 09:00-11:30 Lecture @Hall",
            "2026-01-19 09:00-11:30 Lecture @Hall",
            "2026-01-26 09:00-11:30 Seminar @Hall",
        ]
    );
    K::edit(&c, &t, A, edit().title("Algorithms")).unwrap();
    // Only the occurrence still carrying the old template title is renamed.
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-11:30 Lecture @Hall",
            "2026-01-12 09:00-11:30 Lecture @Hall",
            "2026-01-19 09:00-11:30 Lecture @Hall",
            "2026-01-26 09:00-11:30 Algorithms @Hall",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Algorithms 09:00-11:30 @Hall");
}

/// After a time edit from 01-19, editing only the location of all occurrences
/// also gives 01-05 and 01-12 the newer times: an untouched occurrence follows
/// the whole series, not only the fields in the patch. Pinned as designed; a
/// user may not expect a location edit to move times.
fn location_only_edit_of_all_pulls_times_from_a_later_split<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::edit(&c, &t, C, edit().times("11:00", "13:00")).unwrap();
    K::edit(&c, &t, A, edit().loc(Some("Hall"))).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 11:00-13:00 Lecture @Hall",
            "2026-01-12 11:00-13:00 Lecture @Hall",
            "2026-01-19 11:00-13:00 Lecture @Hall",
            "2026-01-26 11:00-13:00 Lecture @Hall",
        ]
    );
}

/// The reported bug with every field: rename, retime and relocate from 01-19,
/// then retime all. Every occurrence takes the new times and the series'
/// location; titles keep their own (rename only follows the old title).
fn following_edit_then_all_edit_reaches_every_field<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::edit(
        &c,
        &t,
        C,
        edit()
            .title("Lecture II")
            .times("11:00", "13:00")
            .loc(Some("Hall")),
    )
    .unwrap();
    K::edit(&c, &t, A, edit().times("08:00", "09:30")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 08:00-09:30 Lecture @Hall",
            "2026-01-12 08:00-09:30 Lecture @Hall",
            "2026-01-19 08:00-09:30 Lecture II @Hall",
            "2026-01-26 08:00-09:30 Lecture II @Hall",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Lecture II 08:00-09:30 @Hall");
}

/// Renaming from 01-19, renaming back from 01-19, then renaming all gives
/// every occurrence the same title again.
fn renaming_back_restores_a_uniform_title<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::edit(&c, &t, C, edit().title("L2")).unwrap();
    K::edit(&c, &t, C, edit().title("Lecture")).unwrap();
    K::edit(&c, &t, A, edit().title("L3")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 L3 @Room 1",
            "2026-01-12 10:00-12:00 L3 @Room 1",
            "2026-01-19 10:00-12:00 L3 @Room 1",
            "2026-01-26 10:00-12:00 L3 @Room 1",
        ]
    );
}

// ===========================================================================
// 2. Single occurrence overrides mixed with series edits
// ===========================================================================

fn overridden_time_survives_time_edits_and_follows_location_edits<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::override_(&c, &on::<K>(&c, &t, B), ov().start("09:00")).unwrap();
    K::edit(&c, &t, A, edit().times("10:30", "12:30")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:30-12:30 Lecture @Room 1",
            "2026-01-12 09:00-12:30 Lecture @Room 1",
            "2026-01-19 10:30-12:30 Lecture @Room 1",
            "2026-01-26 10:30-12:30 Lecture @Room 1",
        ]
    );
    K::edit(&c, &t, A, edit().loc(Some("Hall"))).unwrap();
    K::edit(&c, &t, C, edit().start("11:00")).unwrap();
    K::edit(&c, &t, A, edit().end("13:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 11:00-13:00 Lecture @Hall",
            "2026-01-12 09:00-13:00 Lecture @Hall",
            "2026-01-19 11:00-13:00 Lecture @Hall",
            "2026-01-26 11:00-13:00 Lecture @Hall",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Lecture 11:00-13:00 @Hall");
}

/// Seven occurrences, overrides on three that are not next to each other,
/// then edits from three different points.
fn overrides_on_non_adjacent_occurrences_then_edits_from_several_points<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::generate(&c, &t, "2026-02-16").unwrap();
    K::override_(&c, &on::<K>(&c, &t, A), ov().loc(Some("Lab"))).unwrap();
    K::override_(&c, &on::<K>(&c, &t, C), ov().times("08:00", "09:00")).unwrap();
    K::override_(&c, &on::<K>(&c, &t, "2026-02-02"), ov().end("12:30")).unwrap();

    K::edit(&c, &t, B, edit().times("13:00", "15:00")).unwrap();
    // 02-02 would end up 13:00 to 12:30, so it keeps both of its own times.
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Lab",
            "2026-01-12 13:00-15:00 Lecture @Room 1",
            "2026-01-19 08:00-09:00 Lecture @Room 1",
            "2026-01-26 13:00-15:00 Lecture @Room 1",
            "2026-02-02 10:00-12:30 Lecture @Room 1",
            "2026-02-09 13:00-15:00 Lecture @Room 1",
            "2026-02-16 13:00-15:00 Lecture @Room 1",
        ]
    );
    K::edit(&c, &t, D, edit().loc(Some("Hall"))).unwrap();
    K::edit(&c, &t, A, edit().start("12:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 12:00-15:00 Lecture @Lab",
            "2026-01-12 12:00-15:00 Lecture @Hall",
            "2026-01-19 08:00-09:00 Lecture @Hall",
            "2026-01-26 12:00-15:00 Lecture @Hall",
            "2026-02-02 12:00-12:30 Lecture @Hall",
            "2026-02-09 12:00-15:00 Lecture @Hall",
            "2026-02-16 12:00-15:00 Lecture @Hall",
        ]
    );
}

fn cancel_then_series_edit_then_uncancel<K: Kind>() {
    let (c, _, t) = setup::<K>();
    let b = on::<K>(&c, &t, B);
    K::override_(&c, &b, ov().cancel(true)).unwrap();
    K::edit(&c, &t, A, edit().times("09:00", "10:00")).unwrap();
    assert_eq!(
        row_of::<K>(&c, &b),
        "2026-01-12 09:00-10:00 Lecture @Room 1 cancelled"
    );
    K::override_(&c, &b, ov().cancel(false)).unwrap();
    K::edit(&c, &t, B, edit().loc(Some("Hall"))).unwrap();
    let d = on::<K>(&c, &t, D);
    K::override_(&c, &d, ov().cancel(true)).unwrap();
    assert_eq!(K::delete(&c, &t, D).unwrap(), 1);
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-10:00 Lecture @Room 1",
            "2026-01-12 09:00-10:00 Lecture @Hall",
            "2026-01-19 09:00-10:00 Lecture @Hall",
            "2026-01-26 09:00-10:00 Lecture @Hall cancelled trashed",
        ]
    );
}

/// Moving 01-12 onto 01-19 puts two occurrences on one date; edits and
/// deletes from that date reach both, and generating adds no third.
fn move_onto_another_occurrence_date_then_edit_and_delete_from_there<K: Kind>() {
    let (c, _, t) = setup::<K>();
    let b = on::<K>(&c, &t, B);
    K::override_(&c, &b, ov().date(C)).unwrap();
    assert!(K::generate(&c, &t, D).unwrap().is_empty());
    K::edit(&c, &t, C, edit().start("11:00")).unwrap();
    K::override_(&c, &b, ov().start("09:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-19 09:00-12:00 Lecture @Room 1",
            "2026-01-19 11:00-12:00 Lecture @Room 1",
            "2026-01-26 11:00-12:00 Lecture @Room 1",
        ]
    );
    assert_eq!(K::delete(&c, &t, C).unwrap(), 3);
    assert!(!K::template(&c, &t).trashed);
    assert_eq!(K::generate(&c, &t, "2026-02-02").unwrap(), ["2026-02-02"]);
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-19 09:00-12:00 Lecture @Room 1 trashed",
            "2026-01-19 11:00-12:00 Lecture @Room 1 trashed",
            "2026-01-26 11:00-12:00 Lecture @Room 1 trashed",
            "2026-02-02 11:00-12:00 Lecture @Room 1",
        ]
    );
}

/// 01-12 moves onto 02-09, a slot not generated yet; generating to 02-16
/// skips 02-09 (taken). Moving it back home leaves 02-09 empty for good.
fn move_onto_a_future_slot_generate_then_move_back_leaves_a_hole<K: Kind>() {
    let (c, _, t) = setup::<K>();
    let b = on::<K>(&c, &t, B);
    K::override_(&c, &b, ov().date("2026-02-09")).unwrap();
    assert_eq!(
        K::generate(&c, &t, "2026-02-16").unwrap(),
        ["2026-02-02", "2026-02-16"]
    );
    K::override_(&c, &b, ov().date(B)).unwrap();
    assert!(K::generate(&c, &t, "2026-02-16").unwrap().is_empty());
    assert_eq!(K::generate(&c, &t, "2026-02-23").unwrap(), ["2026-02-23"]);
    // NOTE: possible bug: the 02-09 week never gets its occurrence: the slot
    // counts as filled (by the moved one) although nothing sits on it now.
    let dates: Vec<String> = rows::<K>(&c, &t).into_iter().map(|o| o.row.date).collect();
    assert_eq!(
        dates,
        [A, B, C, D, "2026-02-02", "2026-02-16", "2026-02-23"]
    );
}

fn move_back_and_forth_keeps_one_row_per_slot<K: Kind>() {
    let (c, _, t) = setup::<K>();
    let d = on::<K>(&c, &t, D);
    K::override_(&c, &d, ov().date("2026-01-28")).unwrap();
    assert_eq!(
        K::generate(&c, &t, "2026-02-09").unwrap(),
        ["2026-02-02", "2026-02-09"]
    );
    K::override_(&c, &d, ov().date("2026-02-02")).unwrap();
    assert_eq!(K::generate(&c, &t, "2026-02-16").unwrap(), ["2026-02-16"]);
    K::override_(&c, &d, ov().date(D)).unwrap();
    assert!(K::generate(&c, &t, "2026-02-16").unwrap().is_empty());
    let dates: Vec<String> = rows::<K>(&c, &t).into_iter().map(|o| o.row.date).collect();
    assert_eq!(
        dates,
        [A, B, C, D, "2026-02-02", "2026-02-09", "2026-02-16"]
    );
}

/// A start overridden to 09:00 that the template later also reaches (by a
/// split edit) counts as following again and goes with the next edit of all.
/// Documented in `series::series_value` ("unless it happens to equal").
fn override_equal_to_the_old_series_value_follows_the_next_edit<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::override_(&c, &on::<K>(&c, &t, A), ov().start("09:00")).unwrap();
    K::edit(&c, &t, B, edit().start("09:00")).unwrap();
    K::edit(&c, &t, A, edit().start("08:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 08:00-12:00 Lecture @Room 1",
            "2026-01-12 08:00-12:00 Lecture @Room 1",
            "2026-01-19 08:00-12:00 Lecture @Room 1",
            "2026-01-26 08:00-12:00 Lecture @Room 1",
        ]
    );
}

fn cleared_location_override_survives_location_edits<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::override_(&c, &on::<K>(&c, &t, B), ov().loc(None)).unwrap();
    K::edit(&c, &t, A, edit().loc(Some("Hall"))).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Hall",
            "2026-01-12 10:00-12:00 Lecture",
            "2026-01-19 10:00-12:00 Lecture @Hall",
            "2026-01-26 10:00-12:00 Lecture @Hall",
        ]
    );
    K::edit(&c, &t, C, edit().loc(None)).unwrap();
    assert_eq!(tpl::<K>(&c, &t), "Lecture 10:00-12:00");
    // 01-12's own "no location" now equals the series' old value, so it follows.
    K::edit(&c, &t, A, edit().loc(Some("Aula"))).unwrap();
    assert!(view::<K>(&c, &t).iter().all(|r| r.ends_with("@Aula")));
}

// ===========================================================================
// 3. Deletes and Trash
// ===========================================================================

fn delete_following_then_edit_remaining_leaves_trashed_rows_frozen<K: Kind>() {
    let (c, _, t) = setup::<K>();
    assert_eq!(K::delete(&c, &t, C).unwrap(), 2);
    K::edit(&c, &t, A, edit().start("09:00")).unwrap();
    K::edit(&c, &t, C, edit().title("Renamed")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-12:00 Lecture @Room 1",
            "2026-01-12 09:00-12:00 Lecture @Room 1",
            "2026-01-19 10:00-12:00 Lecture @Room 1 trashed",
            "2026-01-26 10:00-12:00 Lecture @Room 1 trashed",
        ]
    );
    assert_eq!(tpl::<K>(&c, &t), "Renamed 09:00-12:00 @Room 1");
}

/// "Delete this and following" trashes 01-19 on, but the template has no end:
/// generating further creates 02-02 and 02-09 again.
fn delete_following_then_extending_the_horizon_brings_the_series_back<K: Kind>() {
    let (c, _, t) = setup::<K>();
    assert_eq!(K::delete(&c, &t, C).unwrap(), 2);
    // NOTE: possible bug: a series deleted from 01-19 on comes back past its
    // last generated date, as nothing records where the user ended it.
    assert_eq!(
        K::generate(&c, &t, "2026-02-09").unwrap(),
        ["2026-02-02", "2026-02-09"]
    );
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-12 10:00-12:00 Lecture @Room 1",
            "2026-01-19 10:00-12:00 Lecture @Room 1 trashed",
            "2026-01-26 10:00-12:00 Lecture @Room 1 trashed",
            "2026-02-02 10:00-12:00 Lecture @Room 1",
            "2026-02-09 10:00-12:00 Lecture @Room 1",
        ]
    );
}

fn trash_single_then_edit_then_delete_counts_only_live<K: Kind>() {
    let (c, _, t) = setup::<K>();
    trash(&c, &on::<K>(&c, &t, B));
    K::edit(&c, &t, A, edit().start("09:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-12:00 Lecture @Room 1",
            "2026-01-12 10:00-12:00 Lecture @Room 1 trashed",
            "2026-01-19 09:00-12:00 Lecture @Room 1",
            "2026-01-26 09:00-12:00 Lecture @Room 1",
        ]
    );
    assert_eq!(K::delete(&c, &t, A).unwrap(), 3);
    assert!(K::template(&c, &t).trashed);
    assert!(view::<K>(&c, &t).iter().all(|r| r.ends_with("trashed")));
}

fn restored_occurrence_follows_later_series_edits<K: Kind>() {
    let (c, _, t) = setup::<K>();
    let b = on::<K>(&c, &t, B);
    trash(&c, &b);
    K::edit(&c, &t, A, edit().start("09:00")).unwrap();
    restore(&c, &b);
    assert_eq!(
        row_of::<K>(&c, &b),
        "2026-01-12 10:00-12:00 Lecture @Room 1"
    );
    K::edit(&c, &t, A, edit().end("13:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-13:00 Lecture @Room 1",
            "2026-01-12 09:00-13:00 Lecture @Room 1",
            "2026-01-19 09:00-13:00 Lecture @Room 1",
            "2026-01-26 09:00-13:00 Lecture @Room 1",
        ]
    );
}

fn delete_whole_series_then_restore_template_and_occurrences<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    assert_eq!(K::delete(&c, &t, A).unwrap(), 4);
    assert!(K::templates(&c, &ctx.space).is_empty());
    restore(&c, &t);
    assert_eq!(K::templates(&c, &ctx.space), ["Lecture"]);
    restore(&c, &on::<K>(&c, &t, A));
    restore(&c, &on::<K>(&c, &t, B));
    assert_eq!(K::generate(&c, &t, "2026-02-02").unwrap(), ["2026-02-02"]);
    K::edit(&c, &t, A, edit().start("09:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 09:00-12:00 Lecture @Room 1",
            "2026-01-12 09:00-12:00 Lecture @Room 1",
            "2026-01-19 10:00-12:00 Lecture @Room 1 trashed",
            "2026-01-26 10:00-12:00 Lecture @Room 1 trashed",
            "2026-02-02 09:00-12:00 Lecture @Room 1",
        ]
    );
}

/// Empty Trash after "delete this and following" removes the rows; the next
/// generate fills their dates again.
fn empty_trash_after_delete_following_then_generate_recreates_the_dates<K: Kind>() {
    let (c, _, t) = setup::<K>();
    assert_eq!(K::delete(&c, &t, C).unwrap(), 2);
    assert_eq!(entities::empty_trash(&c).unwrap(), 2);
    assert_eq!(rows::<K>(&c, &t).len(), 2);
    // NOTE: possible bug: deleted for good, yet regenerated on the next
    // generate up to 01-26 (the row count, not the dates, records slots).
    assert_eq!(K::generate(&c, &t, D).unwrap(), [C, D]);
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-12 10:00-12:00 Lecture @Room 1",
            "2026-01-19 10:00-12:00 Lecture @Room 1",
            "2026-01-26 10:00-12:00 Lecture @Room 1",
        ]
    );
}

/// Empty Trash after deleting the whole series removes the occurrences and
/// then their template for good; a live one-off stays.
fn empty_trash_after_deleting_the_whole_series_removes_it_for_good<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    K::one_off(&c, &ctx, &weekly("Office hour", B, "13:00", "14:00")).unwrap();
    assert_eq!(K::delete(&c, &t, A).unwrap(), 4);
    assert_eq!(entities::empty_trash(&c).unwrap(), 5);
    assert!(rows::<K>(&c, &t).is_empty());
    assert!(matches!(
        K::generate(&c, &t, D).unwrap_err(),
        AppError::NotFound(_)
    ));
    assert!(matches!(
        K::edit(&c, &t, A, edit().start("09:00")).unwrap_err(),
        AppError::NotFound(_)
    ));
    assert!(K::delete(&c, &t, A).is_err());
    assert_eq!(one_offs::<K>(&c), ["2026-01-12 13:00-14:00 Office hour"]);
}

/// One occurrence restored after the whole series went to Trash still points
/// at the trashed template: Empty Trash removes the other occurrences and
/// keeps the template (in Trash) for it, instead of failing as a whole.
fn empty_trash_keeps_a_trashed_template_a_live_occurrence_still_uses<K: Kind>() {
    let (c, _, t) = setup::<K>();
    assert_eq!(K::delete(&c, &t, A).unwrap(), 4);
    let b = on::<K>(&c, &t, B);
    restore(&c, &b);
    assert_eq!(entities::empty_trash(&c).unwrap(), 3);
    assert_eq!(
        view::<K>(&c, &t),
        ["2026-01-12 10:00-12:00 Lecture @Room 1"]
    );
    assert!(K::template(&c, &t).trashed);
    // Nothing else is left to remove, so a second Empty Trash removes nothing.
    assert_eq!(entities::empty_trash(&c).unwrap(), 0);
}

fn delete_following_twice_returns_zero_and_keeps_the_template<K: Kind>() {
    let (c, _, t) = setup::<K>();
    assert_eq!(K::delete(&c, &t, C).unwrap(), 2);
    assert_eq!(K::delete(&c, &t, C).unwrap(), 0);
    assert!(!K::template(&c, &t).trashed);
    assert_eq!(
        rows::<K>(&c, &t).iter().filter(|o| o.row.trashed).count(),
        2
    );
}

/// Deleting the whole series, restoring one occurrence (the Trash toast's
/// Undo), then deleting the whole series again. The call fails (the template
/// is already in Trash) and, being all or nothing, leaves 01-12 live.
fn delete_after_restoring_into_a_trashed_template_errors_and_changes_nothing<K: Kind>() {
    let (c, _, t) = setup::<K>();
    assert_eq!(K::delete(&c, &t, A).unwrap(), 4);
    let b = on::<K>(&c, &t, B);
    restore(&c, &b);
    let err = fails_cleanly(&c, || K::delete(&c, &t, A));
    assert!(matches!(err, AppError::NotFound(_)));
    assert!(!K::get(&c, &b).trashed);
}

/// One-offs in the same Space, one even titled "Lecture", stay exactly as
/// they are through every series operation.
fn one_offs_are_untouched_by_every_series_operation<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    K::one_off(&c, &ctx, &weekly("Lecture", B, "13:00", "14:00")).unwrap();
    K::one_off(
        &c,
        &ctx,
        &Spec {
            location: Some("Room 1"),
            ..weekly("Exam", D, "08:00", "09:00")
        },
    )
    .unwrap();
    let expected = [
        "2026-01-12 13:00-14:00 Lecture",
        "2026-01-26 08:00-09:00 Exam @Room 1",
    ];
    assert_eq!(one_offs::<K>(&c), expected);
    K::edit(
        &c,
        &t,
        A,
        edit().title("Lecture II").times("13:00", "14:00").loc(None),
    )
    .unwrap();
    assert_eq!(one_offs::<K>(&c), expected);
    K::override_(&c, &on::<K>(&c, &t, B), ov().date(D)).unwrap();
    assert_eq!(one_offs::<K>(&c), expected);
    K::generate(&c, &t, "2026-02-09").unwrap();
    assert_eq!(one_offs::<K>(&c), expected);
    assert_eq!(K::delete(&c, &t, B).unwrap(), 5);
    assert_eq!(one_offs::<K>(&c), expected);
    assert_eq!(K::delete(&c, &t, A).unwrap(), 1);
    assert!(K::template(&c, &t).trashed);
    assert_eq!(one_offs::<K>(&c), expected);
}

fn two_parallel_series_never_touch_each_other<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    let u = K::series(
        &c,
        &ctx,
        &Spec {
            location: Some("Lab"),
            ..weekly("Tutorial", "2026-01-07", "14:00", "15:00")
        },
    )
    .unwrap();
    K::generate(&c, &u, "2026-01-28").unwrap();
    let tutorial = view::<K>(&c, &u);
    assert_eq!(tutorial.len(), 4);
    K::edit(&c, &t, A, edit().title("Tutorial").times("14:00", "15:00")).unwrap();
    K::override_(&c, &on::<K>(&c, &t, B), ov().date("2026-01-07")).unwrap();
    K::delete(&c, &t, C).unwrap();
    K::generate(&c, &t, "2026-02-09").unwrap();
    assert_eq!(view::<K>(&c, &u), tutorial);
    assert_eq!(tpl::<K>(&c, &u), "Tutorial 14:00-15:00 @Lab");

    let lecture = view::<K>(&c, &t);
    K::edit(
        &c,
        &u,
        "2026-01-01",
        edit().title("Tut").times("16:00", "17:00"),
    )
    .unwrap();
    assert_eq!(K::delete(&c, &u, "2026-01-21").unwrap(), 2);
    K::generate(&c, &u, "2026-02-11").unwrap();
    assert_eq!(view::<K>(&c, &t), lecture);
    assert_eq!(tpl::<K>(&c, &t), "Tutorial 14:00-15:00 @Room 1");
}

/// A one-off identical to an occurrence, on its date: generating does not
/// count it as taken, series edits and deletes never reach it.
fn one_off_on_an_occurrence_date_is_independent<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    let one = K::one_off(
        &c,
        &ctx,
        &Spec {
            location: Some("Room 1"),
            ..weekly("Lecture", B, "10:00", "12:00")
        },
    )
    .unwrap();
    K::override_(&c, &on::<K>(&c, &t, B), ov().date("2026-01-13")).unwrap();
    assert!(K::generate(&c, &t, D).unwrap().is_empty());
    K::edit(&c, &t, A, edit().title("Renamed").start("09:00")).unwrap();
    assert_eq!(K::delete(&c, &t, B).unwrap(), 3);
    assert_eq!(
        row_of::<K>(&c, &one),
        "2026-01-12 10:00-12:00 Lecture @Room 1"
    );
}

// ===========================================================================
// 4. Generation
// ===========================================================================

fn horizon_extended_in_steps_with_edits_and_moves_between<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::edit(&c, &t, C, edit().times("11:00", "13:00")).unwrap();
    assert_eq!(
        K::generate(&c, &t, "2026-02-09").unwrap(),
        ["2026-02-02", "2026-02-09"]
    );
    K::override_(&c, &on::<K>(&c, &t, "2026-02-02"), ov().date("2026-02-03")).unwrap();
    assert_eq!(
        K::generate(&c, &t, "2026-02-23").unwrap(),
        ["2026-02-16", "2026-02-23"]
    );
    K::edit(&c, &t, "2026-02-09", edit().loc(Some("Hall"))).unwrap();
    assert_eq!(K::generate(&c, &t, "2026-03-02").unwrap(), ["2026-03-02"]);
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-12 10:00-12:00 Lecture @Room 1",
            "2026-01-19 11:00-13:00 Lecture @Room 1",
            "2026-01-26 11:00-13:00 Lecture @Room 1",
            "2026-02-03 11:00-13:00 Lecture @Room 1",
            "2026-02-09 11:00-13:00 Lecture @Hall",
            "2026-02-16 11:00-13:00 Lecture @Hall",
            "2026-02-23 11:00-13:00 Lecture @Hall",
            "2026-03-02 11:00-13:00 Lecture @Hall",
        ]
    );
}

fn horizon_before_and_on_the_anchor_then_extended<K: Kind>() {
    let c = crate::db::test_conn();
    let ctx = K::ctx(&c, "Study");
    let t = K::series(&c, &ctx, &weekly("Lecture", A, "10:00", "12:00")).unwrap();
    assert!(K::generate(&c, &t, "2026-01-04").unwrap().is_empty());
    assert_eq!(K::generate(&c, &t, A).unwrap(), [A]);
    assert!(K::generate(&c, &t, A).unwrap().is_empty());
    assert!(K::generate(&c, &t, "2026-01-04").unwrap().is_empty());
    assert_eq!(K::generate(&c, &t, C).unwrap(), [B, C]);
    assert_eq!(rows::<K>(&c, &t).len(), 3);
}

fn weekly_series_crosses_year_end_and_dst_changes<K: Kind>() {
    let c = crate::db::test_conn();
    let ctx = K::ctx(&c, "Study");
    let y = K::series(&c, &ctx, &weekly("Year", "2026-12-21", "10:00", "12:00")).unwrap();
    assert_eq!(
        K::generate(&c, &y, "2027-01-18").unwrap(),
        [
            "2026-12-21",
            "2026-12-28",
            "2027-01-04",
            "2027-01-11",
            "2027-01-18"
        ]
    );
    K::edit(&c, &y, "2027-01-04", edit().start("09:00")).unwrap();
    assert_eq!(
        view::<K>(&c, &y),
        [
            "2026-12-21 10:00-12:00 Year",
            "2026-12-28 10:00-12:00 Year",
            "2027-01-04 09:00-12:00 Year",
            "2027-01-11 09:00-12:00 Year",
            "2027-01-18 09:00-12:00 Year",
        ]
    );
    // Dates carry no time zone: DST changes neither dates nor times.
    let s = K::series(&c, &ctx, &weekly("Spring", "2026-03-23", "01:30", "03:30")).unwrap();
    assert_eq!(
        K::generate(&c, &s, "2026-04-06").unwrap(),
        ["2026-03-23", "2026-03-30", "2026-04-06"]
    );
    let f = K::series(&c, &ctx, &weekly("Fall", "2026-10-19", "02:00", "03:00")).unwrap();
    assert_eq!(
        K::generate(&c, &f, "2026-11-02").unwrap(),
        ["2026-10-19", "2026-10-26", "2026-11-02"]
    );
    assert!(view::<K>(&c, &f).iter().all(|r| r.contains("02:00-03:00")));
}

fn long_horizon_generates_exact_counts_in_one_go_or_in_steps<K: Kind>() {
    let until = "2030-12-30";
    let weeks = (NaiveDate::parse_from_str(until, "%Y-%m-%d").unwrap()
        - NaiveDate::parse_from_str(A, "%Y-%m-%d").unwrap())
    .num_days()
        / 7
        + 1;
    let c1 = crate::db::test_conn();
    let ctx1 = K::ctx(&c1, "Study");
    let t1 = K::series(&c1, &ctx1, &weekly("Lecture", A, "10:00", "12:00")).unwrap();
    assert_eq!(K::generate(&c1, &t1, until).unwrap().len() as i64, weeks);
    let c2 = crate::db::test_conn();
    let ctx2 = K::ctx(&c2, "Study");
    let t2 = K::series(&c2, &ctx2, &weekly("Lecture", A, "10:00", "12:00")).unwrap();
    for step in [
        "2026-06-30",
        "2027-12-31",
        "2027-12-31",
        "2029-02-28",
        until,
    ] {
        K::generate(&c2, &t2, step).unwrap();
    }
    assert_eq!(view::<K>(&c1, &t1), view::<K>(&c2, &t2));
    assert!(K::generate(&c1, &t1, until).unwrap().is_empty());
}

/// After every kind of operation, generating to the same horizon again
/// creates nothing and changes nothing.
fn generate_is_idempotent_after_every_kind_of_operation<K: Kind>() {
    let (c, _, t) = setup::<K>();
    let h = "2026-02-16";
    K::generate(&c, &t, h).unwrap();
    let idem = |what: &str| {
        let before = view::<K>(&c, &t);
        assert!(K::generate(&c, &t, h).unwrap().is_empty(), "after {what}");
        assert_eq!(view::<K>(&c, &t), before, "after {what}");
    };
    idem("generate");
    K::override_(&c, &on::<K>(&c, &t, A), ov().start("09:00")).unwrap();
    idem("time override");
    K::override_(&c, &on::<K>(&c, &t, B), ov().date("2026-01-14")).unwrap();
    idem("move");
    K::override_(&c, &on::<K>(&c, &t, C), ov().cancel(true)).unwrap();
    idem("cancel");
    K::edit(&c, &t, C, edit().times("11:00", "13:00")).unwrap();
    idem("series edit");
    K::delete(&c, &t, "2026-02-09").unwrap();
    idem("delete following");
    let d = on::<K>(&c, &t, D);
    trash(&c, &d);
    idem("trash");
    restore(&c, &d);
    idem("restore");
    assert_eq!(rows::<K>(&c, &t).len(), 7);
}

// ===========================================================================
// 5. One-offs
// ===========================================================================

fn one_off_lifecycle_override_cancel_trash_restore<K: Kind>() {
    let c = crate::db::test_conn();
    let ctx = K::ctx(&c, "Study");
    let id = K::one_off(
        &c,
        &ctx,
        &Spec {
            location: Some("Desk"),
            ..weekly("Office hour", "2026-02-03", "09:00", "10:00")
        },
    )
    .unwrap();
    K::override_(&c, &id, ov().start("09:30")).unwrap();
    assert_eq!(
        row_of::<K>(&c, &id),
        "2026-02-03 09:30-10:00 Office hour @Desk"
    );
    K::override_(&c, &id, ov().cancel(true)).unwrap();
    assert_eq!(
        K::listed(&c, &ctx.space),
        ["2026-02-03 09:30-10:00 Office hour @Desk cancelled"]
    );
    trash(&c, &id);
    assert!(K::listed(&c, &ctx.space).is_empty());
    restore(&c, &id);
    K::override_(&c, &id, ov().date("2026-02-04").cancel(false).loc(None)).unwrap();
    assert_eq!(
        K::listed(&c, &ctx.space),
        ["2026-02-04 09:30-10:00 Office hour"]
    );
}

fn one_off_time_boundaries<K: Kind>() {
    let c = crate::db::test_conn();
    let ctx = K::ctx(&c, "Study");
    let make = |s: &str, e: &str| K::one_off(&c, &ctx, &weekly("T", A, s, e));
    make("00:00", "23:59").unwrap();
    make("11:59", "12:00").unwrap();
    for (s, e) in [("10:00", "10:00"), ("23:59", "00:00"), ("12:00", "11:59")] {
        assert!(is_invalid(&fails_cleanly(&c, || make(s, e))), "{s}-{e}");
    }
    assert_eq!(K::listed(&c, &ctx.space).len(), 2);
}

/// Times must be zero padded `HH:MM`, 24-hour: an unpadded "9:00" (which
/// would sort after "10:00" as text) or an out of range time is rejected
/// either way round, for one-offs, series and series edits alike.
fn malformed_times_are_rejected<K: Kind>() {
    let c = crate::db::test_conn();
    let ctx = K::ctx(&c, "Study");
    for (s, e) in [
        ("9:00", "10:00"),
        ("10:00", "9:00"),
        ("10:00", "24:00"),
        ("10:60", "11:00"),
        ("10:00", "11:00 "),
        ("ab:cd", "11:00"),
        ("", "11:00"),
    ] {
        let one_off = fails_cleanly(&c, || K::one_off(&c, &ctx, &weekly("T", A, s, e)));
        assert!(is_invalid(&one_off), "one-off {s}-{e}");
        let series = fails_cleanly(&c, || K::series(&c, &ctx, &weekly("T", A, s, e)));
        assert!(is_invalid(&series), "series {s}-{e}");
    }
    let t = lecture::<K>(&c, &ctx);
    let err = fails_cleanly(&c, || K::edit(&c, &t, A, edit().times("9:00", "11:00")));
    assert!(is_invalid(&err));
    let b = on::<K>(&c, &t, B);
    let err = fails_cleanly(&c, || K::override_(&c, &b, ov().times("9:00", "11:00")));
    assert!(is_invalid(&err));
    K::one_off(&c, &ctx, &weekly("T", A, "09:00", "10:00")).unwrap();
}

// ===========================================================================
// 6. Validation and atomicity
// ===========================================================================

fn failed_series_edits_change_nothing_anywhere<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    K::override_(&c, &on::<K>(&c, &t, B), ov().start("09:00")).unwrap();
    K::one_off(&c, &ctx, &weekly("Office hour", B, "13:00", "14:00")).unwrap();
    let u = K::series(
        &c,
        &ctx,
        &weekly("Tutorial", "2026-01-07", "14:00", "15:00"),
    )
    .unwrap();
    K::generate(&c, &u, D).unwrap();
    for e in [
        edit().end("09:00"),
        edit().start("12:30"),
        edit().start("12:00"),
        edit()
            .title("Changed")
            .loc(Some("Hall"))
            .times("13:00", "11:00"),
    ] {
        let err = fails_cleanly(&c, || K::edit(&c, &t, A, e.clone()));
        assert!(is_invalid(&err), "{e:?}");
    }
}

fn failed_overrides_change_nothing_anywhere<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    K::one_off(&c, &ctx, &weekly("Office hour", B, "13:00", "14:00")).unwrap();
    let b = on::<K>(&c, &t, B);
    for o in [
        ov().start("12:30"),
        ov().end("09:00"),
        ov().times("11:00", "11:00"),
        ov().date("2026-01-13")
            .cancel(true)
            .loc(Some("X"))
            .times("13:00", "12:00"),
    ] {
        let err = fails_cleanly(&c, || K::override_(&c, &b, o.clone()));
        assert!(is_invalid(&err), "{o:?}");
    }
    assert!(matches!(
        K::override_(&c, "nope", ov()).unwrap_err(),
        AppError::NotFound(_)
    ));
}

/// 01-12 ends 10:30 on its own. A series start of 10:45 would make it end
/// before it starts, so it keeps both times; a later 10:15 fits and reaches
/// its (never overridden) start.
fn series_edit_invalid_for_an_override_keeps_its_times_until_a_later_valid_edit<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::override_(&c, &on::<K>(&c, &t, B), ov().end("10:30")).unwrap();
    K::edit(&c, &t, A, edit().start("10:45")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:45-12:00 Lecture @Room 1",
            "2026-01-12 10:00-10:30 Lecture @Room 1",
            "2026-01-19 10:45-12:00 Lecture @Room 1",
            "2026-01-26 10:45-12:00 Lecture @Room 1",
        ]
    );
    K::edit(&c, &t, A, edit().start("10:15")).unwrap();
    assert_eq!(
        view::<K>(&c, &t),
        [
            "2026-01-05 10:15-12:00 Lecture @Room 1",
            "2026-01-12 10:15-10:30 Lecture @Room 1",
            "2026-01-19 10:15-12:00 Lecture @Room 1",
            "2026-01-26 10:15-12:00 Lecture @Room 1",
        ]
    );
}

// ===========================================================================
// 7. Listing
// ===========================================================================

fn listing_follows_every_operation<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    let other = K::ctx(&c, "Elsewhere");
    K::one_off(&c, &other, &weekly("Not here", B, "08:00", "09:00")).unwrap();
    assert_eq!(K::listed(&c, &ctx.space).len(), 4);
    K::override_(&c, &on::<K>(&c, &t, B), ov().cancel(true)).unwrap();
    let c_id = on::<K>(&c, &t, C);
    trash(&c, &c_id);
    K::one_off(&c, &ctx, &weekly("Exam", D, "08:00", "09:00")).unwrap();
    assert_eq!(
        K::listed(&c, &ctx.space),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-12 10:00-12:00 Lecture @Room 1 cancelled",
            "2026-01-26 08:00-09:00 Exam",
            "2026-01-26 10:00-12:00 Lecture @Room 1",
        ]
    );
    K::delete(&c, &t, D).unwrap();
    restore(&c, &c_id);
    assert_eq!(
        K::listed(&c, &ctx.space),
        [
            "2026-01-05 10:00-12:00 Lecture @Room 1",
            "2026-01-12 10:00-12:00 Lecture @Room 1 cancelled",
            "2026-01-19 10:00-12:00 Lecture @Room 1",
            "2026-01-26 08:00-09:00 Exam",
        ]
    );
    assert_eq!(
        K::listed(&c, &other.space),
        ["2026-01-12 08:00-09:00 Not here"]
    );
}

fn same_day_rows_list_by_start_time<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    K::one_off(&c, &ctx, &weekly("Late", B, "13:00", "14:00")).unwrap();
    K::one_off(&c, &ctx, &weekly("Early", B, "08:00", "09:00")).unwrap();
    K::override_(&c, &on::<K>(&c, &t, A), ov().date(B).start("11:00")).unwrap();
    assert_eq!(
        K::listed(&c, &ctx.space),
        [
            "2026-01-12 08:00-09:00 Early",
            "2026-01-12 10:00-12:00 Lecture @Room 1",
            "2026-01-12 11:00-12:00 Lecture @Room 1",
            "2026-01-12 13:00-14:00 Late",
            "2026-01-19 10:00-12:00 Lecture @Room 1",
            "2026-01-26 10:00-12:00 Lecture @Room 1",
        ]
    );
}

fn template_listing_tracks_delete_restore_and_rename<K: Kind>() {
    let (c, ctx, t) = setup::<K>();
    let u = K::series(
        &c,
        &ctx,
        &weekly("Tutorial", "2026-01-07", "14:00", "15:00"),
    )
    .unwrap();
    K::generate(&c, &u, D).unwrap();
    assert_eq!(K::templates(&c, &ctx.space), ["Lecture", "Tutorial"]);
    K::delete(&c, &t, C).unwrap();
    assert_eq!(K::templates(&c, &ctx.space), ["Lecture", "Tutorial"]);
    K::delete(&c, &t, A).unwrap();
    assert_eq!(K::templates(&c, &ctx.space), ["Tutorial"]);
    restore(&c, &t);
    K::edit(&c, &u, A, edit().title("Lab")).unwrap();
    assert_eq!(K::templates(&c, &ctx.space), ["Lecture", "Lab"]);
}

fn delete_counts_across_a_sequence<K: Kind>() {
    let (c, _, t) = setup::<K>();
    K::generate(&c, &t, "2026-02-16").unwrap();
    trash(&c, &on::<K>(&c, &t, "2026-02-02"));
    K::override_(&c, &on::<K>(&c, &t, D), ov().cancel(true)).unwrap();
    K::override_(&c, &on::<K>(&c, &t, "2026-02-16"), ov().date("2026-01-20")).unwrap();
    assert_eq!(K::delete(&c, &t, "2026-02-09").unwrap(), 1);
    assert_eq!(K::delete(&c, &t, C).unwrap(), 3);
    assert_eq!(K::delete(&c, &t, "2027-01-01").unwrap(), 0);
    assert!(!K::template(&c, &t).trashed);
    assert_eq!(K::delete(&c, &t, A).unwrap(), 2);
    assert!(K::template(&c, &t).trashed);
    assert_eq!(rows::<K>(&c, &t).len(), 7);
}

// ===========================================================================
// 8. Randomized sequences (deterministic, seeded)
// ===========================================================================

struct Lcg(u64);

impl Lcg {
    fn new(seed: u64) -> Self {
        Lcg(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ 0xD1B5_4A32_D192_ED03)
    }
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
    fn chance(&mut self, pct: u64) -> bool {
        self.next() % 100 < pct
    }
}

fn day(offset: i64) -> String {
    (NaiveDate::from_ymd_opt(2026, 1, 5).unwrap() + chrono::Duration::days(offset))
        .format("%Y-%m-%d")
        .to_string()
}

fn clock(slot: usize) -> String {
    format!("{:02}:{:02}", 6 + slot / 4, (slot % 4) * 15)
}

fn valid(s: &Option<String>, e: &Option<String>) -> bool {
    matches!((s, e), (Some(s), Some(e)) if s < e)
}

/// A start and/or end for a random patch; sometimes backwards.
fn time_patch(rng: &mut Lcg) -> (Option<String>, Option<String>) {
    match rng.below(4) {
        0 => (Some(clock(rng.below(48))), None),
        1 => (None, Some(clock(rng.below(48)))),
        _ => {
            let s = rng.below(40);
            let e = if rng.chance(15) {
                s.saturating_sub(rng.below(3))
            } else {
                s + 1 + rng.below(8)
            };
            (Some(clock(s)), Some(clock(e)))
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct Model {
    title: String,
    start: Option<String>,
    end: Option<String>,
    location: Option<String>,
}

/// Every cadence date from the anchor (a session's snapped to its weekday).
fn model_slots(t: &Tpl, until: &str) -> Vec<String> {
    let mut cur = NaiveDate::parse_from_str(&t.anchor, "%Y-%m-%d").unwrap();
    let until = NaiveDate::parse_from_str(until, "%Y-%m-%d").unwrap();
    if let Some(w) = t.weekday {
        while i64::from(cur.weekday().num_days_from_monday()) != w {
            cur = cur + Days::new(1);
        }
    }
    let mut slots = Vec::new();
    while cur <= until {
        slots.push(cur.format("%Y-%m-%d").to_string());
        cur = match t.cadence.as_str() {
            "daily" => cur + Days::new(1),
            "monthly" => cur.checked_add_months(Months::new(1)).unwrap(),
            _ => cur + Days::new(7),
        };
    }
    slots
}

/// What a series edit from `old` to `new` should leave on one reached row:
/// an untouched field follows, an overridden one keeps its own value unless
/// it equals the old series value; backwards times keep the row's own.
fn after_edit(o: &Occ, old: &Model, new: &Model) -> Row {
    let follow = |bit: i64, cur: &Option<String>, prev: &Option<String>, next: &Option<String>| {
        if o.mask & bit == 0 || cur == prev {
            next.clone()
        } else {
            cur.clone()
        }
    };
    let mut start = follow(1, &o.row.start, &old.start, &new.start);
    let mut end = follow(2, &o.row.end, &old.end, &new.end);
    if !valid(&start, &end) {
        start = o.row.start.clone();
        end = o.row.end.clone();
    }
    let title = if new.title != old.title && o.row.title == old.title {
        new.title.clone()
    } else {
        o.row.title.clone()
    };
    Row {
        start,
        end,
        title,
        location: follow(4, &o.row.location, &old.location, &new.location),
        ..o.row.clone()
    }
}

/// Runs 30 to 60 random operations and checks after every one that only the
/// rows it may touch changed, exactly as modelled, and that the series
/// invariants hold. Returns the final state without ids, for determinism.
fn run_random<K: Kind>(seed: u64) -> Vec<String> {
    let c = crate::db::test_conn();
    let ctx = K::ctx(&c, "Random");
    let mut rng = Lcg::new(seed);
    let mut series: Vec<String> = Vec::new();
    let mut models: BTreeMap<String, Model> = BTreeMap::new();
    let mut moved: BTreeSet<String> = BTreeSet::new();
    let steps = 30 + rng.below(31);
    for step in 0..steps {
        // `listed` keeps the date/key order, so random picks never depend on ids.
        let listed: Vec<Occ> = K::all(&c);
        let before: BTreeMap<String, Occ> =
            listed.iter().map(|o| (o.id.clone(), o.clone())).collect();
        let tpls: BTreeMap<String, Tpl> = series
            .iter()
            .map(|t| (t.clone(), K::template(&c, t)))
            .collect();
        let mut may_change: BTreeSet<String> = BTreeSet::new();
        let mut expected_new: Option<(String, Vec<String>)> = None;
        let mut one_off_expected = false;
        let mut template_trashed: Option<(String, bool)> = None;
        let mut expected_rows: BTreeMap<String, Row> = BTreeMap::new();
        let roll = if series.is_empty() { 0 } else { rng.below(100) };
        let pick = |rng: &mut Lcg| series[rng.below(series.len())].clone();
        let what;

        if roll < 8 && series.len() < 3 {
            what = "create";
            let cadence = K::CADENCES[rng.below(K::CADENCES.len())];
            let anchor = day(rng.below(21) as i64);
            let s = rng.below(40);
            let e = s + 1 + rng.below(8);
            let location = rng.chance(50).then(|| format!("Room {}", rng.below(3)));
            let title = format!("S{}", series.len());
            let tid = K::series(
                &c,
                &ctx,
                &Spec {
                    title: &title,
                    cadence,
                    anchor: &anchor,
                    start: &clock(s),
                    end: &clock(e),
                    location: location.as_deref(),
                },
            )
            .unwrap();
            models.insert(
                tid.clone(),
                Model {
                    title,
                    start: Some(clock(s)),
                    end: Some(clock(e)),
                    location,
                },
            );
            series.push(tid);
        } else if roll < 22 || series.is_empty() {
            what = "generate";
            let tid = pick(&mut rng);
            let until = day(rng.below(110) as i64);
            let own: Vec<&Occ> = before
                .values()
                .filter(|o| o.template_id.as_deref() == Some(tid.as_str()))
                .collect();
            let taken: BTreeSet<&str> = own.iter().map(|o| o.row.date.as_str()).collect();
            let expected: Vec<String> = model_slots(&tpls[&tid], &until)
                .into_iter()
                .skip(own.len())
                .filter(|d| !taken.contains(d.as_str()))
                .collect();
            let created = K::generate(&c, &tid, &until).unwrap();
            assert_eq!(
                created, expected,
                "seed {seed} step {step}: generated dates"
            );
            expected_new = Some((tid, expected));
        } else if roll < 42 {
            what = "override";
            let pool: Vec<&Occ> = listed.iter().collect();
            if pool.is_empty() {
                continue;
            }
            let o = pool[rng.below(pool.len())].clone();
            let mut p = Ov::default();
            if rng.chance(30) {
                let d = NaiveDate::parse_from_str(&o.row.date, "%Y-%m-%d").unwrap()
                    + chrono::Duration::days(rng.below(21) as i64 - 10);
                p.date = Some(d.format("%Y-%m-%d").to_string());
            }
            if rng.chance(40) {
                (p.start, p.end) = time_patch(&mut rng);
            }
            if rng.chance(25) {
                p.location = Some((!rng.chance(30)).then(|| format!("Room {}", rng.below(3))));
            }
            if rng.chance(20) {
                p.cancelled = Some(!o.row.cancelled);
            }
            let start = p.start.clone().or(o.row.start.clone());
            let end = p.end.clone().or(o.row.end.clone());
            if valid(&start, &end) {
                K::override_(&c, &o.id, p.clone()).unwrap();
                let location = p.location.clone().unwrap_or(o.row.location.clone());
                // A patched field set back to the series value ends its
                // override; one changed to anything else is marked.
                let tpl = o.template_id.as_ref().and_then(|t| tpls.get(t));
                let mut mask = o.mask;
                for (bit, patched, value, own, series) in [
                    (
                        1,
                        p.start.is_some(),
                        &start,
                        &o.row.start,
                        tpl.map(|t| &t.start),
                    ),
                    (2, p.end.is_some(), &end, &o.row.end, tpl.map(|t| &t.end)),
                    (
                        4,
                        p.location.is_some(),
                        &location,
                        &o.row.location,
                        tpl.map(|t| &t.location),
                    ),
                ] {
                    if !patched {
                        continue;
                    }
                    if series == Some(value) {
                        mask &= !bit;
                    } else if value != own {
                        mask |= bit;
                    }
                }
                let row = Row {
                    date: p.date.clone().unwrap_or(o.row.date.clone()),
                    start,
                    end,
                    location,
                    cancelled: p.cancelled.unwrap_or(o.row.cancelled),
                    ..o.row.clone()
                };
                if row.date != o.row.date {
                    moved.insert(o.id.clone());
                }
                let after = K::all(&c).into_iter().find(|a| a.id == o.id).unwrap();
                assert_eq!(after.mask, mask, "seed {seed} step {step}: override mask");
                expected_rows.insert(o.id.clone(), row);
                may_change.insert(o.id.clone());
            } else {
                let err = fails_cleanly(&c, || K::override_(&c, &o.id, p.clone()));
                assert!(is_invalid(&err));
            }
        } else if roll < 60 {
            what = "edit";
            let tid = pick(&mut rng);
            let old = models[&tid].clone();
            let from = day(rng.below(130) as i64 - 7);
            let mut e = Edit::default();
            if rng.chance(25) {
                e.title = Some(["S0", "S1", "S2", "Renamed", "Other"][rng.below(5)].into());
            }
            if rng.chance(50) {
                (e.start, e.end) = time_patch(&mut rng);
            }
            if rng.chance(30) {
                e.location = Some((!rng.chance(30)).then(|| format!("Room {}", rng.below(3))));
            }
            let new = Model {
                title: e.title.clone().unwrap_or(old.title.clone()),
                start: e.start.clone().or(old.start.clone()),
                end: e.end.clone().or(old.end.clone()),
                location: e.location.clone().unwrap_or(old.location.clone()),
            };
            if valid(&new.start, &new.end) {
                K::edit(&c, &tid, &from, e).unwrap();
                for o in before.values().filter(|o| {
                    o.template_id.as_deref() == Some(tid.as_str())
                        && !o.row.trashed
                        && o.row.date.as_str() >= from.as_str()
                }) {
                    expected_rows.insert(o.id.clone(), after_edit(o, &old, &new));
                    may_change.insert(o.id.clone());
                }
                models.insert(tid, new);
            } else {
                let err = fails_cleanly(&c, || K::edit(&c, &tid, &from, e.clone()));
                assert!(is_invalid(&err));
            }
        } else if roll < 70 {
            what = "delete";
            let tid = pick(&mut rng);
            let from = day(rng.below(130) as i64);
            let live: Vec<&Occ> = before
                .values()
                .filter(|o| o.template_id.as_deref() == Some(tid.as_str()) && !o.row.trashed)
                .collect();
            let targets: Vec<&Occ> = live
                .iter()
                .copied()
                .filter(|o| o.row.date.as_str() >= from.as_str())
                .collect();
            let remaining = live.len() - targets.len();
            let was_trashed = tpls[&tid].trashed;
            if remaining == 0 && was_trashed {
                // See `delete_after_restoring_into_a_trashed_template_errors_and_changes_nothing`.
                let err = fails_cleanly(&c, || K::delete(&c, &tid, &from));
                assert!(matches!(err, AppError::NotFound(_)));
                continue;
            }
            let result = K::delete(&c, &tid, &from);
            assert_eq!(result.unwrap(), targets.len(), "seed {seed} step {step}");
            for o in targets {
                expected_rows.insert(
                    o.id.clone(),
                    Row {
                        trashed: true,
                        ..o.row.clone()
                    },
                );
                may_change.insert(o.id.clone());
            }
            template_trashed = Some((tid, was_trashed || remaining == 0));
        } else if roll < 78 {
            what = "trash";
            let live: Vec<&Occ> = listed.iter().filter(|o| !o.row.trashed).collect();
            if live.is_empty() {
                continue;
            }
            let o = live[rng.below(live.len())];
            trash(&c, &o.id);
            expected_rows.insert(
                o.id.clone(),
                Row {
                    trashed: true,
                    ..o.row.clone()
                },
            );
            may_change.insert(o.id.clone());
        } else if roll < 86 {
            what = "restore";
            let gone: Vec<&Occ> = listed.iter().filter(|o| o.row.trashed).collect();
            if gone.is_empty() {
                continue;
            }
            let o = gone[rng.below(gone.len())];
            restore(&c, &o.id);
            expected_rows.insert(
                o.id.clone(),
                Row {
                    trashed: false,
                    ..o.row.clone()
                },
            );
            may_change.insert(o.id.clone());
        } else {
            what = "one-off";
            let date = day(rng.below(100) as i64);
            let s = rng.below(40);
            let e = if rng.chance(15) {
                s
            } else {
                s + 1 + rng.below(8)
            };
            let spec = Spec {
                title: "One-off",
                cadence: "weekly",
                anchor: &date,
                start: &clock(s),
                end: &clock(e),
                location: None,
            };
            if s < e {
                K::one_off(&c, &ctx, &spec).unwrap();
                one_off_expected = true;
            } else {
                let err = fails_cleanly(&c, || K::one_off(&c, &ctx, &spec));
                assert!(is_invalid(&err));
            }
        }

        // --- Invariants after every step ---
        let at = format!("seed {seed} step {step} ({what})");
        let after: BTreeMap<String, Occ> =
            K::all(&c).into_iter().map(|o| (o.id.clone(), o)).collect();
        assert!(after.len() >= before.len(), "{at}: rows only ever grow");
        for (id, b) in &before {
            let a = after
                .get(id)
                .unwrap_or_else(|| panic!("{at}: a row vanished"));
            match expected_rows.get(id) {
                Some(row) => assert_eq!(&a.row, row, "{at}: changed row"),
                None => assert_eq!(a, b, "{at}: a row it must not touch changed"),
            }
            assert!(may_change.contains(id) || a == b, "{at}");
        }
        let new_rows: Vec<&Occ> = after
            .values()
            .filter(|o| !before.contains_key(&o.id))
            .collect();
        match &expected_new {
            Some((tid, dates)) => {
                let t = K::template(&c, tid);
                let old_dates: BTreeSet<&str> = before
                    .values()
                    .filter(|o| o.template_id.as_deref() == Some(tid.as_str()))
                    .map(|o| o.row.date.as_str())
                    .collect();
                let mut got: Vec<String> = new_rows.iter().map(|o| o.row.date.clone()).collect();
                got.sort();
                assert_eq!(&got, dates, "{at}: new rows");
                for n in &new_rows {
                    assert_eq!(n.template_id.as_deref(), Some(tid.as_str()), "{at}");
                    assert!(!old_dates.contains(n.row.date.as_str()), "{at}: twin");
                    assert_eq!(
                        (&n.row.title, &n.row.start, &n.row.end, &n.row.location),
                        (&t.title, &t.start, &t.end, &t.location),
                        "{at}: a new row copies the template"
                    );
                    assert!(!n.row.cancelled && !n.row.trashed && n.mask == 0, "{at}");
                }
            }
            None if one_off_expected => {
                assert_eq!(new_rows.len(), 1, "{at}");
                assert!(new_rows[0].template_id.is_none(), "{at}");
            }
            None => assert!(new_rows.is_empty(), "{at}: unexpected new rows"),
        }
        for tid in &series {
            let t = K::template(&c, tid);
            let m = &models[tid];
            assert_eq!(
                (&t.title, &t.start, &t.end, &t.location),
                (&m.title, &m.start, &m.end, &m.location),
                "{at}: template follows the last applied edit"
            );
            let trashed = match &template_trashed {
                Some((d, v)) if d == tid => *v,
                _ => tpls.get(tid).is_some_and(|t| t.trashed),
            };
            assert_eq!(t.trashed, trashed, "{at}: template trash state");
            let mut dates = BTreeSet::new();
            for o in after.values().filter(|o| {
                o.template_id.as_deref() == Some(tid.as_str()) && !moved.contains(&o.id)
            }) {
                assert!(
                    dates.insert(&o.row.date),
                    "{at}: two unmoved rows on one date"
                );
            }
        }
        for o in after.values().filter(|o| !o.row.trashed) {
            assert!(
                o.row.all_day || valid(&o.row.start, &o.row.end),
                "{at}: bad times"
            );
        }
    }

    // The module's own getter agrees with the raw rows.
    for o in K::all(&c) {
        assert_eq!(K::get(&c, &o.id), o.row, "seed {seed}: getter");
    }
    let mut out = Vec::new();
    for tid in &series {
        out.push(tpl::<K>(&c, tid));
        out.extend(view::<K>(&c, tid));
    }
    out.extend(one_offs::<K>(&c));
    out
}

fn random_sequences_keep_every_invariant<K: Kind>() {
    for seed in 1..=24 {
        run_random::<K>(seed);
    }
}

fn random_sequences_are_deterministic<K: Kind>() {
    for seed in 101..=106 {
        assert_eq!(run_random::<K>(seed), run_random::<K>(seed), "seed {seed}");
    }
}

shared!(
    // 0. The reported bug, from the spec
    spec_following_from_middle_then_from_first_reaches_every_occurrence,
    spec_this_edit_and_back_then_series_edit_from_first,
    spec_series_edit_there_and_back_then_again_from_first,
    spec_five_individually_edited_occurrences_keep_their_time,
    spec_users_report_edit_edit_back_then_all_upcoming,
    spec_users_report_with_this_one_edits_then_all_upcoming,
    spec_every_series_edit_combination_then_all_upcoming_reaches_everything,
    spec_clearing_the_series_location_from_the_form_clears_it,
    spec_clearing_one_occurrences_location_from_the_form_clears_it,
    spec_occurrence_set_back_to_the_series_follows_after_a_later_split,
    all_upcoming_opened_before_today_leaves_earlier_days_alone,
    anchor_this_then_following_from_the_same_occurrence_updates_it,
    anchor_location_override_keeps_location_and_takes_the_new_time,
    anchor_gets_the_patched_field_while_a_later_override_keeps_its_own,
    anchor_patch_without_a_field_leaves_that_field_alone_everywhere,
    anchor_follows_later_series_edits_after_taking_the_patch,
    // 1. Create, then edit
    edits_from_first_middle_last_and_before_first_in_sequence,
    time_edits_ping_pong_between_split_points,
    interleaved_time_location_title_edits_from_different_dates,
    location_only_edit_of_all_pulls_times_from_a_later_split,
    following_edit_then_all_edit_reaches_every_field,
    renaming_back_restores_a_uniform_title,
    // 2. Overrides mixed with series edits
    overridden_time_survives_time_edits_and_follows_location_edits,
    overrides_on_non_adjacent_occurrences_then_edits_from_several_points,
    cancel_then_series_edit_then_uncancel,
    move_onto_another_occurrence_date_then_edit_and_delete_from_there,
    move_onto_a_future_slot_generate_then_move_back_leaves_a_hole,
    move_back_and_forth_keeps_one_row_per_slot,
    override_equal_to_the_old_series_value_follows_the_next_edit,
    cleared_location_override_survives_location_edits,
    // 3. Deletes and Trash
    delete_following_then_edit_remaining_leaves_trashed_rows_frozen,
    delete_following_then_extending_the_horizon_brings_the_series_back,
    trash_single_then_edit_then_delete_counts_only_live,
    restored_occurrence_follows_later_series_edits,
    delete_whole_series_then_restore_template_and_occurrences,
    empty_trash_after_delete_following_then_generate_recreates_the_dates,
    empty_trash_after_deleting_the_whole_series_removes_it_for_good,
    empty_trash_keeps_a_trashed_template_a_live_occurrence_still_uses,
    delete_following_twice_returns_zero_and_keeps_the_template,
    delete_after_restoring_into_a_trashed_template_errors_and_changes_nothing,
    one_offs_are_untouched_by_every_series_operation,
    two_parallel_series_never_touch_each_other,
    one_off_on_an_occurrence_date_is_independent,
    // 4. Generation
    horizon_extended_in_steps_with_edits_and_moves_between,
    horizon_before_and_on_the_anchor_then_extended,
    weekly_series_crosses_year_end_and_dst_changes,
    long_horizon_generates_exact_counts_in_one_go_or_in_steps,
    generate_is_idempotent_after_every_kind_of_operation,
    // 5. One-offs
    one_off_lifecycle_override_cancel_trash_restore,
    one_off_time_boundaries,
    malformed_times_are_rejected,
    // 6. Validation and atomicity
    failed_series_edits_change_nothing_anywhere,
    failed_overrides_change_nothing_anywhere,
    series_edit_invalid_for_an_override_keeps_its_times_until_a_later_valid_edit,
    // 7. Listing
    listing_follows_every_operation,
    same_day_rows_list_by_start_time,
    template_listing_tracks_delete_restore_and_rename,
    delete_counts_across_a_sequence,
    // 8. Randomized
    random_sequences_keep_every_invariant,
    random_sequences_are_deterministic,
);

// ===========================================================================
// Calendar entries only: daily and monthly cadences, descriptions, all-day
// and multi-day entries.
// ===========================================================================

fn cal_series(
    c: &Connection,
    title: &str,
    cadence: &str,
    anchor: &str,
    times: (&str, &str),
) -> String {
    let ctx = Cal::ctx(c, title);
    Cal::series(
        c,
        &ctx,
        &Spec {
            title,
            cadence,
            anchor,
            start: times.0,
            end: times.1,
            location: None,
        },
    )
    .unwrap()
}

fn cal_one_off(
    c: &Connection,
    space: &str,
    title: &str,
    dates: (&str, Option<&str>),
    times: Option<(&str, &str)>,
) -> AppResult<String> {
    cal::create_one_off_calendar_entry(
        c,
        space.into(),
        title.into(),
        dates.0.into(),
        dates.1.map(Into::into),
        times.map(|t| t.0.into()),
        times.map(|t| t.1.into()),
        times.is_none(),
        None,
        None,
    )
    .map(|o| o.entity.id)
}

/// A daily walk across the end of January: a split edit, a move onto a slot
/// not generated yet, more generating, then an edit of all.
#[test]
fn calendar_daily_series_edits_and_moves_across_a_month_end() {
    let c = crate::db::test_conn();
    let t = cal_series(&c, "Walk", "daily", "2026-01-29", ("07:00", "08:00"));
    assert_eq!(Cal::generate(&c, &t, "2026-02-03").unwrap().len(), 6);
    Cal::edit(&c, &t, "2026-02-01", edit().times("06:30", "07:30")).unwrap();
    Cal::override_(
        &c,
        &on::<Cal>(&c, &t, "2026-01-31"),
        ov().date("2026-02-05"),
    )
    .unwrap();
    assert_eq!(Cal::generate(&c, &t, "2026-02-05").unwrap(), ["2026-02-04"]);
    assert_eq!(
        view::<Cal>(&c, &t),
        [
            "2026-01-29 07:00-08:00 Walk",
            "2026-01-30 07:00-08:00 Walk",
            "2026-02-01 06:30-07:30 Walk",
            "2026-02-02 06:30-07:30 Walk",
            "2026-02-03 06:30-07:30 Walk",
            "2026-02-04 06:30-07:30 Walk",
            "2026-02-05 07:00-08:00 Walk",
        ]
    );
    Cal::edit(&c, &t, "2026-01-01", edit().start("06:00")).unwrap();
    assert!(view::<Cal>(&c, &t)
        .iter()
        .all(|r| r.contains("06:00-07:30")));
}

/// Monthly on the 31st: the dates drift to the 28th after February (already
/// pinned in `calendar::tests::generate_all_day_and_monthly_end_of_month_drift`);
/// edits and moves on top of that behave like any other cadence.
#[test]
fn calendar_monthly_31st_series_with_edits_and_a_move() {
    let c = crate::db::test_conn();
    let t = cal_series(&c, "Rent", "monthly", "2026-01-31", ("09:00", "09:30"));
    assert_eq!(
        Cal::generate(&c, &t, "2026-06-30").unwrap(),
        [
            "2026-01-31",
            "2026-02-28",
            "2026-03-28",
            "2026-04-28",
            "2026-05-28",
            "2026-06-28"
        ]
    );
    Cal::edit(&c, &t, "2026-03-28", edit().times("10:00", "10:30")).unwrap();
    Cal::override_(
        &c,
        &on::<Cal>(&c, &t, "2026-04-28"),
        ov().date("2026-04-30"),
    )
    .unwrap();
    assert_eq!(Cal::generate(&c, &t, "2026-07-31").unwrap(), ["2026-07-28"]);
    assert_eq!(
        view::<Cal>(&c, &t),
        [
            "2026-01-31 09:00-09:30 Rent",
            "2026-02-28 09:00-09:30 Rent",
            "2026-03-28 10:00-10:30 Rent",
            "2026-04-30 10:00-10:30 Rent",
            "2026-05-28 10:00-10:30 Rent",
            "2026-06-28 10:00-10:30 Rent",
            "2026-07-28 10:00-10:30 Rent",
        ]
    );
}

/// Monthly from 29 February of a leap year, and from 30 January into one.
#[test]
fn calendar_monthly_series_from_a_leap_day() {
    let c = crate::db::test_conn();
    let leap = cal_series(&c, "Leap", "monthly", "2028-02-29", ("09:00", "10:00"));
    let dates = Cal::generate(&c, &leap, "2029-04-30").unwrap();
    assert_eq!(dates.len(), 15);
    assert_eq!(&dates[..2], ["2028-02-29", "2028-03-29"]);
    // NOTE: possible bug: the same end-of-month drift: after February 2029
    // (28 days) the series stays on the 28th instead of returning to the 29th.
    assert_eq!(
        &dates[11..],
        ["2029-01-29", "2029-02-28", "2029-03-28", "2029-04-28"]
    );
    let jan30 = cal_series(&c, "Thirty", "monthly", "2028-01-30", ("09:00", "10:00"));
    assert_eq!(
        Cal::generate(&c, &jan30, "2028-04-30").unwrap(),
        ["2028-01-30", "2028-02-29", "2028-03-29", "2028-04-29"]
    );
}

/// Descriptions follow series edits unless edited on one occurrence.
#[test]
fn calendar_description_edits_interleaved_with_an_occurrence_description() {
    let c = crate::db::test_conn();
    let ctx = Cal::ctx(&c, "Life");
    let t = cal::create_calendar_entry_template(
        &c,
        ctx.space,
        "Gym".into(),
        "weekly".into(),
        Some("07:00".into()),
        Some("08:00".into()),
        false,
        None,
        Some("Bring towel".into()),
        A.into(),
    )
    .unwrap()
    .id;
    cal::generate_occurrences(&c, &t, D).unwrap();
    let desc = |d: Option<&str>| cal::CalendarEntrySeriesPatch {
        description: Some(d.map(Into::into)),
        ..Default::default()
    };
    cal::override_occurrence(
        &c,
        &on::<Cal>(&c, &t, B),
        cal::CalendarEntryOverride {
            description: Some(Some("Bring water".into())),
            ..Default::default()
        },
    )
    .unwrap();
    cal::update_calendar_entry_series(&c, &t, A, desc(Some("Bring mat"))).unwrap();
    cal::update_calendar_entry_series(&c, &t, C, desc(None)).unwrap();
    Cal::edit(&c, &t, B, edit().start("06:30")).unwrap();
    assert_eq!(
        view::<Cal>(&c, &t),
        [
            "2026-01-05 07:00-08:00 Gym #Bring mat",
            "2026-01-12 06:30-08:00 Gym #Bring water",
            "2026-01-19 06:30-08:00 Gym",
            "2026-01-26 06:30-08:00 Gym",
        ]
    );
    cal::update_calendar_entry_series(&c, &t, A, desc(Some("Mat"))).unwrap();
    assert_eq!(
        view::<Cal>(&c, &t),
        [
            "2026-01-05 06:30-08:00 Gym #Mat",
            "2026-01-12 06:30-08:00 Gym #Bring water",
            "2026-01-19 06:30-08:00 Gym #Mat",
            "2026-01-26 06:30-08:00 Gym #Mat",
        ]
    );
}

/// All-day and multi-day one-offs: listing order, edits, invalid edits,
/// cancel, trash and restore.
#[test]
fn calendar_all_day_and_multi_day_one_offs_lifecycle_and_order() {
    let c = crate::db::test_conn();
    let space = Cal::ctx(&c, "Life").space;
    let trip = cal_one_off(
        &c,
        &space,
        "Trip",
        ("2026-02-02", Some("2026-02-04")),
        Some(("08:00", "20:00")),
    )
    .unwrap();
    let holiday = cal_one_off(&c, &space, "Holiday", ("2026-02-03", None), None).unwrap();
    cal_one_off(
        &c,
        &space,
        "Dentist",
        ("2026-02-03", None),
        Some(("09:00", "10:00")),
    )
    .unwrap();
    // All-day entries have no start time and list first on their day.
    assert_eq!(
        Cal::listed(&c, &space),
        [
            "2026-02-02 08:00-20:00 Trip ~2026-02-04",
            "2026-02-03 all-day Holiday",
            "2026-02-03 09:00-10:00 Dentist",
        ]
    );
    let set = |id: &str, p: cal::CalendarEntryOverride| cal::override_occurrence(&c, id, p);
    set(
        &trip,
        cal::CalendarEntryOverride {
            end_date: Some(Some("2026-02-05".into())),
            ..Default::default()
        },
    )
    .unwrap();
    for bad in [
        cal::CalendarEntryOverride {
            end_date: Some(Some("2026-02-01".into())),
            ..Default::default()
        },
        cal::CalendarEntryOverride {
            date: Some("2026-02-06".into()),
            ..Default::default()
        },
    ] {
        assert!(is_invalid(&fails_cleanly(&c, || set(&trip, bad))));
    }
    // Making the holiday timed needs times.
    assert!(is_invalid(&fails_cleanly(&c, || set(
        &holiday,
        cal::CalendarEntryOverride {
            all_day: Some(false),
            ..Default::default()
        }
    ))));
    set(
        &holiday,
        cal::CalendarEntryOverride {
            all_day: Some(false),
            start_time: Some(Some("00:00".into())),
            end_time: Some(Some("23:59".into())),
            ..Default::default()
        },
    )
    .unwrap();
    set(
        &trip,
        cal::CalendarEntryOverride {
            cancelled: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    trash(&c, &trip);
    assert_eq!(Cal::listed(&c, &space).len(), 2);
    restore(&c, &trip);
    assert_eq!(
        Cal::listed(&c, &space),
        [
            "2026-02-02 08:00-20:00 Trip ~2026-02-05 cancelled",
            "2026-02-03 00:00-23:59 Holiday",
            "2026-02-03 09:00-10:00 Dentist",
        ]
    );
    // A one-off with its end before its start is never stored.
    assert!(is_invalid(&fails_cleanly(&c, || cal_one_off(
        &c,
        &space,
        "Backwards",
        ("2026-02-03", Some("2026-02-02")),
        None
    ))));
}

#[test]
fn calendar_invalid_recurrences_are_rejected_without_a_trace() {
    let c = crate::db::test_conn();
    let ctx = Cal::ctx(&c, "Life");
    for cadence in ["Weekly", "", "yearly", " weekly", "biweekly", "DAILY"] {
        let err = fails_cleanly(&c, || {
            Cal::series(
                &c,
                &ctx,
                &Spec {
                    cadence,
                    ..weekly("T", A, "07:00", "08:00")
                },
            )
        });
        assert!(is_invalid(&err), "{cadence:?}");
    }
}

/// The series goes all day while 01-12 keeps its own start, then back to
/// timed: 01-12 keeps that start and takes the new end.
#[test]
fn calendar_series_to_all_day_and_back_with_an_overridden_start() {
    let c = crate::db::test_conn();
    let t = cal_series(&c, "Gym", "weekly", A, ("07:00", "08:00"));
    Cal::generate(&c, &t, D).unwrap();
    Cal::override_(&c, &on::<Cal>(&c, &t, B), ov().start("06:00")).unwrap();
    cal::update_calendar_entry_series(
        &c,
        &t,
        A,
        cal::CalendarEntrySeriesPatch {
            all_day: Some(true),
            start_time: Some(None),
            end_time: Some(None),
            ..Default::default()
        },
    )
    .unwrap();
    let b = Cal::get(&c, &on::<Cal>(&c, &t, B));
    assert!(b.all_day);
    assert_eq!(
        (b.start.as_deref(), b.end.as_deref()),
        (Some("06:00"), None)
    );
    assert_eq!(
        view::<Cal>(&c, &t),
        [
            "2026-01-05 all-day Gym",
            "2026-01-12 all-day Gym",
            "2026-01-19 all-day Gym",
            "2026-01-26 all-day Gym",
        ]
    );
    cal::update_calendar_entry_series(
        &c,
        &t,
        A,
        cal::CalendarEntrySeriesPatch {
            all_day: Some(false),
            start_time: Some(Some("09:00".into())),
            end_time: Some(Some("10:00".into())),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        view::<Cal>(&c, &t),
        [
            "2026-01-05 09:00-10:00 Gym",
            "2026-01-12 06:00-10:00 Gym",
            "2026-01-19 09:00-10:00 Gym",
            "2026-01-26 09:00-10:00 Gym",
        ]
    );
}

/// Pins current behavior: an occurrence in Trash can still be edited.
#[test]
fn calendar_override_of_a_trashed_occurrence_is_stored() {
    let c = crate::db::test_conn();
    let t = cal_series(&c, "Gym", "weekly", A, ("07:00", "08:00"));
    Cal::generate(&c, &t, D).unwrap();
    let b = on::<Cal>(&c, &t, B);
    trash(&c, &b);
    Cal::override_(&c, &b, ov().start("06:00").cancel(true)).unwrap();
    assert_eq!(
        row_of::<Cal>(&c, &b),
        "2026-01-12 06:00-08:00 Gym cancelled trashed"
    );
}

/// A template with an anchor that is not a date is rejected and stores
/// nothing, for calendar entries and sessions alike.
#[test]
fn template_with_a_garbage_anchor_is_rejected() {
    let c = crate::db::test_conn();
    let cal_ctx = Cal::ctx(&c, "Odd");
    let ses_ctx = Ses::ctx(&c, "Odder");
    for anchor in ["next monday", "2026-02-30", "2026-1-5", ""] {
        let spec = weekly("Odd", anchor, "07:00", "08:00");
        let err = fails_cleanly(&c, || Cal::series(&c, &cal_ctx, &spec));
        assert!(is_invalid(&err), "calendar {anchor:?}");
        let err = fails_cleanly(&c, || {
            ses::create_session_template(
                &c,
                ses_ctx.space.clone(),
                "Odd".into(),
                ses_ctx.course.clone(),
                0,
                "07:00".into(),
                "08:00".into(),
                None,
                anchor.into(),
            )
        });
        assert!(is_invalid(&err), "session {anchor:?}");
    }
    assert!(Cal::templates(&c, &cal_ctx.space).is_empty());
    assert!(Ses::templates(&c, &ses_ctx.space).is_empty());
}

#[test]
fn calendar_series_time_boundaries() {
    let c = crate::db::test_conn();
    let t = cal_series(&c, "Gym", "daily", A, ("07:00", "08:00"));
    Cal::generate(&c, &t, B).unwrap();
    Cal::edit(&c, &t, A, edit().times("00:00", "23:59")).unwrap();
    assert!(view::<Cal>(&c, &t)
        .iter()
        .all(|r| r.contains("00:00-23:59")));
    for (s, e) in [("23:59", "00:00"), ("12:00", "12:00")] {
        assert!(is_invalid(&fails_cleanly(&c, || Cal::edit(
            &c,
            &t,
            A,
            edit().times(s, e)
        ))));
    }
}

// ===========================================================================
// Course sessions only: the Course link, notes, the briefing queries and
// the weekday.
// ===========================================================================

fn course_of(c: &Connection, id: &str) -> Vec<String> {
    let mut stmt = c
        .prepare(
            "SELECT to_entity_id FROM relationships
             WHERE from_entity_id = ?1 AND relationship_type = 'session-course'",
        )
        .unwrap();
    stmt.query_map([id], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

/// Every occurrence, generated before or after edits, moved, trashed or
/// restored, keeps exactly one link to the Course; so does a one-off.
#[test]
fn session_course_link_survives_every_series_operation() {
    let (c, ctx, t) = setup::<Ses>();
    let check = |c: &Connection| {
        for o in Ses::all(c) {
            assert_eq!(
                course_of(c, &o.id),
                std::slice::from_ref(&ctx.course),
                "{}",
                fmt(&o.row)
            );
        }
        assert_eq!(course_of(c, &t), std::slice::from_ref(&ctx.course));
    };
    check(&c);
    Ses::edit(
        &c,
        &t,
        A,
        edit().title("Lecture II").times("09:00", "11:00"),
    )
    .unwrap();
    Ses::override_(&c, &on::<Ses>(&c, &t, B), ov().date("2026-01-13")).unwrap();
    let c_id = on::<Ses>(&c, &t, C);
    trash(&c, &c_id);
    restore(&c, &c_id);
    Ses::delete(&c, &t, D).unwrap();
    Ses::generate(&c, &t, "2026-02-09").unwrap();
    Ses::one_off(&c, &ctx, &weekly("Office hour", B, "13:00", "14:00")).unwrap();
    check(&c);
    assert!(ses::list_sessions(&c, Some(&ctx.space))
        .unwrap()
        .iter()
        .all(|s| s.course_title.as_deref() == Some("Algorithms")));
}

/// The Dashboard's range query: inclusive bounds, date then time order,
/// without cancelled or trashed sessions.
#[test]
fn session_briefing_range_skips_cancelled_and_trashed() {
    let (c, ctx, t) = setup::<Ses>();
    Ses::override_(&c, &on::<Ses>(&c, &t, B), ov().cancel(true)).unwrap();
    trash(&c, &on::<Ses>(&c, &t, C));
    Ses::one_off(&c, &ctx, &weekly("Exam", D, "08:00", "09:00")).unwrap();
    let got: Vec<(String, String)> = ses::list_sessions_between(&c, A, D)
        .unwrap()
        .into_iter()
        .map(|s| (s.date, s.title))
        .collect();
    assert_eq!(
        got,
        [
            (A.to_string(), "Lecture".to_string()),
            (D.to_string(), "Exam".to_string()),
            (D.to_string(), "Lecture".to_string()),
        ]
    );
    assert_eq!(
        ses::list_sessions_between(&c, "2026-01-06", "2026-01-25")
            .unwrap()
            .len(),
        0
    );
}

/// Creating a template for a Course that does not exist fails and, being all
/// or nothing, stores nothing.
#[test]
fn session_template_for_an_unknown_course_stores_nothing() {
    let c = crate::db::test_conn();
    let ctx = Ses::ctx(&c, "Study");
    let err = fails_cleanly(&c, || {
        ses::create_session_template(
            &c,
            ctx.space.clone(),
            "Orphan".into(),
            "no-such-course".into(),
            0,
            "10:00".into(),
            "12:00".into(),
            None,
            A.into(),
        )
    });
    assert!(matches!(err, AppError::NotFound(_)));
    assert!(Ses::templates(&c, &ctx.space).is_empty());
}

/// The same for a one-off session.
#[test]
fn session_one_off_for_an_unknown_course_stores_nothing() {
    let c = crate::db::test_conn();
    let ctx = Ses::ctx(&c, "Study");
    let err = fails_cleanly(&c, || {
        ses::create_one_off_session(
            &c,
            ctx.space.clone(),
            "Orphan".into(),
            "no-such-course".into(),
            A.into(),
            "10:00".into(),
            "12:00".into(),
            None,
        )
    });
    assert!(matches!(err, AppError::NotFound(_)));
    assert!(Ses::listed(&c, &ctx.space).is_empty());
}

/// A Sunday template anchored on a Monday rolls into the next year.
#[test]
fn session_weekday_snap_across_the_year_end() {
    let c = crate::db::test_conn();
    let ctx = Ses::ctx(&c, "Study");
    let t = ses::create_session_template(
        &c,
        ctx.space,
        "Sunday".into(),
        ctx.course,
        6,
        "10:00".into(),
        "11:00".into(),
        None,
        "2026-12-28".into(),
    )
    .unwrap()
    .id;
    assert_eq!(
        Ses::generate(&c, &t, "2027-01-17").unwrap(),
        ["2027-01-03", "2027-01-10", "2027-01-17"]
    );
}

/// Notes are never templated: series edits, deletes and generating leave
/// them alone, and new occurrences start without.
#[test]
fn session_notes_survive_every_series_operation() {
    let (c, _, t) = setup::<Ses>();
    let b = on::<Ses>(&c, &t, B);
    ses::override_occurrence(
        &c,
        &b,
        ses::OccurrenceOverride {
            notes: Some(Some("Bring laptop".into())),
            ..Default::default()
        },
    )
    .unwrap();
    Ses::edit(
        &c,
        &t,
        A,
        edit().title("Lecture II").times("09:00", "11:00").loc(None),
    )
    .unwrap();
    Ses::edit(&c, &t, B, edit().start("08:00")).unwrap();
    Ses::delete(&c, &t, D).unwrap();
    Ses::generate(&c, &t, "2026-02-02").unwrap();
    assert_eq!(
        view::<Ses>(&c, &t),
        [
            "2026-01-05 09:00-11:00 Lecture II",
            "2026-01-12 08:00-11:00 Lecture II #Bring laptop",
            "2026-01-19 08:00-11:00 Lecture II",
            "2026-01-26 08:00-11:00 Lecture II trashed",
            "2026-02-02 08:00-11:00 Lecture II",
        ]
    );
}

/// DIFFERS between the two session listings: with the Course in Trash,
/// `list_sessions` drops its title but the Dashboard's range query keeps it.
#[test]
fn session_listings_disagree_about_a_trashed_course() {
    let (c, ctx, _) = setup::<Ses>();
    trash(&c, &ctx.course);
    assert!(ses::list_sessions(&c, Some(&ctx.space))
        .unwrap()
        .iter()
        .all(|s| s.course_title.is_none()));
    assert!(ses::list_sessions_between(&c, A, D)
        .unwrap()
        .iter()
        .all(|s| s.course_title.as_deref() == Some("Algorithms")));
}

/// The weekday must be 0 (Monday) to 6 (Sunday): anything else is rejected
/// on create and stores nothing. Generating from one stored before this
/// check existed fails with the same error instead of stepping day by day
/// until the date overflows.
#[test]
fn session_template_weekday_is_validated() {
    let c = crate::db::test_conn();
    let ctx = Ses::ctx(&c, "Study");
    let make = |weekday: i64| {
        ses::create_session_template(
            &c,
            ctx.space.clone(),
            "Bad".into(),
            ctx.course.clone(),
            weekday,
            "10:00".into(),
            "11:00".into(),
            None,
            A.into(),
        )
    };
    for weekday in [7, -1, 100] {
        assert!(
            is_invalid(&fails_cleanly(&c, || make(weekday))),
            "{weekday}"
        );
    }
    assert!(Ses::templates(&c, &ctx.space).is_empty());
    for weekday in 0..=6 {
        make(weekday).unwrap();
    }
    let t = make(0).unwrap().id;
    c.execute(
        "UPDATE session_templates SET weekday = 7 WHERE entity_id = ?1",
        [&t],
    )
    .unwrap();
    assert!(is_invalid(&fails_cleanly(&c, || Ses::generate(&c, &t, D))));
}
