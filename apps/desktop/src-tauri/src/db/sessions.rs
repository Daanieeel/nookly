use crate::db::common_fields;
use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, MovesWith, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use chrono::{Datelike, Days, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "session-course", label: "Session of course", description: "Ties a session to the course it belongs to.", from_type: Some("session"), to_type: Some("course"), inverse_label: "has session", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::FromFollowsTo }
}
// The Jot typed during one occurrence and the Note that refines it afterwards.
// Each occurrence has at most one of each; they are real Jots and Notes.
inventory::submit! {
    RelationshipTypeDef { name: "session-jot", label: "Jot for session", description: "The jot typed during a session.", from_type: Some("session"), to_type: Some("jot"), inverse_label: "jot for session", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::ToFollowsFrom }
}
inventory::submit! {
    RelationshipTypeDef { name: "session-note", label: "Note for session", description: "The note written for a session.", from_type: Some("session"), to_type: Some("note"), inverse_label: "note for session", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::ToFollowsFrom }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionOccurrence {
    pub entity: Entity,
    pub template_id: Option<String>,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub cancelled: bool,
    pub location: Option<String>,
    pub notes: Option<String>,
    /// The linked Course's title, for the calendar. Only `list_sessions` joins it.
    pub course_title: Option<String>,
    /// Which fields were overridden on this occurrence (`series::Field` bits).
    /// Internal bookkeeping for series edits, never serialized.
    #[serde(skip)]
    pub overridden_fields: i64,
}

fn row_to_occurrence(row: &rusqlite::Row) -> rusqlite::Result<SessionOccurrence> {
    Ok(SessionOccurrence {
        entity: crate::db::entities::row_to_entity(row)?,
        template_id: row.get("template_id")?,
        date: row.get("date")?,
        start_time: row.get("start_time")?,
        end_time: row.get("end_time")?,
        cancelled: row.get::<_, i64>("cancelled")? != 0,
        location: row.get("location")?,
        notes: row.get("notes")?,
        // Absent unless the query joined the Course.
        course_title: row.get("course_title").unwrap_or(None),
        overridden_fields: row.get("overridden_fields")?,
    })
}

/// Rejects a session that doesn't end after it starts, with the one check
/// calendar entries use too (`series::validate_times`). A session is never all day.
fn validate_times(start_time: &str, end_time: &str) -> AppResult<()> {
    crate::db::series::validate_times("a session", false, Some(start_time), Some(end_time))
}

/// Rejects a weekday outside 0 (Monday) to 6 (Sunday).
fn validate_weekday(weekday: i64) -> AppResult<()> {
    if (0..=6).contains(&weekday) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "weekday must be 0 (Monday) to 6 (Sunday)".into(),
        ))
    }
}

#[allow(clippy::too_many_arguments)]
pub fn create_session_template(
    conn: &Connection,
    space_id: String,
    title: String,
    course_id: String,
    weekday: i64,
    start_time: String,
    end_time: String,
    location: Option<String>,
    anchor_date: String,
) -> AppResult<Entity> {
    validate_times(&start_time, &end_time)?;
    validate_weekday(weekday)?;
    crate::db::series::validate_date("anchorDate", &anchor_date)?;
    // All or nothing: an unknown Course must not leave a template behind.
    crate::db::atomically(conn, || {
        let entity = crate::db::entities::create_entity(
            conn,
            space_id,
            "session_template".into(),
            title,
            None,
        )?;
        conn.execute(
            "INSERT INTO session_templates (entity_id, weekday, start_time, end_time, location, anchor_date)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![entity.id, weekday, start_time, end_time, location, anchor_date],
        )?;
        crate::db::relationships::create_relationship(
            conn,
            entity.id.clone(),
            course_id,
            "session-course".into(),
            None,
            None,
        )?;
        Ok(entity)
    })
}

