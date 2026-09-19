use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::error::{AppError, AppResult};
use chrono::{Datelike, Days, NaiveDate};
use rusqlite::{params, Connection};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "session-course", inverse_label: "has session", cardinality: Cardinality::OneToPerFrom }
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

pub fn list_sessions(conn: &Connection, space_id: &str) -> AppResult<Vec<SessionOccurrence>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, s.* FROM entities e JOIN sessions s ON s.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY s.date ASC, s.start_time ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_occurrence)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
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
