use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, MovesWith, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use chrono::{Datelike, Days, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "session-course", inverse_label: "has session", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::FromFollowsTo }
}
// The Jot typed during one occurrence and the Note that refines it afterwards.
// Each occurrence has at most one of each; they are real Jots and Notes.
inventory::submit! {
    RelationshipTypeDef { name: "session-jot", inverse_label: "jot for session", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::ToFollowsFrom }
}
inventory::submit! {
    RelationshipTypeDef { name: "session-note", inverse_label: "note for session", cardinality: Cardinality::OneToPerFrom, moves_with: MovesWith::ToFollowsFrom }
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
    })
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
    let entity =
        crate::db::entities::create_entity(conn, space_id, "session_template".into(), title, None)?;
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
}

/// Generates weekly occurrences from the template's anchor date up to (and including)
/// `until_date`, skipping any date that already has an occurrence for this template (§5.6).
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
        .map_err(|e| AppError::Db(format!("invalid until_date: {e}")))?;
    let target_weekday = weekday as u32;
    while cursor.weekday().num_days_from_monday() != target_weekday {
        cursor = cursor
            .checked_add_days(Days::new(1))
            .expect("date overflow");
    }

    let mut created = Vec::new();
    while cursor <= until {
        let date_str = cursor.format("%Y-%m-%d").to_string();
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sessions WHERE template_id = ?1 AND date = ?2",
            params![template_id, date_str],
            |row| row.get(0),
        )?;
        if exists == 0 {
            let occurrence = create_occurrence(
                conn,
                &template_entity.space_id,
                &template_entity.title,
                &course_id,
                Some(template_id.to_string()),
                date_str,
                start_time.clone(),
                end_time.clone(),
                location.clone(),
            )?;
            created.push(occurrence);
        }
        cursor = cursor
            .checked_add_days(Days::new(7))
            .expect("date overflow");
    }
    Ok(created)
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
    create_occurrence(
        conn, &space_id, &title, &course_id, None, date, start_time, end_time, location,
    )
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
    })
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceOverride {
    pub date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub cancelled: Option<bool>,
    pub location: Option<Option<String>>,
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

    if let Some(date) = patch.date {
        occurrence.date = date;
    }
    if let Some(start_time) = patch.start_time {
        occurrence.start_time = start_time;
    }
    if let Some(end_time) = patch.end_time {
        occurrence.end_time = end_time;
    }
    if let Some(cancelled) = patch.cancelled {
        occurrence.cancelled = cancelled;
    }
    if let Some(location) = patch.location {
        occurrence.location = location;
    }
    if let Some(notes) = patch.notes {
        occurrence.notes = notes;
    }

    conn.execute(
        "UPDATE sessions SET date = ?1, start_time = ?2, end_time = ?3, cancelled = ?4, location = ?5, notes = ?6 WHERE entity_id = ?7",
        params![
            occurrence.date,
            occurrence.start_time,
            occurrence.end_time,
            occurrence.cancelled as i64,
            occurrence.location,
            occurrence.notes,
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

pub fn list_sessions(conn: &Connection, space_id: &str) -> AppResult<Vec<SessionOccurrence>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, s.*, c.title AS course_title
         FROM entities e JOIN sessions s ON s.entity_id = e.id
         LEFT JOIN relationships r ON r.from_entity_id = e.id AND r.relationship_type = 'session-course'
         LEFT JOIN entities c ON c.id = r.to_entity_id AND c.deleted_at IS NULL
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY s.date ASC, s.start_time ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_occurrence)?;
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

/// A change to a recurring series. `None` leaves a field as it is.
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPatch {
    pub title: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub location: Option<Option<String>>,
}

/// Edits a template and its occurrences from `from_date` on (§5.6: never
/// earlier ones). An occurrence only takes a new value where it still carries
/// the template's old one, so per occurrence overrides survive.
pub fn update_session_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
    patch: SeriesPatch,
) -> AppResult<()> {
    let old = get_session_template(conn, template_id)?;
    let start_time = patch.start_time.unwrap_or_else(|| old.start_time.clone());
    let end_time = patch.end_time.unwrap_or_else(|| old.end_time.clone());
    let location = patch.location.unwrap_or_else(|| old.location.clone());
    if start_time >= end_time {
        return Err(AppError::InvalidInput(
            "a session has to end after it starts".into(),
        ));
    }
    conn.execute(
        "UPDATE session_templates SET start_time = ?1, end_time = ?2, location = ?3 WHERE entity_id = ?4",
        params![start_time, end_time, location, template_id],
    )?;
    let title = patch.title.filter(|t| *t != old.entity.title);
    if let Some(title) = &title {
        crate::db::entities::update_entity(
            conn,
            template_id,
            crate::db::entities::EntityPatch {
                title: Some(title.clone()),
                ..Default::default()
            },
        )?;
    }

    let mut stmt = conn.prepare(
        "SELECT e.*, s.* FROM entities e JOIN sessions s ON s.entity_id = e.id
         WHERE s.template_id = ?1 AND s.date >= ?2 AND e.deleted_at IS NULL",
    )?;
    let occurrences = stmt
        .query_map(params![template_id, from_date], row_to_occurrence)?
        .collect::<Result<Vec<_>, _>>()?;
    for occurrence in occurrences {
        let keep_or = |current: &String, previous: &String, next: &String| {
            if current == previous {
                next.clone()
            } else {
                current.clone()
            }
        };
        let new_start = keep_or(&occurrence.start_time, &old.start_time, &start_time);
        let new_end = keep_or(&occurrence.end_time, &old.end_time, &end_time);
        let new_location = if occurrence.location == old.location {
            location.clone()
        } else {
            occurrence.location.clone()
        };
        // An override that would end before it starts keeps its own times.
        let (new_start, new_end) = if new_start < new_end {
            (new_start, new_end)
        } else {
            (occurrence.start_time.clone(), occurrence.end_time.clone())
        };
        conn.execute(
            "UPDATE sessions SET start_time = ?1, end_time = ?2, location = ?3 WHERE entity_id = ?4",
            params![new_start, new_end, new_location, occurrence.entity.id],
        )?;
        if let Some(title) = &title {
            if occurrence.entity.title == old.entity.title {
                crate::db::entities::update_entity(
                    conn,
                    &occurrence.entity.id,
                    crate::db::entities::EntityPatch {
                        title: Some(title.clone()),
                        ..Default::default()
                    },
                )?;
            }
        }
    }
    Ok(())
}

/// Moves a series' occurrences from `from_date` on to Trash, and the template
/// too once no occurrence is left. Returns how many occurrences went.
pub fn delete_session_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
) -> AppResult<usize> {
    let ids: Vec<String> = conn
        .prepare(
            "SELECT e.id FROM entities e JOIN sessions s ON s.entity_id = e.id
             WHERE s.template_id = ?1 AND s.date >= ?2 AND e.deleted_at IS NULL",
        )?
        .query_map(params![template_id, from_date], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    for id in &ids {
        crate::db::entities::soft_delete_entity(conn, id)?;
    }
    let remaining: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities e JOIN sessions s ON s.entity_id = e.id
         WHERE s.template_id = ?1 AND e.deleted_at IS NULL",
        params![template_id],
        |row| row.get(0),
    )?;
    if remaining == 0 {
        crate::db::entities::soft_delete_entity(conn, template_id)?;
    }
    Ok(ids.len())
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
    FieldDef {
        name: "startTime",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour.",
    },
    FieldDef {
        name: "endTime",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour.",
    },
    FieldDef {
        name: "location",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "Optional free-text location.",
    },
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
    Ok(serde_json::to_value(get_session_template(conn, id)?)
        .expect("SessionTemplate always serializes"))
}