/// Generates weekly occurrences from the template's anchor date up to (and including)
/// `until_date` (§5.6). Slots it already filled are never filled again, even when their
/// occurrence was moved, cancelled or trashed (`series::slots_to_generate`).
pub fn generate_occurrences(
    conn: &Connection,
    template_id: &str,
    until_date: &str,
) -> AppResult<Vec<SessionOccurrence>> {
    let (weekday, start_time, end_time, location, anchor_date): (i64, String, String, Option<String>, String) = conn
        .query_row(
            "SELECT weekday, start_time, end_time, location, anchor_date FROM session_templates WHERE entity_id = ?1",
            params![template_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|_| AppError::NotFound(format!("session template {template_id}")))?;

    let course_id: String = conn.query_row(
        "SELECT to_entity_id FROM relationships WHERE from_entity_id = ?1 AND relationship_type = 'session-course'",
        params![template_id],
        |row| row.get(0),
    )?;

    let template_entity = crate::db::entities::get_entity(conn, template_id)?;
    let mut cursor = NaiveDate::parse_from_str(&anchor_date, "%Y-%m-%d")
        .map_err(|e| AppError::Db(format!("invalid anchor_date: {e}")))?;
    let until = NaiveDate::parse_from_str(until_date, "%Y-%m-%d")
        .map_err(|e| AppError::InvalidInput(format!("invalid until_date: {e}")))?;
    // A weekday stored before it was validated would never match below.
    validate_weekday(weekday)?;
    let target_weekday = weekday as u32;
    let mut slots = Vec::new();
    // At most six steps to the first matching weekday.
    while cursor.weekday().num_days_from_monday() != target_weekday {
        match cursor.checked_add_days(Days::new(1)) {
            Some(next) => cursor = next,
            None => return Ok(Vec::new()),
        }
    }
    while cursor <= until {
        slots.push(cursor.format("%Y-%m-%d").to_string());
        match cursor.checked_add_days(Days::new(7)) {
            Some(next) => cursor = next,
            None => break,
        }
    }

    let dates =
        crate::db::series::slots_to_generate::<SessionOccurrence>(conn, template_id, slots)?;
    crate::db::atomically(conn, || {
        let mut created = Vec::new();
        for date in dates {
            let occurrence = create_occurrence(
                conn,
                &template_entity.space_id,
                &template_entity.title,
                &course_id,
                Some(template_id.to_string()),
                date,
                start_time.clone(),
                end_time.clone(),
                location.clone(),
            )?;
            crate::db::series::record_slot(conn, template_id, &occurrence.date)?;
            created.push(occurrence);
        }
        Ok(created)
    })
}

#[allow(clippy::too_many_arguments)]
pub fn create_one_off_session(
    conn: &Connection,
    space_id: String,
    title: String,
    course_id: String,
    date: String,
    start_time: String,
    end_time: String,
    location: Option<String>,
) -> AppResult<SessionOccurrence> {
    validate_times(&start_time, &end_time)?;
    // All or nothing: an unknown Course must not leave a session behind.
    crate::db::atomically(conn, || {
        create_occurrence(
            conn, &space_id, &title, &course_id, None, date, start_time, end_time, location,
        )
    })
}

#[allow(clippy::too_many_arguments)]
fn create_occurrence(
    conn: &Connection,
    space_id: &str,
    title: &str,
    course_id: &str,
    template_id: Option<String>,
    date: String,
    start_time: String,
    end_time: String,
    location: Option<String>,
) -> AppResult<SessionOccurrence> {
    let entity = crate::db::entities::create_entity(
        conn,
        space_id.to_string(),
        "session".into(),
        title.to_string(),
        None,
    )?;
    conn.execute(
        "INSERT INTO sessions (entity_id, template_id, date, start_time, end_time, cancelled, location, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, NULL)",
        params![entity.id, template_id, date, start_time, end_time, location],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        entity.id.clone(),
        course_id.to_string(),
        "session-course".into(),
        None,
        None,
    )?;
    Ok(SessionOccurrence {
        entity,
        template_id,
        date,
        start_time,
        end_time,
        cancelled: false,
        location,
        notes: None,
        course_title: None,
        overridden_fields: 0,
    })
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceOverride {
    pub date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub cancelled: Option<bool>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub location: Option<Option<String>>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub notes: Option<Option<String>>,
}

/// Materialized-occurrence overrides never retroactively affect the template (§5.6).
pub fn override_occurrence(
    conn: &Connection,
    entity_id: &str,
    patch: OccurrenceOverride,
) -> AppResult<SessionOccurrence> {
    let mut stmt = conn.prepare(
        "SELECT e.*, s.* FROM entities e JOIN sessions s ON s.entity_id = e.id WHERE e.id = ?1",
    )?;
    let mut occurrence = stmt
        .query_row(params![entity_id], row_to_occurrence)
        .map_err(|_| AppError::NotFound(format!("session {entity_id}")))?;

    use crate::db::series::{mark_override, Field};
    let mut overridden = occurrence.overridden_fields;
    // What the series holds, so setting a field back to it ends its override.
    let series = match &occurrence.template_id {
        Some(tid) => get_session_template(conn, tid).ok(),
        None => None,
    };
    let series = series.as_ref();
    let times_changed = patch.start_time.is_some() || patch.end_time.is_some();
    if let Some(date) = patch.date {
        occurrence.date = date;
    }
    if let Some(start_time) = patch.start_time {
        mark_override(
            &mut overridden,
            Field::StartTime,
            &occurrence.start_time,
            &start_time,
            series.map(|t| &t.start_time),
        );
        occurrence.start_time = start_time;
    }
    if let Some(end_time) = patch.end_time {
        mark_override(
            &mut overridden,
            Field::EndTime,
            &occurrence.end_time,
            &end_time,
            series.map(|t| &t.end_time),
        );
        occurrence.end_time = end_time;
    }
    if let Some(cancelled) = patch.cancelled {
        occurrence.cancelled = cancelled;
    }
    if let Some(location) = patch.location {
        mark_override(
            &mut overridden,
            Field::Location,
            &occurrence.location,
            &location,
            series.map(|t| &t.location),
        );
        occurrence.location = location;
    }
    occurrence.overridden_fields = overridden;
    if let Some(notes) = patch.notes {
        occurrence.notes = notes;
    }
    // Only a change to the times is checked, so a session stored with odd times
    // before this check existed can still be moved, cancelled or annotated.
    if times_changed {
        validate_times(&occurrence.start_time, &occurrence.end_time)?;
    }

    conn.execute(
        "UPDATE sessions SET date = ?1, start_time = ?2, end_time = ?3, cancelled = ?4, location = ?5, notes = ?6, overridden_fields = ?7 WHERE entity_id = ?8",
        params![
            occurrence.date,
            occurrence.start_time,
            occurrence.end_time,
            occurrence.cancelled as i64,
            occurrence.location,
            occurrence.notes,
            occurrence.overridden_fields,
            entity_id
        ],
    )?;
    Ok(occurrence)
}

pub fn get_session_occurrence(conn: &Connection, entity_id: &str) -> AppResult<SessionOccurrence> {
    conn.query_row(
        "SELECT e.*, s.* FROM entities e JOIN sessions s ON s.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_occurrence,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("session {entity_id}")))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTemplate {
    pub entity: Entity,
    pub weekday: i64,
    pub start_time: String,
    pub end_time: String,
    pub location: Option<String>,
    pub anchor_date: String,
}

fn row_to_template(row: &rusqlite::Row) -> rusqlite::Result<SessionTemplate> {
    Ok(SessionTemplate {
        entity: crate::db::entities::row_to_entity(row)?,
        weekday: row.get("weekday")?,
        start_time: row.get("start_time")?,
        end_time: row.get("end_time")?,
        location: row.get("location")?,
        anchor_date: row.get("anchor_date")?,
    })
}

pub fn get_session_template(conn: &Connection, entity_id: &str) -> AppResult<SessionTemplate> {
    conn.query_row(
        "SELECT e.*, t.weekday, t.start_time, t.end_time, t.location, t.anchor_date
         FROM entities e JOIN session_templates t ON t.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_template,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("session template {entity_id}")))
}

pub fn list_session_templates(
    conn: &Connection,
    space_id: &str,
) -> AppResult<Vec<SessionTemplate>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.weekday, t.start_time, t.end_time, t.location, t.anchor_date
         FROM entities e JOIN session_templates t ON t.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_template)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every Session in `space_id`, or across every Space when `space_id` is
/// `None` — the same optional-filter shape `schema::EntitySchemaDef::list`
/// uses generically, so the unified cross-Space Calendar page and the
/// per-Space Sessions view share one function.
pub fn list_sessions(
    conn: &Connection,
    space_id: Option<&str>,
) -> AppResult<Vec<SessionOccurrence>> {
    let mut sql = String::from(
        "SELECT e.*, s.*, c.title AS course_title
         FROM entities e JOIN sessions s ON s.entity_id = e.id
         LEFT JOIN relationships r ON r.from_entity_id = e.id AND r.relationship_type = 'session-course'
         LEFT JOIN entities c ON c.id = r.to_entity_id AND c.deleted_at IS NULL
         WHERE e.deleted_at IS NULL",
    );
    if space_id.is_some() {
        sql.push_str(" AND e.space_id = ?1");
    }
    sql.push_str(" ORDER BY s.date ASC, s.start_time ASC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = match space_id {
        Some(sid) => stmt.query_map(params![sid], row_to_occurrence)?,
        None => stmt.query_map([], row_to_occurrence)?,
    };
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Bespoke, narrow shape for the Dashboard: cross-Space, with the linked Course
/// pre-joined so the caller doesn't need a follow-up relationship lookup per session.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingSession {
    pub entity_id: String,
    pub title: String,
    pub date: String,
    pub start_time: String,
    pub course_id: Option<String>,
    pub course_title: Option<String>,
    pub space_id: String,
}

const BRIEFING_SESSION_SELECT: &str = "SELECT e.id, e.title, s.date, s.start_time,
            c.id AS course_id, c.title AS course_title, e.space_id
         FROM entities e
         JOIN sessions s ON s.entity_id = e.id
         LEFT JOIN relationships r ON r.from_entity_id = e.id AND r.relationship_type = 'session-course'
         LEFT JOIN entities c ON c.id = r.to_entity_id
         WHERE e.deleted_at IS NULL AND s.cancelled = 0";

fn row_to_briefing_session(row: &rusqlite::Row) -> rusqlite::Result<BriefingSession> {
    Ok(BriefingSession {
        entity_id: row.get("id")?,
        title: row.get("title")?,
        date: row.get("date")?,
        start_time: row.get("start_time")?,
        course_id: row.get("course_id")?,
        course_title: row.get("course_title")?,
        space_id: row.get("space_id")?,
    })
}

pub fn list_sessions_today(conn: &Connection) -> AppResult<Vec<BriefingSession>> {
    let mut stmt = conn.prepare(&format!(
        "{BRIEFING_SESSION_SELECT} AND date(s.date) = date('now') ORDER BY s.start_time ASC"
    ))?;
    let rows = stmt.query_map([], row_to_briefing_session)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every Session from `from` through `to` (inclusive `YYYY-MM-DD` dates), across all
/// Spaces, in time order. The caller passes local dates so "today" and "this week"
/// follow the user's clock rather than SQLite's UTC `now`.
pub fn list_sessions_between(
    conn: &Connection,
    from: &str,
    to: &str,
) -> AppResult<Vec<BriefingSession>> {
    let mut stmt = conn.prepare(&format!(
        "{BRIEFING_SESSION_SELECT} AND date(s.date) BETWEEN date(?1) AND date(?2)
         ORDER BY s.date ASC, s.start_time ASC"
    ))?;
    let rows = stmt.query_map(params![from, to], row_to_briefing_session)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// A change to a recurring series. `None` (an absent key) leaves a field as it
/// is; `Some(None)` (`null`) clears the location.
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPatch {
    pub title: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub location: Option<Option<String>>,
}

/// Edits a template and its occurrences from `from_date` on (§5.6: never
/// earlier ones). A field the user overrode on one occurrence keeps that value
/// (`series::series_value`); every other field follows the series.
pub fn update_session_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
    patch: SeriesPatch,
) -> AppResult<()> {
    update_session_series_anchored(conn, template_id, from_date, None, patch)
}

/// `update_session_series`, opened on the occurrence `anchor_id`: when it is
/// dated `from_date` or later it takes every patched field, even one it
/// overrode on its own before, and those fields stop counting as overridden.
/// Later occurrences keep their own overrides as usual.
pub fn update_session_series_anchored(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
    anchor_id: Option<&str>,
    patch: SeriesPatch,
) -> AppResult<()> {
    let old = get_session_template(conn, template_id)?;
    let patched_start = patch.start_time.is_some();
    let patched_end = patch.end_time.is_some();
    let patched_location = patch.location.is_some();
    let start_time = patch.start_time.unwrap_or_else(|| old.start_time.clone());
    let end_time = patch.end_time.unwrap_or_else(|| old.end_time.clone());
    let location = patch.location.unwrap_or_else(|| old.location.clone());
    validate_times(&start_time, &end_time)?;
    crate::db::atomically(conn, || {
        conn.execute(
        "UPDATE session_templates SET start_time = ?1, end_time = ?2, location = ?3 WHERE entity_id = ?4",
        params![start_time, end_time, location, template_id],
    )?;
        crate::db::series::update_series::<SessionOccurrence>(
            conn,
            template_id,
            from_date,
            anchor_id,
            &old.entity.title,
            patch.title,
            |occurrence, is_anchor| {
                use crate::db::series::{series_value, sync_override, Field};
                let o = occurrence;
                // The anchor takes a patched field as is; any other occurrence
                // keeps a field it overrode (`series_value`).
                let new_start = if is_anchor && patched_start {
                    start_time.clone()
                } else {
                    series_value(
                        o,
                        Field::StartTime,
                        &o.start_time,
                        &old.start_time,
                        &start_time,
                    )
                };
                let new_end = if is_anchor && patched_end {
                    end_time.clone()
                } else {
                    series_value(o, Field::EndTime, &o.end_time, &old.end_time, &end_time)
                };
                let new_location = if is_anchor && patched_location {
                    location.clone()
                } else {
                    series_value(o, Field::Location, &o.location, &old.location, &location)
                };
                // An override that would end before it starts keeps its own times;
                // the anchor takes the series' instead, which are valid.
                let times_fit = validate_times(&new_start, &new_end).is_ok();
                let (new_start, new_end) = if times_fit {
                    (new_start, new_end)
                } else if is_anchor {
                    (start_time.clone(), end_time.clone())
                } else {
                    (o.start_time.clone(), o.end_time.clone())
                };
                let mut mask = o.overridden_fields;
                if is_anchor {
                    if patched_start || !times_fit {
                        sync_override(&mut mask, Field::StartTime, &new_start, &start_time);
                    }
                    if patched_end || !times_fit {
                        sync_override(&mut mask, Field::EndTime, &new_end, &end_time);
                    }
                    if patched_location {
                        sync_override(&mut mask, Field::Location, &new_location, &location);
                    }
                }
                conn.execute(
                "UPDATE sessions SET start_time = ?1, end_time = ?2, location = ?3, overridden_fields = ?4 WHERE entity_id = ?5",
                params![new_start, new_end, new_location, mask, o.entity.id],
            )?;
                Ok(())
            },
        )
    })
}

impl crate::db::series::SeriesOccurrence for SessionOccurrence {
    const TABLE: &'static str = "sessions";
    const TEMPLATE_TABLE: &'static str = "session_templates";
    const ALIAS: &'static str = "s";

    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        row_to_occurrence(row)
    }

    fn entity(&self) -> &Entity {
        &self.entity
    }

    fn overridden_fields(&self) -> i64 {
        self.overridden_fields
    }
}

/// Moves a series' occurrences from `from_date` on to Trash, and the template
/// too once no occurrence is left. Returns how many occurrences went.
pub fn delete_session_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
) -> AppResult<usize> {
    crate::db::series::delete_series::<SessionOccurrence>(conn, template_id, from_date)
}

