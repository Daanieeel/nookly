//! Calendar entries: one-off or recurring personal calendar entries the user
//! adds directly in Nookly (module name: "Calendar"). Deliberately separate
//! from `sessions` (a Session must have a Course; a calendar entry never
//! does, and has no structural parent at all) and from `external_calendars`
//! (a read only overlay, never an entity). See
//! `docs/03-modules/sessions-timetable.md` for the Session pattern this
//! mirrors, and the calendar-module plan for why the two stay distinct.

use crate::db::common_fields;
use crate::db::entities::Entity;
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use chrono::{Months, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

const RECURRENCES: &[&str] = &["daily", "weekly", "monthly"];

/// The `n`th cadence date counted from the `anchor` (0 is the anchor itself), or
/// `None` past the last date chrono can represent. Every slot is computed from the
/// anchor, never from the previous slot, so a month-end anchor clamps in a short
/// month and comes back after it (Jan 31, Feb 28, Mar 31) instead of drifting.
fn nth_slot(anchor: NaiveDate, n: u32, recurrence: &str) -> Option<NaiveDate> {
    match recurrence {
        "daily" => anchor.checked_add_days(chrono::Days::new(u64::from(n))),
        "monthly" => anchor.checked_add_months(Months::new(n)),
        // "weekly", and any other value validation already rejected.
        _ => anchor.checked_add_days(chrono::Days::new(7 * u64::from(n))),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntry {
    pub entity: Entity,
    pub template_id: Option<String>,
    pub date: String,
    /// Set only for a multi-day entry (inclusive); `None` means a single day, `date` alone.
    pub end_date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub cancelled: bool,
    pub location: Option<String>,
    pub description: Option<String>,
    /// Which fields were overridden on this occurrence (`series::Field` bits).
    /// Internal bookkeeping for series edits, never serialized.
    #[serde(skip)]
    pub overridden_fields: i64,
}

fn row_to_calendar_entry(row: &rusqlite::Row) -> rusqlite::Result<CalendarEntry> {
    Ok(CalendarEntry {
        entity: crate::db::entities::row_to_entity(row)?,
        template_id: row.get("template_id")?,
        date: row.get("date")?,
        end_date: row.get("end_date")?,
        start_time: row.get("start_time")?,
        end_time: row.get("end_time")?,
        all_day: row.get::<_, i64>("all_day")? != 0,
        cancelled: row.get::<_, i64>("cancelled")? != 0,
        location: row.get("location")?,
        description: row.get("description")?,
        overridden_fields: row.get("overridden_fields")?,
    })
}

/// Rejects a multi-day entry (dragged from one day column to a later one)
/// whose `end_date` comes before its `date` — plain string comparison is
/// correct here since both are ISO `YYYY-MM-DD`.
fn validate_date_range(date: &str, end_date: &Option<String>) -> AppResult<()> {
    match end_date {
        Some(end) if end.as_str() < date => Err(AppError::InvalidInput(
            "a calendar entry can't end before it starts".into(),
        )),
        _ => Ok(()),
    }
}

fn validate_times(
    all_day: bool,
    start_time: &Option<String>,
    end_time: &Option<String>,
) -> AppResult<()> {
    crate::db::series::validate_times(
        "a calendar entry",
        all_day,
        start_time.as_deref(),
        end_time.as_deref(),
    )
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
    crate::db::series::validate_date("anchorDate", &anchor_date)?;
    crate::db::atomically(conn, || {
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
    })
}

/// Generates occurrences from the template's anchor date (its own first
/// occurrence) up to (and including) `until_date` on the template's own
/// cadence. Slots it already filled are never filled again, even when their
/// occurrence was moved, cancelled or trashed (`series::slots_to_generate`,
/// shared with `sessions::generate_occurrences`).
pub fn generate_occurrences(
    conn: &Connection,
    template_id: &str,
    until_date: &str,
) -> AppResult<Vec<CalendarEntry>> {
    let template = get_calendar_entry_template(conn, template_id)?;
    let anchor = NaiveDate::parse_from_str(&template.anchor_date, "%Y-%m-%d")
        .map_err(|e| AppError::Db(format!("invalid anchor_date: {e}")))?;
    let until = NaiveDate::parse_from_str(until_date, "%Y-%m-%d")
        .map_err(|e| AppError::InvalidInput(format!("invalid until_date: {e}")))?;

    let mut slots = Vec::new();
    for n in 0.. {
        let Some(date) = nth_slot(anchor, n, &template.recurrence).filter(|d| *d <= until) else {
            break;
        };
        slots.push(date.format("%Y-%m-%d").to_string());
    }

    let dates = crate::db::series::slots_to_generate::<CalendarEntry>(conn, template_id, slots)?;
    crate::db::atomically(conn, || {
        let mut created = Vec::new();
        for date in dates {
            let occurrence = create_occurrence(
                conn,
                &template.entity.space_id,
                &template.entity.title,
                Some(template_id.to_string()),
                date,
                // A template always generates single-day occurrences — a
                // multi-day span is only ever picked for one specific
                // one-off entry, never a recurring cadence.
                None,
                template.start_time.clone(),
                template.end_time.clone(),
                template.all_day,
                template.location.clone(),
                template.description.clone(),
            )?;
            crate::db::series::record_slot(conn, template_id, &occurrence.date)?;
            created.push(occurrence);
        }
        Ok(created)
    })
}

#[allow(clippy::too_many_arguments)]
pub fn create_one_off_calendar_entry(
    conn: &Connection,
    space_id: String,
    title: String,
    date: String,
    end_date: Option<String>,
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
        end_date,
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
    end_date: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    all_day: bool,
    location: Option<String>,
    description: Option<String>,
) -> AppResult<CalendarEntry> {
    validate_times(all_day, &start_time, &end_time)?;
    validate_date_range(&date, &end_date)?;
    let entity = crate::db::entities::create_entity(
        conn,
        space_id.to_string(),
        "calendar_entry".into(),
        title.to_string(),
        None,
    )?;
    conn.execute(
        "INSERT INTO calendar_entries (entity_id, template_id, date, end_date, start_time, end_time, all_day, cancelled, location, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)",
        params![entity.id, template_id, date, end_date, start_time, end_time, all_day as i64, location, description],
    )?;
    Ok(CalendarEntry {
        entity,
        template_id,
        date,
        end_date,
        start_time,
        end_time,
        all_day,
        cancelled: false,
        location,
        description,
        overridden_fields: 0,
    })
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntryOverride {
    pub date: Option<String>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub end_date: Option<Option<String>>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub start_time: Option<Option<String>>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub end_time: Option<Option<String>>,
    pub all_day: Option<bool>,
    pub cancelled: Option<bool>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub location: Option<Option<String>>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub description: Option<Option<String>>,
}

/// Materialized-occurrence overrides never retroactively affect the template,
/// exactly like `sessions::override_occurrence`.
pub fn override_occurrence(
    conn: &Connection,
    entity_id: &str,
    patch: CalendarEntryOverride,
) -> AppResult<CalendarEntry> {
    use crate::db::series::{mark_override, Field};
    let mut occurrence = get_calendar_entry(conn, entity_id)?;
    let mut overridden = occurrence.overridden_fields;
    // What the series holds, so setting a field back to it ends its override.
    let series = match &occurrence.template_id {
        Some(tid) => get_calendar_entry_template(conn, tid).ok(),
        None => None,
    };
    let series = series.as_ref();
    let times_changed =
        patch.start_time.is_some() || patch.end_time.is_some() || patch.all_day.is_some();

    if let Some(date) = patch.date {
        occurrence.date = date;
    }
    if let Some(end_date) = patch.end_date {
        occurrence.end_date = end_date;
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
    if let Some(all_day) = patch.all_day {
        mark_override(
            &mut overridden,
            Field::AllDay,
            &occurrence.all_day,
            &all_day,
            series.map(|t| &t.all_day),
        );
        occurrence.all_day = all_day;
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
    if let Some(description) = patch.description {
        mark_override(
            &mut overridden,
            Field::Description,
            &occurrence.description,
            &description,
            series.map(|t| &t.description),
        );
        occurrence.description = description;
    }
    occurrence.overridden_fields = overridden;
    // Only a change to the times is checked, like `sessions::override_occurrence`,
    // so an entry stored with odd times before the HH:MM check existed can
    // still be moved, cancelled or annotated.
    if times_changed {
        validate_times(
            occurrence.all_day,
            &occurrence.start_time,
            &occurrence.end_time,
        )?;
    }
    validate_date_range(&occurrence.date, &occurrence.end_date)?;

    conn.execute(
        "UPDATE calendar_entries SET date = ?1, end_date = ?2, start_time = ?3, end_time = ?4, all_day = ?5, cancelled = ?6, location = ?7, description = ?8, overridden_fields = ?9 WHERE entity_id = ?10",
        params![
            occurrence.date,
            occurrence.end_date,
            occurrence.start_time,
            occurrence.end_time,
            occurrence.all_day as i64,
            occurrence.cancelled as i64,
            occurrence.location,
            occurrence.description,
            occurrence.overridden_fields,
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

/// A change to a recurring series. `None` (an absent key) leaves a field as it
/// is; `Some(None)` (`null`) clears it.
#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntrySeriesPatch {
    pub title: Option<String>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub start_time: Option<Option<String>>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub end_time: Option<Option<String>>,
    pub all_day: Option<bool>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub location: Option<Option<String>>,
    #[serde(default, deserialize_with = "crate::db::series::double_option")]
    pub description: Option<Option<String>>,
}

/// Edits a template and its occurrences from `from_date` on. A field the user
/// overrode on one occurrence keeps that value (`series::series_value`, the
/// same rule as `sessions::update_session_series`); every other field follows.
pub fn update_calendar_entry_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
    patch: CalendarEntrySeriesPatch,
) -> AppResult<()> {
    update_calendar_entry_series_anchored(conn, template_id, from_date, None, patch)
}

/// `update_calendar_entry_series`, opened on the occurrence `anchor_id`: when
/// it is dated `from_date` or later it takes every patched field, even one it
/// overrode on its own before, and those fields stop counting as overridden.
/// Later occurrences keep their own overrides as usual.
pub fn update_calendar_entry_series_anchored(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
    anchor_id: Option<&str>,
    patch: CalendarEntrySeriesPatch,
) -> AppResult<()> {
    let old = get_calendar_entry_template(conn, template_id)?;
    let patched_start = patch.start_time.is_some();
    let patched_end = patch.end_time.is_some();
    let patched_all_day = patch.all_day.is_some();
    let patched_location = patch.location.is_some();
    let patched_description = patch.description.is_some();
    let all_day = patch.all_day.unwrap_or(old.all_day);
    let start_time = patch.start_time.unwrap_or_else(|| old.start_time.clone());
    let end_time = patch.end_time.unwrap_or_else(|| old.end_time.clone());
    let location = patch.location.unwrap_or_else(|| old.location.clone());
    let description = patch.description.unwrap_or_else(|| old.description.clone());
    validate_times(all_day, &start_time, &end_time)?;

    crate::db::atomically(conn, || {
        conn.execute(
        "UPDATE calendar_entry_templates SET start_time = ?1, end_time = ?2, all_day = ?3, location = ?4, description = ?5 WHERE entity_id = ?6",
        params![start_time, end_time, all_day as i64, location, description, template_id],
    )?;
        crate::db::series::update_series::<CalendarEntry>(
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
                let value = |patched: bool,
                             field: Field,
                             cur: &Option<String>,
                             prev: &Option<String>,
                             next: &Option<String>| {
                    if is_anchor && patched {
                        next.clone()
                    } else {
                        series_value(o, field, cur, prev, next)
                    }
                };
                let new_start = value(
                    patched_start,
                    Field::StartTime,
                    &o.start_time,
                    &old.start_time,
                    &start_time,
                );
                let new_end = value(
                    patched_end,
                    Field::EndTime,
                    &o.end_time,
                    &old.end_time,
                    &end_time,
                );
                let new_all_day = if is_anchor && patched_all_day {
                    all_day
                } else {
                    series_value(o, Field::AllDay, &o.all_day, &old.all_day, &all_day)
                };
                let new_location = value(
                    patched_location,
                    Field::Location,
                    &o.location,
                    &old.location,
                    &location,
                );
                let new_description = value(
                    patched_description,
                    Field::Description,
                    &o.description,
                    &old.description,
                    &description,
                );
                // An override that would end up invalid keeps its own times/all_day;
                // the anchor takes the series' instead, which are valid.
                let times_fit = validate_times(new_all_day, &new_start, &new_end).is_ok();
                let (new_start, new_end, new_all_day) = if times_fit {
                    (new_start, new_end, new_all_day)
                } else if is_anchor {
                    (start_time.clone(), end_time.clone(), all_day)
                } else {
                    (o.start_time.clone(), o.end_time.clone(), o.all_day)
                };
                let mut mask = o.overridden_fields;
                if is_anchor {
                    let reset = !times_fit;
                    if patched_start || reset {
                        sync_override(&mut mask, Field::StartTime, &new_start, &start_time);
                    }
                    if patched_end || reset {
                        sync_override(&mut mask, Field::EndTime, &new_end, &end_time);
                    }
                    if patched_all_day || reset {
                        sync_override(&mut mask, Field::AllDay, &new_all_day, &all_day);
                    }
                    if patched_location {
                        sync_override(&mut mask, Field::Location, &new_location, &location);
                    }
                    if patched_description {
                        sync_override(
                            &mut mask,
                            Field::Description,
                            &new_description,
                            &description,
                        );
                    }
                }
                conn.execute(
                "UPDATE calendar_entries SET start_time = ?1, end_time = ?2, all_day = ?3, location = ?4, description = ?5, overridden_fields = ?6 WHERE entity_id = ?7",
                params![new_start, new_end, new_all_day as i64, new_location, new_description, mask, o.entity.id],
            )?;
                Ok(())
            },
        )
    })
}

impl crate::db::series::SeriesOccurrence for CalendarEntry {
    const TABLE: &'static str = "calendar_entries";
    const TEMPLATE_TABLE: &'static str = "calendar_entry_templates";
    const ALIAS: &'static str = "a";

    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        row_to_calendar_entry(row)
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
pub fn delete_calendar_entry_series(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
) -> AppResult<usize> {
    crate::db::series::delete_series::<CalendarEntry>(conn, template_id, from_date)
}

// --- CLI schema registration ------------------------------------------------

const FIELD_START_TIME: FieldDef = FieldDef {
    name: "startTime",
    kind: FieldKind::Text,
    required_on_create: false,
    writable_on_update: true,
    description: "\"HH:MM\", 24-hour. Leave out both times for an all-day entry.",
};

const FIELD_END_TIME: FieldDef = FieldDef {
    name: "endTime",
    kind: FieldKind::Text,
    required_on_create: false,
    writable_on_update: true,
    description: "\"HH:MM\", 24-hour. Leave out both times for an all-day entry.",
};

const FIELD_ALL_DAY: FieldDef = FieldDef {
    name: "allDay",
    kind: FieldKind::Boolean,
    required_on_create: false,
    writable_on_update: true,
    description: "An all-day entry with no start/end time. Defaults to true when no times are given, otherwise false.",
};

const FIELD_DESCRIPTION: FieldDef = FieldDef {
    name: "description",
    kind: FieldKind::LongText,
    required_on_create: false,
    writable_on_update: true,
    description: "Optional free-text description.",
};

const CALENDAR_ENTRY_TEMPLATE_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "recurrence",
        kind: FieldKind::Enum(RECURRENCES),
        required_on_create: true,
        writable_on_update: false,
        description: "How this calendar entry repeats.",
    },
    FIELD_START_TIME,
    FIELD_END_TIME,
    FIELD_ALL_DAY,
    common_fields::FIELD_LOCATION,
    FIELD_DESCRIPTION,
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
    // No times at all means an all-day entry, unless `allDay=false` says otherwise.
    let all_day = crate::db::schema::field_bool(&input.fields, "allDay")
        .unwrap_or(start_time.is_none() && end_time.is_none());
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
    crate::error::to_json(get_calendar_entry_template(conn, id)?)
}

fn cli_list_calendar_entry_templates(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("calendar_entry_template list requires --space <space-id>".into())
    })?;
    list_calendar_entry_templates(conn, space_id)?
        .into_iter()
        .map(crate::error::to_json)
        .collect::<crate::error::AppResult<Vec<_>>>()
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
    common_fields::FIELD_DATE,
    FieldDef {
        name: "endDate",
        kind: FieldKind::Date,
        required_on_create: false,
        writable_on_update: true,
        description: "Optional ISO end date (inclusive) for a multi-day entry. Omit for a single day, \"date\" alone.",
    },
    FIELD_START_TIME,
    FIELD_END_TIME,
    FIELD_ALL_DAY,
    common_fields::FIELD_LOCATION,
    FIELD_DESCRIPTION,
    common_fields::FIELD_CANCELLED,
];

fn cli_create_calendar_entry(
    conn: &Connection,
    input: CreateInput,
) -> AppResult<serde_json::Value> {
    let date = crate::db::schema::require_str(&input.fields, "date")?;
    let end_date = crate::db::schema::field_str(&input.fields, "endDate");
    let start_time = crate::db::schema::field_str(&input.fields, "startTime");
    let end_time = crate::db::schema::field_str(&input.fields, "endTime");
    // No times at all means an all-day entry, unless `allDay=false` says otherwise.
    let all_day = crate::db::schema::field_bool(&input.fields, "allDay")
        .unwrap_or(start_time.is_none() && end_time.is_none());
    let location = crate::db::schema::field_str(&input.fields, "location");
    let description = crate::db::schema::field_str(&input.fields, "description");
    let occurrence = create_one_off_calendar_entry(
        conn,
        input.space_id,
        input.title,
        date,
        end_date,
        start_time,
        end_time,
        all_day,
        location,
        description,
    )?;
    crate::error::to_json(occurrence)
}

fn cli_update_calendar_entry(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let patch = CalendarEntryOverride {
        date: crate::db::schema::field_str(fields, "date"),
        end_date: fields
            .contains_key("endDate")
            .then(|| crate::db::schema::field_str(fields, "endDate")),
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
    crate::error::to_json(occurrence)
}

fn cli_get_calendar_entry(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    crate::error::to_json(get_calendar_entry(conn, id)?)
}

fn cli_list_calendar_entries(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("calendar_entry list requires --space <space-id>".into())
    })?;
    list_calendar_entries(conn, Some(space_id))?
        .into_iter()
        .map(crate::error::to_json)
        .collect::<crate::error::AppResult<Vec<_>>>()
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
mod tests;

#[cfg(test)]
mod property_tests;