fn cli_list_session_templates(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("session_template list requires --space <space-id>".into())
    })?;
    Ok(list_session_templates(conn, space_id)?
        .into_iter()
        .map(|t| serde_json::to_value(t).expect("SessionTemplate always serializes"))
        .collect())
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
    FieldDef {
        name: "date",
        kind: FieldKind::Date,
        required_on_create: true,
        writable_on_update: true,
        description: "ISO date this occurrence falls on.",
    },
    FieldDef {
        name: "startTime",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour.",
    },
    FieldDef {
        name: "endTime",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour.",
    },
    FieldDef {
        name: "location",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "Optional free-text location.",
    },
    FieldDef {
        name: "cancelled",
        kind: FieldKind::Boolean,
        required_on_create: false,
        writable_on_update: true,
        description: "Mark this occurrence cancelled without deleting it.",
    },
    FieldDef {
        name: "notes",
        kind: FieldKind::LongText,
        required_on_create: false,
        writable_on_update: true,
        description: "Free-text notes on this occurrence.",
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
    Ok(serde_json::to_value(occurrence).expect("SessionOccurrence always serializes"))
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
    Ok(serde_json::to_value(occurrence).expect("SessionOccurrence always serializes"))
}

fn cli_get_session(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_session_occurrence(conn, id)?)
        .expect("SessionOccurrence always serializes"))
}

fn cli_list_sessions(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id
        .ok_or_else(|| AppError::InvalidInput("session list requires --space <space-id>".into()))?;
    Ok(list_sessions(conn, space_id)?
        .into_iter()
        .map(|o| serde_json::to_value(o).expect("SessionOccurrence always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "session",
        supports_blocks: false,
        description: "A single, dated class/meeting occurrence — either one-off, or generated from a session_template.",
        fields: SESSION_FIELDS,
        relationship_types: &["session-course"],
        create: cli_create_session,
        update: cli_update_session,
        get: cli_get_session,
        list: cli_list_sessions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::courses::create_course;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        conn
    }

    #[test]
    fn generate_occurrences_creates_weekly_sessions_on_correct_weekday() {
        let conn = setup();
        let space = create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let course = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();

        // 2026-01-05 is a Monday.
        let template = create_session_template(
            &conn,
            space.id.clone(),
            "Algorithms Lecture".into(),
            course.id.clone(),
            0,
            "10:00".into(),
            "12:00".into(),
            None,
            "2026-01-05".into(),
        )
        .unwrap();

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
        let space = create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let course = create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
        let template = create_session_template(
            &conn,
            space.id.clone(),
            "Algorithms Lecture".into(),
            course.id.clone(),
            0,
            "10:00".into(),
            "12:00".into(),
            None,
            "2026-01-05".into(),
        )
        .unwrap();
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
        let space = create_space(conn, "Study".into(), None, "#000".into()).unwrap();
        let course = create_course(conn, space.id.clone(), "Algorithms".into()).unwrap();
        let template = create_session_template(
            conn,
            space.id,
            "Lecture".into(),
            course.id,
            0,
            "10:00".into(),
            "12:00".into(),
            None,
            "2026-01-05".into(),
        )
        .unwrap();
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
        let refined =
            crate::db::notes::create_page(&conn, space, "note", "Refined".into()).unwrap();
        assert!(!link_session_page(&conn, id, "note", &refined.id).unwrap());
        crate::db::entities::soft_delete_entity(&conn, &note.id).unwrap();
        assert!(link_session_page(&conn, id, "note", &refined.id).unwrap());
        assert_eq!(
            get_session_pages(&conn, id).unwrap().note.unwrap().id,
            refined.id
        );
    }
}