/// The Jot and Note of one occurrence, when they exist and aren't in Trash.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPages {
    pub jot: Option<Entity>,
    pub note: Option<Entity>,
}

fn session_page(conn: &Connection, session_id: &str, kind: &str) -> AppResult<Option<Entity>> {
    Ok(conn
        .query_row(
            "SELECT e.* FROM relationships r JOIN entities e ON e.id = r.to_entity_id
             WHERE r.from_entity_id = ?1 AND r.relationship_type = ?2 AND e.deleted_at IS NULL",
            params![session_id, format!("session-{kind}")],
            crate::db::entities::row_to_entity,
        )
        .optional()?)
}

pub fn get_session_pages(conn: &Connection, session_id: &str) -> AppResult<SessionPages> {
    Ok(SessionPages {
        jot: session_page(conn, session_id, "jot")?,
        note: session_page(conn, session_id, "note")?,
    })
}

/// The occurrence's Jot or Note (`kind`), created with `title` if it has none.
/// A link to one sitting in Trash is dropped, so a fresh page can take its place.
pub fn create_session_page(
    conn: &Connection,
    session_id: &str,
    kind: &str,
    title: String,
) -> AppResult<Entity> {
    if kind != "jot" && kind != "note" {
        return Err(AppError::InvalidInput(format!(
            "unknown session page kind {kind}"
        )));
    }
    if let Some(existing) = session_page(conn, session_id, kind)? {
        return Ok(existing);
    }
    let session = get_session_occurrence(conn, session_id)?;
    let page = crate::db::notes::create_page(conn, session.entity.space_id, kind, title)?;
    link_session_page(conn, session_id, kind, &page.id)?;
    Ok(page)
}

