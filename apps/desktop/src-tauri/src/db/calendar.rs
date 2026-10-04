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
    Ok(serde_json::to_value(occurrence).expect("CalendarEntry always serializes"))
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

    fn setup() -> Connection {
        crate::db::test_conn()
    }

    fn weekly_gym(conn: &Connection, space_id: String) -> Entity {
        create_calendar_entry_template(
            conn,
            space_id,
            "Gym".into(),
            "weekly".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            None,
            None,
            "2026-01-05".into(),
        )
        .unwrap()
    }

    #[test]
    fn generate_occurrences_daily_and_monthly() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");

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
        let space = crate::db::test_space(&conn, "Life");
        let template = weekly_gym(&conn, space.id);
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
        let space = crate::db::test_space(&conn, "Life");
        let template = weekly_gym(&conn, space.id);
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
        let space = crate::db::test_space(&conn, "Life");
        let template = weekly_gym(&conn, space.id);
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
        let space = crate::db::test_space(&conn, "Life");
        let entry = create_one_off_calendar_entry(
            &conn,
            space.id,
            "Dentist".into(),
            "2026-02-01".into(),
            None,
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
        let space = crate::db::test_space(&conn, "Life");
        assert!(create_one_off_calendar_entry(
            &conn,
            space.id.clone(),
            "Birthday".into(),
            "2026-03-01".into(),
            None,
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
            None,
            false,
            None,
            None,
        )
        .is_err());
    }

    #[test]
    fn multi_day_entry_spans_end_date() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
        let entry = create_one_off_calendar_entry(
            &conn,
            space.id.clone(),
            "Road trip".into(),
            "2026-04-06".into(),
            Some("2026-04-08".into()),
            Some("12:00".into()),
            Some("15:00".into()),
            false,
            None,
            None,
        )
        .unwrap();
        assert_eq!(entry.end_date.as_deref(), Some("2026-04-08"));

        assert!(create_one_off_calendar_entry(
            &conn,
            space.id,
            "Backwards".into(),
            "2026-04-06".into(),
            Some("2026-04-01".into()),
            Some("12:00".into()),
            Some("15:00".into()),
            false,
            None,
            None,
        )
        .is_err());
    }

    // --- Characterization tests: recurring series logic -------------------
    // Pin the CURRENT behavior so a later refactor (shared series module with
    // `sessions`) can be verified. Mirrored by tests in `sessions.rs`.

    type Snap = (
        String,
        String,
        Option<String>,
        Option<String>,
        bool,
        Option<String>,
        Option<String>,
        bool,
    );

    /// Every row of a template (trashed included), ordered by date.
    fn snapshot(conn: &Connection, template_id: &str) -> Vec<Snap> {
        let mut stmt = conn
            .prepare(
                "SELECT e.id FROM entities e JOIN calendar_entries a ON a.entity_id = e.id
                 WHERE a.template_id = ?1 ORDER BY a.date ASC",
            )
            .unwrap();
        let ids: Vec<String> = stmt
            .query_map(params![template_id], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        ids.iter()
            .map(|id| {
                let o = get_calendar_entry(conn, id).unwrap();
                (
                    o.date,
                    o.entity.title,
                    o.start_time,
                    o.end_time,
                    o.all_day,
                    o.location,
                    o.description,
                    o.cancelled,
                )
            })
            .collect()
    }

    fn row_count(conn: &Connection, template_id: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM calendar_entries WHERE template_id = ?1",
            params![template_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn trashed(conn: &Connection, id: &str) -> bool {
        get_calendar_entry(conn, id)
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

    /// Weekly Monday gym with location and description, occurrences
    /// 01-05, 01-12, 01-19, 01-26 (07:00 to 08:00).
    fn series(conn: &Connection) -> (String, String, Vec<CalendarEntry>) {
        let space = crate::db::test_space(conn, "Life");
        let template = create_calendar_entry_template(
            conn,
            space.id.clone(),
            "Gym".into(),
            "weekly".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            Some("Room 1".into()),
            Some("Bring towel".into()),
            "2026-01-05".into(),
        )
        .unwrap();
        let occ = generate_occurrences(conn, &template.id, "2026-01-26").unwrap();
        (space.id, template.id, occ)
    }

    fn ov(date: &str) -> CalendarEntryOverride {
        CalendarEntryOverride {
            date: Some(date.into()),
            ..Default::default()
        }
    }

    #[test]
    fn series_update_from_date_changes_only_later_occurrences() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        let before = snapshot(&conn, &tid);
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[2].date,
            CalendarEntrySeriesPatch {
                title: Some("Gym II".into()),
                start_time: Some(Some("08:00".into())),
                end_time: Some(Some("09:00".into())),
                location: Some(Some("Studio".into())),
                description: Some(Some("Bring water".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let after = snapshot(&conn, &tid);
        assert_eq!(after[0], before[0]);
        assert_eq!(after[1], before[1]);
        for row in &after[2..] {
            assert_eq!(row.1, "Gym II");
            assert_eq!(row.2.as_deref(), Some("08:00"));
            assert_eq!(row.3.as_deref(), Some("09:00"));
            assert_eq!(row.5.as_deref(), Some("Studio"));
            assert_eq!(row.6.as_deref(), Some("Bring water"));
        }
        let t = get_calendar_entry_template(&conn, &tid).unwrap();
        assert_eq!(t.entity.title, "Gym II");
        assert_eq!(t.start_time.as_deref(), Some("08:00"));
        assert_eq!(t.end_time.as_deref(), Some("09:00"));
        assert_eq!(t.location.as_deref(), Some("Studio"));
        assert_eq!(t.description.as_deref(), Some("Bring water"));
        // Recurrence and anchor never change.
        assert_eq!(t.recurrence, "weekly");
        assert_eq!(t.anchor_date, "2026-01-05");
    }

    #[test]
    fn series_update_title_only_reaches_occurrences_with_the_old_title() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        set_title(&conn, &occ[2].entity.id, "Leg day");
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[1].date,
            CalendarEntrySeriesPatch {
                title: Some("Gym II".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let titles: Vec<String> = snapshot(&conn, &tid).into_iter().map(|r| r.1).collect();
        assert_eq!(titles, vec!["Gym", "Gym II", "Leg day", "Gym II"]);
        assert_eq!(
            get_calendar_entry_template(&conn, &tid)
                .unwrap()
                .entity
                .title,
            "Gym II"
        );
        // A second rename compares against the template's now current title.
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                title: Some("Gym III".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let titles: Vec<String> = snapshot(&conn, &tid).into_iter().map(|r| r.1).collect();
        // Intended: occ[0] was never individually edited (it only kept the older series
        // title "Gym"), so a rename starting at occ[0] must reach it too.
        assert_eq!(titles, vec!["Gym III", "Gym III", "Leg day", "Gym III"]);
    }

    #[test]
    fn series_update_same_title_is_a_noop_for_titles() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                title: Some("Gym".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let titles: Vec<String> = snapshot(&conn, &tid).into_iter().map(|r| r.1).collect();
        assert_eq!(titles, vec!["Gym"; 4]);
    }

    #[test]
    fn series_update_empty_patch_changes_nothing() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(
            &conn,
            &occ[1].entity.id,
            CalendarEntryOverride {
                cancelled: Some(true),
                location: Some(Some("Elsewhere".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let before = snapshot(&conn, &tid);
        let template_before = get_calendar_entry_template(&conn, &tid).unwrap();
        assert!(update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch::default()
        )
        .is_ok());
        assert_eq!(snapshot(&conn, &tid), before);
        let t = get_calendar_entry_template(&conn, &tid).unwrap();
        assert_eq!(t.start_time, template_before.start_time);
        assert_eq!(t.end_time, template_before.end_time);
        assert_eq!(t.location, template_before.location);
        assert_eq!(t.description, template_before.description);
        assert_eq!(t.entity.title, template_before.entity.title);
    }

    #[test]
    fn series_update_from_date_before_first_reaches_all_after_last_reaches_none() {
        let conn = setup();
        let (_, tid, _) = series(&conn);
        update_calendar_entry_series(
            &conn,
            &tid,
            "2025-01-01",
            CalendarEntrySeriesPatch {
                start_time: Some(Some("06:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(snapshot(&conn, &tid)
            .iter()
            .all(|r| r.2.as_deref() == Some("06:00")));

        update_calendar_entry_series(
            &conn,
            &tid,
            "2027-01-01",
            CalendarEntrySeriesPatch {
                title: Some("Renamed".into()),
                start_time: Some(Some("05:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &tid);
        assert!(rows.iter().all(|r| r.2.as_deref() == Some("06:00")));
        assert!(rows.iter().all(|r| r.1 == "Gym"));
        // The template itself is updated regardless of from_date.
        let t = get_calendar_entry_template(&conn, &tid).unwrap();
        assert_eq!(t.start_time.as_deref(), Some("05:00"));
        assert_eq!(t.entity.title, "Renamed");
    }

    #[test]
    fn series_update_from_date_is_inclusive_and_by_string_date() {
        let conn = setup();
        let (_, tid, _) = series(&conn);
        // The day after the 2nd occurrence: only the 3rd and 4th change.
        update_calendar_entry_series(
            &conn,
            &tid,
            "2026-01-13",
            CalendarEntrySeriesPatch {
                start_time: Some(Some("07:30".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let starts: Vec<_> = snapshot(&conn, &tid).into_iter().map(|r| r.2).collect();
        assert_eq!(
            starts,
            vec![
                Some("07:00".to_string()),
                Some("07:00".into()),
                Some("07:30".into()),
                Some("07:30".into())
            ]
        );
    }

    #[test]
    fn series_update_unknown_template_is_not_found() {
        let conn = setup();
        let err = update_calendar_entry_series(
            &conn,
            "nope",
            "2026-01-01",
            CalendarEntrySeriesPatch::default(),
        )
        .unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
        // A session template id is not a calendar template either.
        let (_, tid, _) = series(&conn);
        let entry = create_one_off_calendar_entry(
            &conn,
            crate::db::spaces::list_spaces(&conn).unwrap()[0].id.clone(),
            "One".into(),
            "2026-02-01".into(),
            None,
            None,
            None,
            true,
            None,
            None,
        )
        .unwrap();
        assert!(update_calendar_entry_series(
            &conn,
            &entry.entity.id,
            "2026-01-01",
            CalendarEntrySeriesPatch::default()
        )
        .is_err());
        assert!(get_calendar_entry_template(&conn, &tid).is_ok());
    }

    #[test]
    fn series_update_invalid_times_error_and_leave_everything_untouched() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        let before = snapshot(&conn, &tid);
        let err = update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                title: Some("Changed".into()),
                end_time: Some(Some("06:30".into())),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
        // Clearing a time on a timed series is rejected too.
        assert!(update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                start_time: Some(None),
                ..Default::default()
            }
        )
        .is_err());
        assert_eq!(snapshot(&conn, &tid), before);
        let t = get_calendar_entry_template(&conn, &tid).unwrap();
        assert_eq!(t.entity.title, "Gym");
        assert_eq!(t.end_time.as_deref(), Some("08:00"));
    }

    #[test]
    fn series_update_keeps_overridden_fields_but_updates_the_rest() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(
            &conn,
            &occ[1].entity.id,
            CalendarEntryOverride {
                location: Some(Some("Hall".into())),
                description: Some(Some("Custom".into())),
                ..Default::default()
            },
        )
        .unwrap();
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                start_time: Some(Some("06:00".into())),
                location: Some(Some("Studio".into())),
                description: Some(Some("New".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &tid);
        assert_eq!(rows[1].2.as_deref(), Some("06:00"));
        assert_eq!(rows[1].5.as_deref(), Some("Hall"));
        assert_eq!(rows[1].6.as_deref(), Some("Custom"));
        assert_eq!(rows[0].5.as_deref(), Some("Studio"));
        assert_eq!(rows[0].6.as_deref(), Some("New"));
    }

    #[test]
    fn series_update_can_clear_location_and_description() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                location: Some(None),
                description: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        for row in snapshot(&conn, &tid) {
            assert_eq!((row.5, row.6), (None, None));
        }
        let t = get_calendar_entry_template(&conn, &tid).unwrap();
        assert_eq!((t.location, t.description), (None, None));
    }

    #[test]
    fn series_update_overrides_that_become_invalid_keep_their_own_times() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(
            &conn,
            &occ[1].entity.id,
            CalendarEntryOverride {
                end_time: Some(Some("07:30".into())),
                ..Default::default()
            },
        )
        .unwrap();
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                start_time: Some(Some("07:45".into())),
                location: Some(Some("Studio".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &tid);
        assert_eq!(rows[0].2.as_deref(), Some("07:45"));
        // 07:45 to 07:30 would be invalid, so both times stay; location still follows.
        assert_eq!(rows[1].2.as_deref(), Some("07:00"));
        assert_eq!(rows[1].3.as_deref(), Some("07:30"));
        assert_eq!(rows[1].5.as_deref(), Some("Studio"));
    }

    #[test]
    fn series_update_reaches_cancelled_and_skips_trashed_occurrences() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(
            &conn,
            &occ[1].entity.id,
            CalendarEntryOverride {
                cancelled: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        crate::db::entities::soft_delete_entity(&conn, &occ[2].entity.id).unwrap();
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                title: Some("Gym II".into()),
                start_time: Some(Some("06:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &tid);
        assert_eq!((rows[1].2.as_deref(), rows[1].7), (Some("06:00"), true));
        assert_eq!(rows[1].1, "Gym II");
        // The trashed one is left exactly as it was.
        assert_eq!(rows[2].2.as_deref(), Some("07:00"));
        assert_eq!(rows[2].1, "Gym");
        assert!(trashed(&conn, &occ[2].entity.id));
    }

    #[test]
    fn series_update_judges_moved_occurrences_by_their_current_date() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        // The last one moved before from_date, the first moved after it.
        override_occurrence(&conn, &occ[3].entity.id, ov("2026-01-06")).unwrap();
        override_occurrence(&conn, &occ[0].entity.id, ov("2026-02-02")).unwrap();
        update_calendar_entry_series(
            &conn,
            &tid,
            "2026-01-19",
            CalendarEntrySeriesPatch {
                start_time: Some(Some("06:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let get = |i: usize| get_calendar_entry(&conn, &occ[i].entity.id).unwrap();
        assert_eq!(get(3).start_time.as_deref(), Some("07:00"));
        assert_eq!(get(0).start_time.as_deref(), Some("06:00"));
        assert_eq!(get(1).start_time.as_deref(), Some("07:00"));
        assert_eq!(get(2).start_time.as_deref(), Some("06:00"));
    }

    #[test]
    fn series_update_all_day_conversions() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        // One occurrence already overridden to all day keeps that.
        override_occurrence(
            &conn,
            &occ[1].entity.id,
            CalendarEntryOverride {
                all_day: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                start_time: Some(Some("06:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &tid);
        assert!(rows[1].4);
        assert_eq!(rows[1].2.as_deref(), Some("06:00"));

        // Timed series turned all-day: times cleared where they followed the series.
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[2].date,
            CalendarEntrySeriesPatch {
                all_day: Some(true),
                start_time: Some(None),
                end_time: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &tid);
        assert_eq!(
            (rows[2].4, rows[2].2.clone(), rows[2].3.clone()),
            (true, None, None)
        );
        assert_eq!(
            (rows[3].4, rows[3].2.clone(), rows[3].3.clone()),
            (true, None, None)
        );
        assert!(!rows[0].4);
        assert!(get_calendar_entry_template(&conn, &tid).unwrap().all_day);

        // An all-day series can become timed.
        let space = crate::db::test_space(&conn, "Other");
        let rent = create_calendar_entry_template(
            &conn,
            space.id,
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
        generate_occurrences(&conn, &rent.id, "2026-03-01").unwrap();
        update_calendar_entry_series(
            &conn,
            &rent.id,
            "2026-02-01",
            CalendarEntrySeriesPatch {
                all_day: Some(false),
                start_time: Some(Some("09:00".into())),
                end_time: Some(Some("10:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &rent.id);
        assert!(rows[0].4 && rows[0].2.is_none());
        assert!(!rows[1].4 && rows[1].2.as_deref() == Some("09:00"));
        assert!(!rows[2].4 && rows[2].3.as_deref() == Some("10:00"));
        // An all-day series can't turn timed without times.
        assert!(update_calendar_entry_series(
            &conn,
            &rent.id,
            "2026-01-01",
            CalendarEntrySeriesPatch {
                all_day: Some(false),
                start_time: Some(None),
                ..Default::default()
            }
        )
        .is_err());
    }

    #[test]
    fn series_update_works_on_daily_and_monthly_and_keeps_multi_day_overrides() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
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
        let occ = generate_occurrences(&conn, &daily.id, "2026-01-08").unwrap();
        override_occurrence(
            &conn,
            &occ[1].entity.id,
            CalendarEntryOverride {
                end_date: Some(Some("2026-01-07".into())),
                ..Default::default()
            },
        )
        .unwrap();
        update_calendar_entry_series(
            &conn,
            &daily.id,
            "2026-01-06",
            CalendarEntrySeriesPatch {
                start_time: Some(Some("09:30".into())),
                end_time: Some(Some("09:45".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &daily.id);
        assert_eq!(rows[0].2.as_deref(), Some("09:00"));
        assert_eq!(rows[1].2.as_deref(), Some("09:30"));
        assert_eq!(rows[3].3.as_deref(), Some("09:45"));
        // The multi-day span set by an override is never touched by the series.
        let moved = get_calendar_entry(&conn, &occ[1].entity.id).unwrap();
        assert_eq!(moved.end_date.as_deref(), Some("2026-01-07"));

        let monthly = create_calendar_entry_template(
            &conn,
            space.id,
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
        generate_occurrences(&conn, &monthly.id, "2026-03-01").unwrap();
        update_calendar_entry_series(
            &conn,
            &monthly.id,
            "2026-02-01",
            CalendarEntrySeriesPatch {
                title: Some("Rent due".into()),
                location: Some(Some("Bank".into())),
                ..Default::default()
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &monthly.id);
        assert_eq!((rows[0].1.as_str(), rows[0].5.clone()), ("Rent", None));
        assert_eq!(
            (rows[2].1.as_str(), rows[2].5.as_deref()),
            ("Rent due", Some("Bank"))
        );
    }

    #[test]
    fn series_update_on_a_trashed_template_still_applies() {
        // Pins current behavior: the template lookup does not filter deleted_at.
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        delete_calendar_entry_series(&conn, &tid, &occ[0].date).unwrap();
        assert!(update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                start_time: Some(Some("05:00".into())),
                ..Default::default()
            }
        )
        .is_ok());
        let t = get_calendar_entry_template(&conn, &tid).unwrap();
        assert_eq!(t.start_time.as_deref(), Some("05:00"));
        assert!(t.entity.deleted_at.is_some());
        // Trashed occurrences are not rewritten.
        assert!(snapshot(&conn, &tid)
            .iter()
            .all(|r| r.2.as_deref() == Some("07:00")));
    }

    // --- delete series ---

    #[test]
    fn series_delete_soft_deletes_from_date_and_keeps_rows() {
        let conn = setup();
        let (space, tid, occ) = series(&conn);
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[2].date).unwrap(),
            2
        );
        assert_eq!(row_count(&conn, &tid), 4);
        assert!(!trashed(&conn, &occ[0].entity.id));
        assert!(!trashed(&conn, &occ[1].entity.id));
        assert!(trashed(&conn, &occ[2].entity.id));
        assert!(trashed(&conn, &occ[3].entity.id));
        // Gone from listings, but the entity rows are still there.
        let live = list_calendar_entries(&conn, Some(&space)).unwrap();
        assert_eq!(live.len(), 2);
        let entity_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entities WHERE id IN (?1, ?2)",
                params![occ[2].entity.id, occ[3].entity.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(entity_rows, 2);
        // Template survives while a live occurrence remains.
        assert!(get_calendar_entry_template(&conn, &tid)
            .unwrap()
            .entity
            .deleted_at
            .is_none());
        // Trashed occurrences keep their data.
        let kept = get_calendar_entry(&conn, &occ[3].entity.id).unwrap();
        assert_eq!(kept.start_time.as_deref(), Some("07:00"));
        assert_eq!(kept.template_id.as_deref(), Some(tid.as_str()));
    }

    #[test]
    fn series_delete_from_first_occurrence_trashes_template_too() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[0].date).unwrap(),
            4
        );
        assert!(get_calendar_entry_template(&conn, &tid)
            .unwrap()
            .entity
            .deleted_at
            .is_some());
        assert_eq!(row_count(&conn, &tid), 4);
        assert!(
            list_calendar_entry_templates(&conn, &occ[0].entity.space_id)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn series_delete_does_not_double_count_trashed_occurrences() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        crate::db::entities::soft_delete_entity(&conn, &occ[3].entity.id).unwrap();
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[2].date).unwrap(),
            1
        );
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[2].date).unwrap(),
            0
        );
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[0].date).unwrap(),
            2
        );
    }

    #[test]
    fn series_delete_after_last_occurrence_trashes_nothing() {
        let conn = setup();
        let (_, tid, _) = series(&conn);
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, "2027-01-01").unwrap(),
            0
        );
        assert!(snapshot(&conn, &tid).len() == 4);
        assert!(get_calendar_entry_template(&conn, &tid)
            .unwrap()
            .entity
            .deleted_at
            .is_none());
        assert_eq!(list_calendar_entries(&conn, None).unwrap().len(), 4);
    }

    #[test]
    fn series_delete_trashes_template_when_earlier_ones_were_trashed_by_hand() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        crate::db::entities::soft_delete_entity(&conn, &occ[0].entity.id).unwrap();
        crate::db::entities::soft_delete_entity(&conn, &occ[1].entity.id).unwrap();
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[2].date).unwrap(),
            2
        );
        assert!(get_calendar_entry_template(&conn, &tid)
            .unwrap()
            .entity
            .deleted_at
            .is_some());
    }

    #[test]
    fn series_delete_includes_cancelled_and_uses_current_dates() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(
            &conn,
            &occ[3].entity.id,
            CalendarEntryOverride {
                cancelled: Some(true),
                date: Some("2026-01-06".into()),
                ..Default::default()
            },
        )
        .unwrap();
        // occ[3] now sits on 01-06, before from_date, so it survives.
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[1].date).unwrap(),
            2
        );
        assert!(!trashed(&conn, &occ[3].entity.id));
        assert!(trashed(&conn, &occ[1].entity.id));
        assert!(trashed(&conn, &occ[2].entity.id));
        override_occurrence(
            &conn,
            &occ[3].entity.id,
            CalendarEntryOverride {
                date: Some("2026-03-02".into()),
                ..Default::default()
            },
        )
        .unwrap();
        // Cancelled occurrences are deleted like any other.
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, "2026-02-01").unwrap(),
            1
        );
        assert!(trashed(&conn, &occ[3].entity.id));
    }

    #[test]
    fn series_delete_leaves_other_series_and_one_offs_alone() {
        let conn = setup();
        let (space, tid, occ) = series(&conn);
        let other = create_calendar_entry_template(
            &conn,
            space.clone(),
            "Yoga".into(),
            "weekly".into(),
            Some("18:00".into()),
            Some("19:00".into()),
            false,
            None,
            None,
            "2026-01-05".into(),
        )
        .unwrap();
        generate_occurrences(&conn, &other.id, "2026-01-26").unwrap();
        let one_off = create_one_off_calendar_entry(
            &conn,
            space,
            "Dentist".into(),
            "2026-01-20".into(),
            None,
            Some("10:00".into()),
            Some("11:00".into()),
            false,
            None,
            None,
        )
        .unwrap();
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[0].date).unwrap(),
            4
        );
        assert!(!trashed(&conn, &one_off.entity.id));
        assert!(snapshot(&conn, &other.id).len() == 4);
        assert_eq!(list_calendar_entries(&conn, None).unwrap().len(), 5);
        assert!(get_calendar_entry_template(&conn, &other.id)
            .unwrap()
            .entity
            .deleted_at
            .is_none());
    }

    #[test]
    fn series_delete_unknown_id_and_repeat_delete_error() {
        let conn = setup();
        let err = delete_calendar_entry_series(&conn, "nope", "2026-01-01").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
        let (_, tid, occ) = series(&conn);
        delete_calendar_entry_series(&conn, &tid, &occ[0].date).unwrap();
        // Intended: deleting again is idempotent and removes nothing (Ok(0)).
        assert_eq!(
            delete_calendar_entry_series(&conn, &tid, &occ[0].date).unwrap(),
            0
        );
    }

    #[test]
    fn series_delete_with_no_generated_occurrences_trashes_the_template() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
        let template = weekly_gym(&conn, space.id);
        assert_eq!(
            delete_calendar_entry_series(&conn, &template.id, "2026-01-01").unwrap(),
            0
        );
        assert!(get_calendar_entry_template(&conn, &template.id)
            .unwrap()
            .entity
            .deleted_at
            .is_some());
    }

    // --- generate_occurrences ---

    #[test]
    fn generate_is_idempotent_and_extends_without_duplicates() {
        let conn = setup();
        let (_, tid, _) = series(&conn);
        assert!(generate_occurrences(&conn, &tid, "2026-01-26")
            .unwrap()
            .is_empty());
        let more = generate_occurrences(&conn, &tid, "2026-02-09").unwrap();
        assert_eq!(
            more.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-02-02", "2026-02-09"]
        );
        assert_eq!(row_count(&conn, &tid), 6);
        assert_eq!(more[0].template_id.as_deref(), Some(tid.as_str()));
    }

    #[test]
    fn generate_does_not_resurrect_trashed_or_duplicate_cancelled_occurrences() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        delete_calendar_entry_series(&conn, &tid, &occ[2].date).unwrap();
        override_occurrence(
            &conn,
            &occ[0].entity.id,
            CalendarEntryOverride {
                cancelled: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(generate_occurrences(&conn, &tid, "2026-01-26")
            .unwrap()
            .is_empty());
        assert_eq!(row_count(&conn, &tid), 4);
        assert!(trashed(&conn, &occ[2].entity.id));
    }

    #[test]
    fn generate_does_not_refill_a_date_vacated_by_a_moved_occurrence() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(&conn, &occ[1].entity.id, ov("2026-01-14")).unwrap();
        let created = generate_occurrences(&conn, &tid, "2026-01-26").unwrap();
        // Fixed: generate skips every slot it already filled, so the vacated
        // 01-12 stays empty instead of getting a fresh occurrence.
        assert!(created.is_empty());
        assert_eq!(row_count(&conn, &tid), 4);
        assert_eq!(
            get_calendar_entry(&conn, &occ[1].entity.id).unwrap().date,
            "2026-01-14"
        );
    }

    #[test]
    fn generate_does_not_refill_dates_vacated_by_trashing_or_cancelling() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        crate::db::entities::soft_delete_entity(&conn, &occ[1].entity.id).unwrap();
        override_occurrence(
            &conn,
            &occ[2].entity.id,
            CalendarEntryOverride {
                date: Some("2026-01-20".into()),
                cancelled: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let before = snapshot(&conn, &tid);
        let created = generate_occurrences(&conn, &tid, "2026-02-02").unwrap();
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-02-02"]
        );
        assert_eq!(&snapshot(&conn, &tid)[..4], &before[..]);
        assert!(trashed(&conn, &occ[1].entity.id));
    }

    #[test]
    fn generate_after_moving_back_onto_the_original_date_adds_nothing() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        let id = &occ[1].entity.id;
        override_occurrence(&conn, id, ov("2026-01-14")).unwrap();
        assert!(generate_occurrences(&conn, &tid, "2026-01-26")
            .unwrap()
            .is_empty());
        override_occurrence(&conn, id, ov("2026-01-12")).unwrap();
        assert!(generate_occurrences(&conn, &tid, "2026-01-26")
            .unwrap()
            .is_empty());
        assert_eq!(row_count(&conn, &tid), 4);
        assert_eq!(get_calendar_entry(&conn, id).unwrap().date, "2026-01-12");
    }

    #[test]
    fn generate_after_a_move_still_extends_the_series_forward() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(&conn, &occ[1].entity.id, ov("2026-01-14")).unwrap();
        let created = generate_occurrences(&conn, &tid, "2026-02-09").unwrap();
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-02-02", "2026-02-09"]
        );
        assert_eq!(row_count(&conn, &tid), 6);
        assert!(generate_occurrences(&conn, &tid, "2026-02-09")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn generate_gives_no_twin_to_an_occurrence_moved_onto_a_later_slot() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(&conn, &occ[3].entity.id, ov("2026-02-02")).unwrap();
        let created = generate_occurrences(&conn, &tid, "2026-02-09").unwrap();
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-02-09"]
        );
        assert!(generate_occurrences(&conn, &tid, "2026-02-09")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn generate_does_not_resurrect_dates_after_empty_trash() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        crate::db::entities::soft_delete_entity(&conn, &occ[1].entity.id).unwrap();
        crate::db::entities::empty_trash(&conn).unwrap();
        assert_eq!(row_count(&conn, &tid), 3);
        assert!(generate_occurrences(&conn, &tid, "2026-01-26")
            .unwrap()
            .is_empty());
        let created = generate_occurrences(&conn, &tid, "2026-02-02").unwrap();
        assert_eq!(created.len(), 1);
        assert_eq!(created[0].date, "2026-02-02");
    }

    #[test]
    fn generate_on_existing_moved_data_alters_nothing() {
        // A released database: the series was generated once, then one
        // occurrence moved and another trashed. Generating further only adds new
        // slots and leaves every existing row exactly as it was.
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        override_occurrence(&conn, &occ[1].entity.id, ov("2026-01-14")).unwrap();
        crate::db::entities::soft_delete_entity(&conn, &occ[2].entity.id).unwrap();
        let rows = |conn: &Connection| {
            occ.iter()
                .map(|o| {
                    let e = get_calendar_entry(conn, &o.entity.id).unwrap();
                    (
                        e.date,
                        e.start_time,
                        e.end_time,
                        e.cancelled,
                        e.entity.deleted_at,
                    )
                })
                .collect::<Vec<_>>()
        };
        let before = rows(&conn);
        let created = generate_occurrences(&conn, &tid, "2026-02-09").unwrap();
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
        let (space, tid, occ) = series(&conn);
        override_occurrence(&conn, &occ[1].entity.id, ov("2026-01-14")).unwrap();
        let twin = create_occurrence(
            &conn,
            &space,
            "Gym",
            Some(tid.clone()),
            "2026-01-12".into(),
            None,
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            Some("Room 1".into()),
            Some("Bring towel".into()),
        )
        .unwrap();
        let before = snapshot(&conn, &tid);
        let created = generate_occurrences(&conn, &tid, "2026-02-09").unwrap();
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-02-09"]
        );
        assert_eq!(&snapshot(&conn, &tid)[..5], &before[..]);
        assert!(!trashed(&conn, &twin.entity.id));
    }

    #[test]
    fn generate_monthly_and_daily_skip_vacated_slots_too() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
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
            "2026-01-31".into(),
        )
        .unwrap();
        let occ = generate_occurrences(&conn, &monthly.id, "2026-03-31").unwrap();
        override_occurrence(&conn, &occ[1].entity.id, ov("2026-03-01")).unwrap();
        let created = generate_occurrences(&conn, &monthly.id, "2026-04-30").unwrap();
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-04-30"]
        );
        let daily = create_calendar_entry_template(
            &conn,
            space.id,
            "Walk".into(),
            "daily".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            None,
            None,
            "2026-01-05".into(),
        )
        .unwrap();
        let occ = generate_occurrences(&conn, &daily.id, "2026-01-07").unwrap();
        override_occurrence(&conn, &occ[0].entity.id, ov("2026-01-10")).unwrap();
        let created = generate_occurrences(&conn, &daily.id, "2026-01-10").unwrap();
        // 01-08 and 01-09 are new; 01-10 already holds the moved one; 01-05 stays empty.
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-01-08", "2026-01-09"]
        );
    }

    #[test]
    fn generate_copies_current_template_values_and_weekday() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        update_calendar_entry_series(
            &conn,
            &tid,
            "2026-01-01",
            CalendarEntrySeriesPatch {
                title: Some("Gym II".into()),
                start_time: Some(Some("06:00".into())),
                description: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        let created = generate_occurrences(&conn, &tid, "2026-02-02").unwrap();
        assert_eq!(created.len(), 1);
        let c = &created[0];
        assert_eq!(c.entity.title, "Gym II");
        assert_eq!(c.entity.entity_type, "calendar_entry");
        assert_eq!(c.entity.space_id, occ[0].entity.space_id);
        assert_eq!(c.start_time.as_deref(), Some("06:00"));
        assert_eq!(c.end_time.as_deref(), Some("08:00"));
        assert_eq!(c.location.as_deref(), Some("Room 1"));
        assert_eq!(c.description, None);
        assert!(!c.all_day && !c.cancelled);
        assert_eq!(c.end_date, None);
        // Every date is exactly seven days after the previous one, from the anchor.
        let dates: Vec<_> = snapshot(&conn, &tid).into_iter().map(|r| r.0).collect();
        for pair in dates.windows(2) {
            let a = NaiveDate::parse_from_str(&pair[0], "%Y-%m-%d").unwrap();
            let b = NaiveDate::parse_from_str(&pair[1], "%Y-%m-%d").unwrap();
            assert_eq!((b - a).num_days(), 7);
        }
    }

    #[test]
    fn generate_boundaries_and_errors() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
        let template = weekly_gym(&conn, space.id);
        // Until before the anchor: nothing. Until equal to the anchor: one.
        assert!(generate_occurrences(&conn, &template.id, "2026-01-04")
            .unwrap()
            .is_empty());
        assert_eq!(
            generate_occurrences(&conn, &template.id, "2026-01-05")
                .unwrap()
                .len(),
            1
        );
        // Until between cadence dates: inclusive upper bound only.
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
        let (_, tid, occ) = series(&conn);
        delete_calendar_entry_series(&conn, &tid, &occ[0].date).unwrap();
        assert!(
            generate_occurrences(&conn, &tid, "2026-02-02")
                .unwrap()
                .len()
                == 1
        );
    }

    #[test]
    fn generate_all_day_and_monthly_end_of_month_drift() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
        let template = create_calendar_entry_template(
            &conn,
            space.id,
            "Payday".into(),
            "monthly".into(),
            None,
            None,
            true,
            None,
            None,
            "2026-01-31".into(),
        )
        .unwrap();
        let created = generate_occurrences(&conn, &template.id, "2026-04-30").unwrap();
        assert!(created
            .iter()
            .all(|o| o.all_day && o.start_time.is_none() && o.end_time.is_none()));
        // Intended: each month is computed from the anchor day (31st) and clamped to
        // the month length, so a short month does not drag later months down.
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]
        );
    }

    #[test]
    fn generate_uses_anchor_as_is_for_any_weekday() {
        // DIFFERS: sessions snap the anchor forward to the template's weekday;
        // a calendar template's first occurrence is always its anchor date.
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
        let template = create_calendar_entry_template(
            &conn,
            space.id,
            "Odd".into(),
            "weekly".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            None,
            None,
            "2026-01-07".into(),
        )
        .unwrap();
        let created = generate_occurrences(&conn, &template.id, "2026-01-21").unwrap();
        assert_eq!(
            created.iter().map(|o| o.date.as_str()).collect::<Vec<_>>(),
            vec!["2026-01-07", "2026-01-14", "2026-01-21"]
        );
    }

    // --- template creation and override ---

    #[test]
    fn template_creation_validates_recurrence_and_times() {
        let conn = setup();
        let space = crate::db::test_space(&conn, "Life");
        let make = |recurrence: &str, start: Option<&str>, end: Option<&str>, all_day: bool| {
            create_calendar_entry_template(
                &conn,
                space.id.clone(),
                "T".into(),
                recurrence.into(),
                start.map(Into::into),
                end.map(Into::into),
                all_day,
                None,
                None,
                "2026-01-05".into(),
            )
        };
        assert!(make("yearly", Some("07:00"), Some("08:00"), false).is_err());
        assert!(make("weekly", Some("08:00"), Some("07:00"), false).is_err());
        assert!(make("weekly", Some("08:00"), Some("08:00"), false).is_err());
        assert!(make("weekly", None, None, false).is_err());
        assert!(make("weekly", None, None, true).is_ok());
        assert!(make("daily", Some("07:00"), Some("08:00"), false).is_ok());
        assert_eq!(
            list_calendar_entry_templates(&conn, &space.id)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn override_validates_and_persists_nothing_on_error() {
        // DIFFERS: `sessions::override_occurrence` only checks times when the
        // patch changes them, so sessions stored before that check stay editable.
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        let before = snapshot(&conn, &tid);
        assert!(override_occurrence(
            &conn,
            &occ[0].entity.id,
            CalendarEntryOverride {
                end_time: Some(Some("06:00".into())),
                ..Default::default()
            }
        )
        .is_err());
        assert!(override_occurrence(
            &conn,
            &occ[0].entity.id,
            CalendarEntryOverride {
                end_date: Some(Some("2026-01-01".into())),
                ..Default::default()
            }
        )
        .is_err());
        assert_eq!(snapshot(&conn, &tid), before);
        assert!(matches!(
            override_occurrence(&conn, "nope", CalendarEntryOverride::default()).unwrap_err(),
            AppError::NotFound(_)
        ));
    }

    #[test]
    fn override_can_move_clear_and_toggle_without_touching_series_link() {
        let conn = setup();
        let (_, tid, occ) = series(&conn);
        let o = override_occurrence(
            &conn,
            &occ[0].entity.id,
            CalendarEntryOverride {
                date: Some("2026-01-06".into()),
                location: Some(None),
                description: Some(None),
                cancelled: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(o.template_id.as_deref(), Some(tid.as_str()));
        let stored = get_calendar_entry(&conn, &occ[0].entity.id).unwrap();
        assert_eq!(stored.date, "2026-01-06");
        assert_eq!((stored.location, stored.description), (None, None));
        assert!(stored.cancelled);
        let t = get_calendar_entry_template(&conn, &tid).unwrap();
        assert_eq!(t.location.as_deref(), Some("Room 1"));
        assert_eq!(t.description.as_deref(), Some("Bring towel"));
        // Series update does not change cancelled state.
        update_calendar_entry_series(
            &conn,
            &tid,
            "2026-01-01",
            CalendarEntrySeriesPatch {
                start_time: Some(Some("06:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(
            get_calendar_entry(&conn, &occ[0].entity.id)
                .unwrap()
                .cancelled
        );
    }

    // --- Explicit overrides (`overridden_fields`) ---------------------------

    /// Daily 07:00 to 08:00 standup at Room 1, ten occurrences 01-05 to 01-14.
    fn daily_series(conn: &Connection) -> (String, Vec<CalendarEntry>) {
        let space = crate::db::test_space(conn, "Life");
        let template = create_calendar_entry_template(
            conn,
            space.id,
            "Standup".into(),
            "daily".into(),
            Some("07:00".into()),
            Some("08:00".into()),
            false,
            Some("Room 1".into()),
            None,
            "2026-01-05".into(),
        )
        .unwrap();
        let occ = generate_occurrences(conn, &template.id, "2026-01-14").unwrap();
        assert_eq!(occ.len(), 10);
        (template.id, occ)
    }

    fn times(start: &str, end: &str) -> CalendarEntrySeriesPatch {
        CalendarEntrySeriesPatch {
            start_time: Some(Some(start.into())),
            end_time: Some(Some(end.into())),
            ..Default::default()
        }
    }

    fn starts(conn: &Connection, tid: &str) -> Vec<Option<String>> {
        snapshot(conn, tid).into_iter().map(|r| r.2).collect()
    }

    #[test]
    fn edit_all_after_edit_following_reaches_every_occurrence() {
        // The reported bug: an edit from a later occurrence left the earlier
        // ones on the old time, and a later edit of the whole series skipped
        // them as if they had been overridden.
        let conn = setup();
        let (tid, occ) = daily_series(&conn);
        update_calendar_entry_series(&conn, &tid, &occ[5].date, times("08:00", "09:00")).unwrap();
        let rows = snapshot(&conn, &tid);
        assert!(rows[..5].iter().all(|r| r.2.as_deref() == Some("07:00")));
        assert!(rows[5..].iter().all(|r| r.2.as_deref() == Some("08:00")));

        update_calendar_entry_series(&conn, &tid, &occ[0].date, times("10:00", "11:00")).unwrap();
        for row in snapshot(&conn, &tid) {
            assert_eq!(
                (row.2.as_deref(), row.3.as_deref()),
                (Some("10:00"), Some("11:00"))
            );
        }
    }

    #[test]
    fn overridden_fields_keep_their_value_across_split_edits() {
        let conn = setup();
        let (tid, occ) = daily_series(&conn);
        // Before the split: own start time. After it: own location.
        override_occurrence(
            &conn,
            &occ[2].entity.id,
            CalendarEntryOverride {
                start_time: Some(Some("06:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
        override_occurrence(
            &conn,
            &occ[7].entity.id,
            CalendarEntryOverride {
                location: Some(Some("Hall".into())),
                ..Default::default()
            },
        )
        .unwrap();
        update_calendar_entry_series(&conn, &tid, &occ[5].date, times("08:00", "09:00")).unwrap();
        update_calendar_entry_series(
            &conn,
            &tid,
            &occ[0].date,
            CalendarEntrySeriesPatch {
                location: Some(Some("Studio".into())),
                ..times("10:00", "11:00")
            },
        )
        .unwrap();
        let rows = snapshot(&conn, &tid);
        // The overridden start stays; its end and location still follow.
        assert_eq!(rows[2].2.as_deref(), Some("06:00"));
        assert_eq!(rows[2].3.as_deref(), Some("11:00"));
        assert_eq!(rows[2].5.as_deref(), Some("Studio"));
        // The overridden location stays; its times follow.
        assert_eq!(rows[7].5.as_deref(), Some("Hall"));
        assert_eq!(rows[7].2.as_deref(), Some("10:00"));
        for (i, row) in rows.iter().enumerate() {
            if i != 2 {
                assert_eq!(row.2.as_deref(), Some("10:00"), "occurrence {i}");
            }
            if i != 7 {
                assert_eq!(row.5.as_deref(), Some("Studio"), "occurrence {i}");
            }
        }
    }

    #[test]
    fn edit_following_back_then_edit_all_reaches_every_occurrence() {
        let conn = setup();
        let (tid, occ) = daily_series(&conn);
        update_calendar_entry_series(&conn, &tid, &occ[5].date, times("08:00", "09:00")).unwrap();
        // Back to the original time from the same occurrence on.
        update_calendar_entry_series(&conn, &tid, &occ[5].date, times("07:00", "08:00")).unwrap();
        assert!(starts(&conn, &tid)
            .iter()
            .all(|s| s.as_deref() == Some("07:00")));
        // A later split, then the whole series again.
        update_calendar_entry_series(&conn, &tid, &occ[8].date, times("09:00", "10:00")).unwrap();
        update_calendar_entry_series(&conn, &tid, &occ[0].date, times("12:00", "13:00")).unwrap();
        assert!(starts(&conn, &tid)
            .iter()
            .all(|s| s.as_deref() == Some("12:00")));
    }

    #[test]
    fn an_override_set_back_to_the_series_value_follows_again() {
        let conn = setup();
        let (tid, occ) = daily_series(&conn);
        let id = &occ[1].entity.id;
        let start = |v: &str| CalendarEntryOverride {
            start_time: Some(Some(v.into())),
            ..Default::default()
        };
        override_occurrence(&conn, id, start("06:00")).unwrap();
        override_occurrence(&conn, id, start("07:00")).unwrap();
        update_calendar_entry_series(&conn, &tid, &occ[0].date, times("05:00", "08:00")).unwrap();
        assert_eq!(
            get_calendar_entry(&conn, id).unwrap().start_time.as_deref(),
            Some("05:00")
        );
    }

    #[test]
    fn resending_unchanged_values_is_not_an_override() {
        // The edit form sends every field; only what actually changed counts.
        let conn = setup();
        let (tid, occ) = daily_series(&conn);
        let id = &occ[1].entity.id;
        override_occurrence(
            &conn,
            id,
            CalendarEntryOverride {
                date: Some(occ[1].date.clone()),
                end_date: Some(None),
                start_time: Some(Some("07:00".into())),
                end_time: Some(Some("08:00".into())),
                all_day: Some(false),
                location: Some(Some("Hall".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            get_calendar_entry(&conn, id).unwrap().overridden_fields,
            crate::db::series::Field::Location as i64
        );
        update_calendar_entry_series(&conn, &tid, &occ[5].date, times("08:00", "09:00")).unwrap();
        update_calendar_entry_series(&conn, &tid, &occ[0].date, times("10:00", "11:00")).unwrap();
        let o = get_calendar_entry(&conn, id).unwrap();
        assert_eq!(o.start_time.as_deref(), Some("10:00"));
        assert_eq!(o.location.as_deref(), Some("Hall"));
        // Moving or cancelling marks nothing, and a series edit clears nothing.
        override_occurrence(
            &conn,
            &occ[3].entity.id,
            CalendarEntryOverride {
                date: Some("2026-01-20".into()),
                cancelled: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        let get = |i: usize| get_calendar_entry(&conn, &occ[i].entity.id).unwrap();
        assert_eq!(get(3).overridden_fields, 0);
        assert_eq!(
            get(1).overridden_fields,
            crate::db::series::Field::Location as i64
        );
    }

    #[test]
    fn overridden_fields_stay_out_of_the_serialized_entry() {
        let conn = setup();
        let (_, occ) = daily_series(&conn);
        let json = cli_get_calendar_entry(&conn, &occ[0].entity.id).unwrap();
        assert!(json.get("overriddenFields").is_none());
        assert!(json.get("overridden_fields").is_none());
    }
}
