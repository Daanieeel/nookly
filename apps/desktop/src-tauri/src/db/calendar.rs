//! Calendar entries: one-off or recurring personal calendar entries the user
//! adds directly in Nookly (module name: "Calendar"). Deliberately separate
//! from `sessions` (a Session must have a Course; a calendar entry never
//! does, and has no structural parent at all) and from `external_calendars`
//! (a read only overlay, never an entity). See
//! `docs/03-modules/sessions-timetable.md` for the Session pattern this
//! mirrors, and the calendar-module plan for why the two stay distinct.

use crate::db::entities::Entity;
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use chrono::{Months, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

const RECURRENCES: &[&str] = &["daily", "weekly", "monthly"];

fn advance(cursor: NaiveDate, recurrence: &str) -> NaiveDate {
    match recurrence {
        "daily" => cursor
            .checked_add_days(chrono::Days::new(1))
            .expect("date overflow"),
        "monthly" => cursor
            .checked_add_months(Months::new(1))
            .expect("date overflow"),
        // "weekly", and any other value validation already rejected.
        _ => cursor
            .checked_add_days(chrono::Days::new(7))
            .expect("date overflow"),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntry {
    pub entity: Entity,
    pub template_id: Option<String>,
    pub date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub cancelled: bool,
    pub location: Option<String>,
    pub description: Option<String>,
}

fn row_to_calendar_entry(row: &rusqlite::Row) -> rusqlite::Result<CalendarEntry> {
    Ok(CalendarEntry {
        entity: crate::db::entities::row_to_entity(row)?,
        template_id: row.get("template_id")?,
        date: row.get("date")?,
        start_time: row.get("start_time")?,
        end_time: row.get("end_time")?,
        all_day: row.get::<_, i64>("all_day")? != 0,
        cancelled: row.get::<_, i64>("cancelled")? != 0,
        location: row.get("location")?,
        description: row.get("description")?,
    })
}

fn validate_times(
    all_day: bool,
    start_time: &Option<String>,
    end_time: &Option<String>,
) -> AppResult<()> {
    if all_day {
        return Ok(());
    }
    match (start_time, end_time) {
        (Some(s), Some(e)) if s < e => Ok(()),
        (Some(_), Some(_)) => Err(AppError::InvalidInput(
            "a calendar entry has to end after it starts".into(),
        )),
        _ => Err(AppError::InvalidInput(
            "startTime and endTime are required unless allDay is true".into(),
        )),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntryTemplate {
    pub entity: Entity,
    pub recurrence: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub description: Option<String>,
    pub anchor_date: String,
}

fn row_to_template(row: &rusqlite::Row) -> rusqlite::Result<CalendarEntryTemplate> {
    Ok(CalendarEntryTemplate {
        entity: crate::db::entities::row_to_entity(row)?,
        recurrence: row.get("recurrence")?,
        start_time: row.get("start_time")?,
        end_time: row.get("end_time")?,
        all_day: row.get::<_, i64>("all_day")? != 0,
        location: row.get("location")?,
        description: row.get("description")?,
        anchor_date: row.get("anchor_date")?,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn create_calendar_entry_template(
    conn: &Connection,
    space_id: String,
    title: String,
    recurrence: String,
    start_time: Option<String>,
    end_time: Option<String>,
    all_day: bool,
    location: Option<String>,
    description: Option<String>,
    anchor_date: String,
) -> AppResult<Entity> {
    if !RECURRENCES.contains(&recurrence.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "recurrence must be one of {}",
            RECURRENCES.join(", ")
        )));
    }
    validate_times(all_day, &start_time, &end_time)?;
    let entity = crate::db::entities::create_entity(
        conn,
        space_id,
        "calendar_entry_template".into(),
        title,
        None,
    )?;
    conn.execute(
        "INSERT INTO calendar_entry_templates (entity_id, recurrence, start_time, end_time, all_day, location, description, anchor_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![entity.id, recurrence, start_time, end_time, all_day as i64, location, description, anchor_date],
    )?;
    Ok(entity)
}

/// Generates occurrences from the template's anchor date (its own first
/// occurrence) up to (and including) `until_date` on the template's own
/// cadence, skipping any date that already has one — same idempotency rule
/// as `sessions::generate_occurrences`.
pub fn generate_occurrences(
    conn: &Connection,
    template_id: &str,
    until_date: &str,
) -> AppResult<Vec<CalendarEntry>> {
    let template = get_calendar_entry_template(conn, template_id)?;
    let mut cursor = NaiveDate::parse_from_str(&template.anchor_date, "%Y-%m-%d")
        .map_err(|e| AppError::Db(format!("invalid anchor_date: {e}")))?;
    let until = NaiveDate::parse_from_str(until_date, "%Y-%m-%d")
        .map_err(|e| AppError::Db(format!("invalid until_date: {e}")))?;

    let mut created = Vec::new();
    while cursor <= until {
        let date_str = cursor.format("%Y-%m-%d").to_string();
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM calendar_entries WHERE template_id = ?1 AND date = ?2",
            params![template_id, date_str],
            |row| row.get(0),
        )?;
        if exists == 0 {
            let occurrence = create_occurrence(
                conn,
                &template.entity.space_id,
                &template.entity.title,
                Some(template_id.to_string()),
                date_str,
                template.start_time.clone(),
                template.end_time.clone(),
                template.all_day,
                template.location.clone(),
                template.description.clone(),
            )?;
            created.push(occurrence);
        }
        cursor = advance(cursor, &template.recurrence);
    }
    Ok(created)
}

#[allow(clippy::too_many_arguments)]
pub fn create_one_off_calendar_entry(
    conn: &Connection,
    space_id: String,
    title: String,
    date: String,
    start_time: Option<String>,
    end_time: Option<String>,
    all_day: bool,
    location: Option<String>,
    description: Option<String>,
) -> AppResult<CalendarEntry> {
    create_occurrence(
        conn,
        &space_id,
        &title,
        None,
        date,
        start_time,
        end_time,
        all_day,
        location,
        description,
    )
}

#[allow(clippy::too_many_arguments)]
fn create_occurrence(
    conn: &Connection,
    space_id: &str,
    title: &str,
    template_id: Option<String>,
    date: String,
    start_time: Option<String>,
    end_time: Option<String>,
    all_day: bool,
    location: Option<String>,
    description: Option<String>,
) -> AppResult<CalendarEntry> {
    validate_times(all_day, &start_time, &end_time)?;
    let entity = crate::db::entities::create_entity(
        conn,
        space_id.to_string(),
        "calendar_entry".into(),
        title.to_string(),
        None,
    )?;
    conn.execute(
        "INSERT INTO calendar_entries (entity_id, template_id, date, start_time, end_time, all_day, cancelled, location, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)",
        params![entity.id, template_id, date, start_time, end_time, all_day as i64, location, description],
    )?;
    Ok(CalendarEntry {
        entity,
        template_id,
        date,
        start_time,
        end_time,
        all_day,
        cancelled: false,
        location,
        description,
    })
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntryOverride {
    pub date: Option<String>,
    pub start_time: Option<Option<String>>,
    pub end_time: Option<Option<String>>,
    pub all_day: Option<bool>,
    pub cancelled: Option<bool>,
    pub location: Option<Option<String>>,
    pub description: Option<Option<String>>,
}

/// Materialized-occurrence overrides never retroactively affect the template,
/// exactly like `sessions::override_occurrence`.
pub fn override_occurrence(
    conn: &Connection,
    entity_id: &str,
    patch: CalendarEntryOverride,
) -> AppResult<CalendarEntry> {
    let mut occurrence = get_calendar_entry(conn, entity_id)?;

    if let Some(date) = patch.date {
        occurrence.date = date;
    }
    if let Some(start_time) = patch.start_time {
        occurrence.start_time = start_time;
    }
    if let Some(end_time) = patch.end_time {
        occurrence.end_time = end_time;
    }
    if let Some(all_day) = patch.all_day {
        occurrence.all_day = all_day;
    }
    if let Some(cancelled) = patch.cancelled {
        occurrence.cancelled = cancelled;
    }
    if let Some(location) = patch.location {
        occurrence.location = location;
    }
    if let Some(description) = patch.description {
        occurrence.description = description;
    }
    validate_times(
        occurrence.all_day,
        &occurrence.start_time,
        &occurrence.end_time,
    )?;

    conn.execute(
        "UPDATE calendar_entries SET date = ?1, start_time = ?2, end_time = ?3, all_day = ?4, cancelled = ?5, location = ?6, description = ?7 WHERE entity_id = ?8",
        params![
            occurrence.date,
            occurrence.start_time,
            occurrence.end_time,
            occurrence.all_day as i64,
            occurrence.cancelled as i64,
            occurrence.location,
            occurrence.description,
            entity_id
        ],
    )?;
    Ok(occurrence)
}

pub fn get_calendar_entry(conn: &Connection, entity_id: &str) -> AppResult<CalendarEntry> {
    conn.query_row(
        "SELECT e.*, a.* FROM entities e JOIN calendar_entries a ON a.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_calendar_entry,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("calendar entry {entity_id}")))
}

pub fn get_calendar_entry_template(
    conn: &Connection,
    entity_id: &str,
) -> AppResult<CalendarEntryTemplate> {
    conn.query_row(
        "SELECT e.*, t.recurrence, t.start_time, t.end_time, t.all_day, t.location, t.description, t.anchor_date
         FROM entities e JOIN calendar_entry_templates t ON t.entity_id = e.id WHERE e.id = ?1",
        params![entity_id],
        row_to_template,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("calendar entry template {entity_id}")))
}

pub fn list_calendar_entry_templates(
    conn: &Connection,
    space_id: &str,
) -> AppResult<Vec<CalendarEntryTemplate>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, t.recurrence, t.start_time, t.end_time, t.all_day, t.location, t.description, t.anchor_date
         FROM entities e JOIN calendar_entry_templates t ON t.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], row_to_template)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every calendar entry in `space_id`, or across every Space when `space_id`
/// is `None` — the same optional-filter shape `schema::EntitySchemaDef::list`
/// uses generically, so the unified cross-Space Calendar page and the
/// per-Space Calendar module view share one function.
pub fn list_calendar_entries(
    conn: &Connection,
    space_id: Option<&str>,
) -> AppResult<Vec<CalendarEntry>> {
    let mut sql = String::from(
        "SELECT e.*, a.* FROM entities e JOIN calendar_entries a ON a.entity_id = e.id
         WHERE e.deleted_at IS NULL",
    );
    if space_id.is_some() {
        sql.push_str(" AND e.space_id = ?1");
    }
    sql.push_str(" ORDER BY a.date ASC, a.start_time ASC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = match space_id {
        Some(sid) => stmt.query_map(params![sid], row_to_calendar_entry)?,
        None => stmt.query_map([], row_to_calendar_entry)?,
    };
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// A change to a recurring series. `None` leaves a field as it is.
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntrySeriesPatch {
    pub title: Option<String>,
    pub start_time: Option<Option<String>>,
    pub end_time: Option<Option<String>>,
    pub all_day: Option<bool>,
    pub location: Option<Option<String>>,
    pub description: Option<Option<String>>,
}

/// Edits a template and its occurrences from `from_date` on. An occurrence
/// only takes a new value where it still carries the template's old one, so
/// per-occurrence overrides survive — the same `keep_or` rule as
/// `sessions::update_session_series`.
pub fn update_calendar_entry_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
    patch: CalendarEntrySeriesPatch,
) -> AppResult<()> {
    let old = get_calendar_entry_template(conn, template_id)?;
    let all_day = patch.all_day.unwrap_or(old.all_day);
    let start_time = patch.start_time.unwrap_or_else(|| old.start_time.clone());
    let end_time = patch.end_time.unwrap_or_else(|| old.end_time.clone());
    let location = patch.location.unwrap_or_else(|| old.location.clone());
    let description = patch.description.unwrap_or_else(|| old.description.clone());
    validate_times(all_day, &start_time, &end_time)?;

    conn.execute(
        "UPDATE calendar_entry_templates SET start_time = ?1, end_time = ?2, all_day = ?3, location = ?4, description = ?5 WHERE entity_id = ?6",
        params![start_time, end_time, all_day as i64, location, description, template_id],
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
        "SELECT e.*, a.* FROM entities e JOIN calendar_entries a ON a.entity_id = e.id
         WHERE a.template_id = ?1 AND a.date >= ?2 AND e.deleted_at IS NULL",
    )?;
    let occurrences = stmt
        .query_map(params![template_id, from_date], row_to_calendar_entry)?
        .collect::<Result<Vec<_>, _>>()?;
    for occurrence in occurrences {
        let keep_or =
            |current: &Option<String>, previous: &Option<String>, next: &Option<String>| {
                if current == previous {
                    next.clone()
                } else {
                    current.clone()
                }
            };
        let new_start = keep_or(&occurrence.start_time, &old.start_time, &start_time);
        let new_end = keep_or(&occurrence.end_time, &old.end_time, &end_time);
        let new_all_day = if occurrence.all_day == old.all_day {
            all_day
        } else {
            occurrence.all_day
        };
        let new_location = if occurrence.location == old.location {
            location.clone()
        } else {
            occurrence.location.clone()
        };
        let new_description = if occurrence.description == old.description {
            description.clone()
        } else {
            occurrence.description.clone()
        };
        // An override that would end up invalid keeps its own times/all_day.
        let (new_start, new_end, new_all_day) =
            if validate_times(new_all_day, &new_start, &new_end).is_ok() {
                (new_start, new_end, new_all_day)
            } else {
                (
                    occurrence.start_time.clone(),
                    occurrence.end_time.clone(),
                    occurrence.all_day,
                )
            };
        conn.execute(
            "UPDATE calendar_entries SET start_time = ?1, end_time = ?2, all_day = ?3, location = ?4, description = ?5 WHERE entity_id = ?6",
            params![new_start, new_end, new_all_day as i64, new_location, new_description, occurrence.entity.id],
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
pub fn delete_calendar_entry_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
) -> AppResult<usize> {
    let ids: Vec<String> = conn
        .prepare(
            "SELECT e.id FROM entities e JOIN calendar_entries a ON a.entity_id = e.id
             WHERE a.template_id = ?1 AND a.date >= ?2 AND e.deleted_at IS NULL",
        )?
        .query_map(params![template_id, from_date], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    for id in &ids {
        crate::db::entities::soft_delete_entity(conn, id)?;
    }
    let remaining: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities e JOIN calendar_entries a ON a.entity_id = e.id
         WHERE a.template_id = ?1 AND e.deleted_at IS NULL",
        params![template_id],
        |row| row.get(0),
    )?;
    if remaining == 0 {
        crate::db::entities::soft_delete_entity(conn, template_id)?;
    }
    Ok(ids.len())
}

// --- CLI schema registration ------------------------------------------------

const CALENDAR_ENTRY_TEMPLATE_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "recurrence",
        kind: FieldKind::Enum(RECURRENCES),
        required_on_create: true,
        writable_on_update: false,
        description: "How this calendar entry repeats.",
    },
    FieldDef {
        name: "startTime",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour. Required unless allDay is true.",
    },
    FieldDef {
        name: "endTime",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour. Required unless allDay is true.",
    },
    FieldDef {
        name: "allDay",
        kind: FieldKind::Boolean,
        required_on_create: false,
        writable_on_update: true,
        description: "An all-day entry with no start/end time. Defaults to false.",
    },
    FieldDef {
        name: "location",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "Optional free-text location.",
    },
    FieldDef {
        name: "description",
        kind: FieldKind::LongText,
        required_on_create: false,
        writable_on_update: true,
        description: "Optional free-text description.",
    },
    FieldDef {
        name: "anchorDate",
        kind: FieldKind::Date,
        required_on_create: true,
        writable_on_update: false,
        description: "This template's own first occurrence date; later ones follow from it on the chosen cadence.",
    },
    FieldDef {
        name: "applyFromDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description: "On update only: the first occurrence date a startTime, endTime, allDay, location or \
                      description change reaches (default today). Earlier occurrences are never rewritten, \
                      and occurrences overridden on their own keep their override.",
    },
];

fn cli_create_calendar_entry_template(
    conn: &Connection,
    input: CreateInput,
) -> AppResult<serde_json::Value> {
    let recurrence = crate::db::schema::require_str(&input.fields, "recurrence")?;
    let start_time = crate::db::schema::field_str(&input.fields, "startTime");
    let end_time = crate::db::schema::field_str(&input.fields, "endTime");
    let all_day = crate::db::schema::field_bool(&input.fields, "allDay").unwrap_or(false);
    let location = crate::db::schema::field_str(&input.fields, "location");
    let description = crate::db::schema::field_str(&input.fields, "description");
    let anchor_date = crate::db::schema::require_str(&input.fields, "anchorDate")?;
    let entity = create_calendar_entry_template(
        conn,
        input.space_id,
        input.title,
        recurrence,
        start_time,
        end_time,
        all_day,
        location,
        description,
        anchor_date,
    )?;
    cli_get_calendar_entry_template(conn, &entity.id)
}

fn cli_update_calendar_entry_template(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    use crate::db::schema::field_str;
    let patch = CalendarEntrySeriesPatch {
        title: None,
        start_time: fields
            .contains_key("startTime")
            .then(|| field_str(fields, "startTime")),
        end_time: fields
            .contains_key("endTime")
            .then(|| field_str(fields, "endTime")),
        all_day: crate::db::schema::field_bool(fields, "allDay"),
        location: fields
            .contains_key("location")
            .then(|| field_str(fields, "location").filter(|l| !l.is_empty())),
        description: fields
            .contains_key("description")
            .then(|| field_str(fields, "description").filter(|d| !d.is_empty())),
    };
    if patch.start_time.is_some()
        || patch.end_time.is_some()
        || patch.all_day.is_some()
        || patch.location.is_some()
        || patch.description.is_some()
    {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let from = field_str(fields, "applyFromDate").unwrap_or(today);
        update_calendar_entry_series(conn, id, &from, patch)?;
    }
    cli_get_calendar_entry_template(conn, id)
}

fn cli_get_calendar_entry_template(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_calendar_entry_template(conn, id)?)
        .expect("CalendarEntryTemplate always serializes"))
}

fn cli_list_calendar_entry_templates(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("calendar_entry_template list requires --space <space-id>".into())
    })?;
    Ok(list_calendar_entry_templates(conn, space_id)?
        .into_iter()
        .map(|t| serde_json::to_value(t).expect("CalendarEntryTemplate always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "calendar_entry_template",
        supports_blocks: false,
        description: "A recurring personal calendar entry (daily/weekly/monthly). Use `calendar_entry` to \
                      create one-off occurrences (generating occurrences from a template is GUI-only for \
                      now). Updating startTime, endTime, allDay, location or description edits the series \
                      from applyFromDate on.",
        fields: CALENDAR_ENTRY_TEMPLATE_FIELDS,
        relationship_types: &["relates-to"],
        create: cli_create_calendar_entry_template,
        update: cli_update_calendar_entry_template,
        get: cli_get_calendar_entry_template,
        list: cli_list_calendar_entry_templates,
    }
}

const CALENDAR_ENTRY_FIELDS: &[FieldDef] = &[
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
        required_on_create: false,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour. Required unless allDay is true.",
    },
    FieldDef {
        name: "endTime",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "\"HH:MM\", 24-hour. Required unless allDay is true.",
    },
    FieldDef {
        name: "allDay",
        kind: FieldKind::Boolean,
        required_on_create: false,
        writable_on_update: true,
        description: "An all-day entry with no start/end time. Defaults to false.",
    },
    FieldDef {
        name: "location",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "Optional free-text location.",
    },
    FieldDef {
        name: "description",
        kind: FieldKind::LongText,
        required_on_create: false,
        writable_on_update: true,
        description: "Optional free-text description.",
    },
    FieldDef {
        name: "cancelled",
        kind: FieldKind::Boolean,
        required_on_create: false,
        writable_on_update: true,
        description: "Mark this occurrence cancelled without deleting it.",
    },
];