/// Makes an existing page the occurrence's Jot or Note (`kind`), unless it has
/// a live one already; returns whether it linked. A link to one in Trash is
/// dropped first. Refining a session's Jot into a Note goes through here.
pub fn link_session_page(
    conn: &Connection,
    session_id: &str,
    kind: &str,
    page_id: &str,
) -> AppResult<bool> {
    if kind != "jot" && kind != "note" {
        return Err(AppError::InvalidInput(format!(
            "unknown session page kind {kind}"
        )));
    }
    if session_page(conn, session_id, kind)?.is_some() {
        return Ok(false);
    }
    conn.execute(
        "DELETE FROM relationships WHERE from_entity_id = ?1 AND relationship_type = ?2",
        params![session_id, format!("session-{kind}")],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        session_id.to_string(),
        page_id.to_string(),
        format!("session-{kind}"),
        None,
        None,
    )?;
    Ok(true)
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const FIELD_START_TIME: FieldDef = FieldDef {
    name: "startTime",
    kind: FieldKind::Text,
    required_on_create: true,
    writable_on_update: true,
    description: "\"HH:MM\", 24-hour.",
};

const FIELD_END_TIME: FieldDef = FieldDef {
    name: "endTime",
    kind: FieldKind::Text,
    required_on_create: true,
    writable_on_update: true,
    description: "\"HH:MM\", 24-hour.",
};

const SESSION_TEMPLATE_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "courseId",
        kind: FieldKind::EntityRef("course"),
        required_on_create: true,
        writable_on_update: false,
        description: "The Course this weekly session belongs to (structural: exactly one).",
    },
    FieldDef {
        name: "weekday",
        kind: FieldKind::Integer,
        required_on_create: true,
        writable_on_update: false,
        description: "0 = Monday .. 6 = Sunday.",
    },
    FIELD_START_TIME,
    FIELD_END_TIME,
    common_fields::FIELD_LOCATION,
    FieldDef {
        name: "anchorDate",
        kind: FieldKind::Date,
        required_on_create: true,
        writable_on_update: false,
        description: "First date this weekly template is valid from.",
    },
    FieldDef {
        name: "applyFromDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description: "On update only: the first occurrence date a startTime, endTime or location \
                      change reaches (default today). Earlier occurrences are never rewritten, \
                      and occurrences overridden on their own keep their override.",
    },
];

