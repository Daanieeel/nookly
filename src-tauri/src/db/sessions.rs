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
        "SELECT e.*, s.* FROM entities e JOIN sessions s ON s.entity_id = e.id
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
        writable_on_update: false,
        description: "\"HH:MM\", 24-hour.",
    },
    FieldDef {
        name: "endTime",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: false,
        description: "\"HH:MM\", 24-hour.",
    },
    FieldDef {
        name: "location",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: false,
        description: "Optional free-text location.",
    },
    FieldDef {
        name: "anchorDate",
        kind: FieldKind::Date,
        required_on_create: true,
        writable_on_update: false,
        description: "First date this weekly template is valid from.",
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
    _fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    // No subtype fields are mutable after creation — recurring templates are
    // immutable by design (§5.6); delete and recreate to change the schedule.
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
                      (generating occurrences from a template is GUI-only for now).",
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
}