fn cli_create_calendar_entry(
    conn: &Connection,
    input: CreateInput,
) -> AppResult<serde_json::Value> {
    let date = crate::db::schema::require_str(&input.fields, "date")?;
    let start_time = crate::db::schema::field_str(&input.fields, "startTime");
    let end_time = crate::db::schema::field_str(&input.fields, "endTime");
    let all_day = crate::db::schema::field_bool(&input.fields, "allDay").unwrap_or(false);
    let location = crate::db::schema::field_str(&input.fields, "location");
    let description = crate::db::schema::field_str(&input.fields, "description");
    let occurrence = create_one_off_calendar_entry(
        conn,
        input.space_id,
        input.title,
        date,
        start_time,
        end_time,
        all_day,
        location,
        description,
    )?;
    Ok(serde_json::to_value(occurrence).expect("CalendarEntry always serializes"))
}

fn cli_update_calendar_entry(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let patch = CalendarEntryOverride {
        date: crate::db::schema::field_str(fields, "date"),
        start_time: fields
            .contains_key("startTime")
            .then(|| crate::db::schema::field_str(fields, "startTime")),
        end_time: fields
            .contains_key("endTime")
            .then(|| crate::db::schema::field_str(fields, "endTime")),
        all_day: crate::db::schema::field_bool(fields, "allDay"),
        cancelled: crate::db::schema::field_bool(fields, "cancelled"),
        location: fields
            .contains_key("location")
            .then(|| crate::db::schema::field_str(fields, "location")),
        description: fields
            .contains_key("description")
            .then(|| crate::db::schema::field_str(fields, "description")),
    };
    let occurrence = override_occurrence(conn, id, patch)?;
    Ok(serde_json::to_value(occurrence).expect("CalendarEntry always serializes"))
}