fn cli_create_session_template(
    conn: &Connection,
    input: CreateInput,
) -> AppResult<serde_json::Value> {
    let course_id = crate::db::schema::require_str(&input.fields, "courseId")?;
    let weekday = crate::db::schema::field_i64(&input.fields, "weekday")
        .ok_or_else(|| AppError::InvalidInput("--field weekday=<0-6> is required".into()))?;
    let start_time = crate::db::schema::require_str(&input.fields, "startTime")?;
    let end_time = crate::db::schema::require_str(&input.fields, "endTime")?;
    let location = crate::db::schema::field_str(&input.fields, "location");
    let anchor_date = crate::db::schema::require_str(&input.fields, "anchorDate")?;
    let entity = create_session_template(
        conn,
        input.space_id,
        input.title,
        course_id,
        weekday,
        start_time,
        end_time,
        location,
        anchor_date,
    )?;
    cli_get_session_template(conn, &entity.id)
}

fn cli_update_session_template(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    use crate::db::schema::field_str;
    let patch = SeriesPatch {
        title: None,
        start_time: field_str(fields, "startTime"),
        end_time: field_str(fields, "endTime"),
        location: fields
            .contains_key("location")
            .then(|| field_str(fields, "location").filter(|l| !l.is_empty())),
    };
    if patch.start_time.is_some() || patch.end_time.is_some() || patch.location.is_some() {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let from = field_str(fields, "applyFromDate").unwrap_or(today);
        update_session_series(conn, id, &from, patch)?;
    }
    cli_get_session_template(conn, id)
}

fn cli_get_session_template(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    crate::error::to_json(get_session_template(conn, id)?)
}

fn cli_list_session_templates(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("session_template list requires --space <space-id>".into())
    })?;
    list_session_templates(conn, space_id)?
        .into_iter()
        .map(crate::error::to_json)
        .collect::<crate::error::AppResult<Vec<_>>>()
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "session_template",
        supports_blocks: false,
        description: "A recurring weekly class/meeting slot. Use `session` to create one-off occurrences \
                      (generating occurrences from a template is GUI-only for now). Updating startTime, \
                      endTime or location edits the series from applyFromDate on.",
        fields: SESSION_TEMPLATE_FIELDS,
        relationship_types: &["session-course"],
        create: cli_create_session_template,
        update: cli_update_session_template,
        get: cli_get_session_template,
        list: cli_list_session_templates,
    }
}

const SESSION_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "courseId",
        kind: FieldKind::EntityRef("course"),
        required_on_create: true,
        writable_on_update: false,
        description: "The Course this session belongs to (structural: exactly one).",
    },
    common_fields::FIELD_DATE,
    FIELD_START_TIME,
    FIELD_END_TIME,
    common_fields::FIELD_LOCATION,
    common_fields::FIELD_CANCELLED,
    FieldDef {
        name: "notes",
        kind: FieldKind::LongText,
        required_on_create: false,
        writable_on_update: true,
        description: "Notes on this occurrence, as markdown. Edited in the Session page.",
    },
];