fn cli_get_calendar_entry(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_calendar_entry(conn, id)?)
        .expect("CalendarEntry always serializes"))
}

fn cli_list_calendar_entries(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("calendar_entry list requires --space <space-id>".into())
    })?;
    Ok(list_calendar_entries(conn, Some(space_id))?
        .into_iter()
        .map(|o| serde_json::to_value(o).expect("CalendarEntry always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "calendar_entry",
        supports_blocks: false,
        description: "A single, dated personal calendar occurrence — either one-off, or generated from a \
                      calendar_entry_template. Has no required parent, unlike a Session (which must have a Course).",
        fields: CALENDAR_ENTRY_FIELDS,
        relationship_types: &["relates-to"],
        create: cli_create_calendar_entry,
        update: cli_update_calendar_entry,
        get: cli_get_calendar_entry,
        list: cli_list_calendar_entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        conn
    }

    #[test]
    fn generate_occurrences_daily_and_monthly() {
        let conn = setup();
        let space = create_space(&conn, "Life".into(), None, "#000".into()).unwrap();

        let daily = create_calendar_entry_template(
            &conn,
            space.id.clone(),
            "Standup".into(),
            "daily".into(),
            Some("09:00".into()),
            Some("09:15".into()),
            false,
            None,
            None,
            "2026-01-05".into(),
        )
        .unwrap();
        let occurrences = generate_occurrences(&conn, &daily.id, "2026-01-08").unwrap();
        assert_eq!(occurrences.len(), 4);
        // Regenerating shouldn't duplicate.
        assert!(generate_occurrences(&conn, &daily.id, "2026-01-08")
            .unwrap()
            .is_empty());

        let monthly = create_calendar_entry_template(
            &conn,
            space.id.clone(),
            "Rent".into(),
            "monthly".into(),
            None,
            None,
            true,
            None,
            None,
            "2026-01-01".into(),
        )
        .unwrap();
        let occurrences = generate_occurrences(&conn, &monthly.id, "2026-04-01").unwrap();
        assert_eq!(
            occurrences
                .iter()
                .map(|o| o.date.clone())
                .collect::<Vec<_>>(),
            vec!["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]
        );
    }

    #[test]
    fn override_does_not_affect_template() {
        let conn = setup();
        let space = create_space(&conn, "Life".into(), None, "#000".into()).unwrap();
        let template = create_calendar_entry_template(
            &conn,
            space.id,
            "Gym".into(),
            "weekly".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            None,
            None,
            "2026-01-05".into(),
        )
        .unwrap();
        let occurrences = generate_occurrences(&conn, &template.id, "2026-01-05").unwrap();
        override_occurrence(
            &conn,
            &occurrences[0].entity.id,
            CalendarEntryOverride {
                cancelled: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let (recurrence,): (String,) = conn
            .query_row(
                "SELECT recurrence FROM calendar_entry_templates WHERE entity_id = ?1",
                params![template.id],
                |r| Ok((r.get(0)?,)),
            )
            .unwrap();
        assert_eq!(recurrence, "weekly");
    }

    #[test]
    fn series_update_skips_overridden_occurrences() {
        let conn = setup();
        let space = create_space(&conn, "Life".into(), None, "#000".into()).unwrap();
        let template = create_calendar_entry_template(
            &conn,
            space.id,
            "Gym".into(),
            "weekly".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            None,
            None,
            "2026-01-05".into(),
        )
        .unwrap();
        let occ = generate_occurrences(&conn, &template.id, "2026-01-19").unwrap();
        override_occurrence(
            &conn,
            &occ[1].entity.id,
            CalendarEntryOverride {
                start_time: Some(Some("06:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        update_calendar_entry_series(
            &conn,
            &template.id,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                start_time: Some(Some("07:30".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let get = |i: usize| get_calendar_entry(&conn, &occ[i].entity.id).unwrap();
        assert_eq!(get(0).start_time, Some("07:30".into()));
        // The overridden occurrence keeps its own time.
        assert_eq!(get(1).start_time, Some("06:00".into()));
        assert_eq!(get(2).start_time, Some("07:30".into()));
    }

    #[test]
    fn series_delete_trashes_following_then_the_template() {
        let conn = setup();
        let space = create_space(&conn, "Life".into(), None, "#000".into()).unwrap();
        let template = create_calendar_entry_template(
            &conn,
            space.id,
            "Gym".into(),
            "weekly".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            None,
            None,
            "2026-01-05".into(),
        )
        .unwrap();
        let occ = generate_occurrences(&conn, &template.id, "2026-01-19").unwrap();
        assert_eq!(
            delete_calendar_entry_series(&conn, &template.id, &occ[1].date).unwrap(),
            2
        );
        assert!(get_calendar_entry_template(&conn, &template.id)
            .unwrap()
            .entity
            .deleted_at
            .is_none());
        assert_eq!(
            delete_calendar_entry_series(&conn, &template.id, &occ[0].date).unwrap(),
            1
        );
        assert!(get_calendar_entry_template(&conn, &template.id)
            .unwrap()
            .entity
            .deleted_at
            .is_some());
    }

    #[test]
    fn one_off_entry_has_no_template() {
        let conn = setup();
        let space = create_space(&conn, "Life".into(), None, "#000".into()).unwrap();
        let entry = create_one_off_calendar_entry(
            &conn,
            space.id,
            "Dentist".into(),
            "2026-02-01".into(),
            Some("10:00".into()),
            Some("11:00".into()),
            false,
            Some("Downtown".into()),
            None,
        )
        .unwrap();
        assert!(entry.template_id.is_none());
        assert_eq!(entry.entity.entity_type, "calendar_entry");
    }

    #[test]
    fn all_day_requires_no_times_but_timed_does() {
        let conn = setup();
        let space = create_space(&conn, "Life".into(), None, "#000".into()).unwrap();
        assert!(create_one_off_calendar_entry(
            &conn,
            space.id.clone(),
            "Birthday".into(),
            "2026-03-01".into(),
            None,
            None,
            true,
            None,
            None,
        )
        .is_ok());
        assert!(create_one_off_calendar_entry(
            &conn,
            space.id,
            "Missing times".into(),
            "2026-03-01".into(),
            None,
            None,
            false,
            None,
            None,
        )
        .is_err());
    }
}