fn cli_create_session(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let course_id = crate::db::schema::require_str(&input.fields, "courseId")?;
    let date = crate::db::schema::require_str(&input.fields, "date")?;
    let start_time = crate::db::schema::require_str(&input.fields, "startTime")?;
    let end_time = crate::db::schema::require_str(&input.fields, "endTime")?;
    let location = crate::db::schema::field_str(&input.fields, "location");
    let occurrence = create_one_off_session(
        conn,
        input.space_id,
        input.title,
        course_id,
        date,
        start_time,
        end_time,
        location,
    )?;
    crate::error::to_json(occurrence)
}

fn cli_update_session(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let patch = OccurrenceOverride {
        date: crate::db::schema::field_str(fields, "date"),
        start_time: crate::db::schema::field_str(fields, "startTime"),
        end_time: crate::db::schema::field_str(fields, "endTime"),
        cancelled: crate::db::schema::field_bool(fields, "cancelled"),
        location: fields
            .get("location")
            .map(|_| crate::db::schema::field_str(fields, "location")),
        notes: fields
            .get("notes")
            .map(|_| crate::db::schema::field_str(fields, "notes")),
    };
    let occurrence = override_occurrence(conn, id, patch)?;
    crate::error::to_json(occurrence)
}

fn cli_get_session(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    crate::error::to_json(get_session_occurrence(conn, id)?)
}

fn cli_list_sessions(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id
        .ok_or_else(|| AppError::InvalidInput("session list requires --space <space-id>".into()))?;
    list_sessions(conn, Some(space_id))?
        .into_iter()
        .map(crate::error::to_json)
        .collect::<crate::error::AppResult<Vec<_>>>()
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "session",
        supports_blocks: false,
        description: "A single, dated class/meeting occurrence — either one-off, or generated from a session_template.",
        fields: SESSION_FIELDS,
        relationship_types: &["session-course", "session-jot", "session-note", "assignment-due-session"],
        create: cli_create_session,
        update: cli_update_session,
        get: cli_get_session,
        list: cli_list_sessions,
    }
}

#[cfg(test)]
mod tests;
