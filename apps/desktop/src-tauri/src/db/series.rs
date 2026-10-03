//! The recurring series behavior calendar entries (`calendar`) and course
//! sessions (`sessions`) share: retitling a series, walking its live
//! occurrences from a date on, and moving them to Trash. Keeping it in one
//! place keeps the two entity types behaving identically where they should.
//! What differs (fields, validation, the template's own row) stays with each
//! module and comes in through `SeriesOccurrence` and closures.
//!
//! An occurrence records which fields the user overrode on it in its
//! `overridden_fields` bitmask (`Field`), set by each module's
//! `override_occurrence` and read by `series_value`. Comparing against the
//! template alone can't tell an override from an occurrence an earlier edit
//! from a later date simply didn't reach.

use crate::db::entities::Entity;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use std::collections::HashSet;

/// An occurrence row of a recurring series, stored in `TABLE` with a
/// `template_id` and a `date` column.
pub(crate) trait SeriesOccurrence: Sized {
    /// The occurrence table, e.g. `calendar_entries`.
    const TABLE: &'static str;
    /// The alias `TABLE` takes in queries, e.g. `a`.
    const ALIAS: &'static str;

    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self>;
    fn entity(&self) -> &Entity;
    /// The occurrence's `overridden_fields` bitmask (`Field` bits).
    fn overridden_fields(&self) -> i64;
}

/// A field a series update writes to its occurrences, as its bit in an
/// occurrence's `overridden_fields` column. The values are stored, so they
/// never change; the migration that added the column backfills with them.
#[derive(Debug, Clone, Copy)]
pub(crate) enum Field {
    StartTime = 1,
    EndTime = 2,
    Location = 4,
    AllDay = 8,
    Description = 16,
}

/// Sets `field`'s bit in `mask` when an occurrence edit changes its value
/// (`before` to `after`). Re-sending the same value is not an override, so a
/// form that submits every field marks only the ones the user changed.
pub(crate) fn mark_override<T: PartialEq>(mask: &mut i64, field: Field, before: &T, after: &T) {
    if before != after {
        *mask |= field as i64;
    }
}

/// The value a series update gives one field of `occurrence`, where the
/// template's value goes from `previous` to `next`. A field the user never
/// overrode on this occurrence always follows the series, even when an
/// earlier edit from a later date left the template ahead of it. An
/// overridden field keeps its own value, unless it happens to equal the
/// template's `previous` one (`keep_or`).
pub(crate) fn series_value<O: SeriesOccurrence, T: PartialEq + Clone>(
    occurrence: &O,
    field: Field,
    current: &T,
    previous: &T,
    next: &T,
) -> T {
    if occurrence.overridden_fields() & field as i64 == 0 {
        next.clone()
    } else {
        keep_or(current, previous, next)
    }
}

/// `current` when an occurrence overrode the template's `previous` value,
/// otherwise the template's `next` one, so per occurrence overrides survive.
pub(crate) fn keep_or<T: PartialEq + Clone>(current: &T, previous: &T, next: &T) -> T {
    if current == previous {
        next.clone()
    } else {
        current.clone()
    }
}

/// Rejects times that don't end after they start. `what` names the thing in
/// the message, e.g. "a session". An all-day one needs no times at all.
/// Plain string comparison is correct since both are `HH:MM`.
pub(crate) fn validate_times(
    what: &str,
    all_day: bool,
    start_time: Option<&str>,
    end_time: Option<&str>,
) -> AppResult<()> {
    if all_day {
        return Ok(());
    }
    match (start_time, end_time) {
        (Some(s), Some(e)) if s < e => Ok(()),
        (Some(_), Some(_)) => Err(AppError::InvalidInput(format!(
            "{what} has to end after it starts"
        ))),
        _ => Err(AppError::InvalidInput(
            "startTime and endTime are required unless allDay is true".into(),
        )),
    }
}

/// Which of `slots` (every cadence date from the anchor up to the requested
/// end, in order) generating still has to create.
///
/// A series' occurrences are only ever created by generating, slot by slot
/// from the anchor, so its row count (trashed, cancelled and moved rows
/// included) is how many leading slots it has already filled. Those are never
/// filled again: a date vacated by moving, cancelling or trashing an
/// occurrence stays the way the user left it. A later slot is created unless
/// an occurrence of the series already sits on its date, so a moved one never
/// gets a twin. Once Empty Trash has removed rows the count runs low, and the
/// last slots fall back to that date check alone, as before.
pub(crate) fn slots_to_generate<O: SeriesOccurrence>(
    conn: &Connection,
    template_id: &str,
    slots: Vec<String>,
) -> AppResult<Vec<String>> {
    let filled: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM {t} WHERE template_id = ?1",
            t = O::TABLE
        ),
        params![template_id],
        |row| row.get(0),
    )?;
    let taken: HashSet<String> = conn
        .prepare(&format!(
            "SELECT date FROM {t} WHERE template_id = ?1",
            t = O::TABLE
        ))?
        .query_map(params![template_id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let filled = usize::try_from(filled).unwrap_or(0);
    Ok(slots
        .into_iter()
        .skip(filled)
        .filter(|date| !taken.contains(date))
        .collect())
}

fn set_title(conn: &Connection, entity_id: &str, title: &str) -> AppResult<()> {
    crate::db::entities::update_entity(
        conn,
        entity_id,
        crate::db::entities::EntityPatch {
            title: Some(title.to_string()),
            ..Default::default()
        },
    )?;
    Ok(())
}

/// Runs after the caller validated the patch and updated the template's own
/// row. Retitles the template when `new_title` differs from `old_title`, then
/// hands every live occurrence dated `from_date` or later to
/// `update_occurrence` and retitles each one that still carries `old_title`.
pub(crate) fn update_series<O: SeriesOccurrence>(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
    old_title: &str,
    new_title: Option<String>,
    mut update_occurrence: impl FnMut(&O) -> AppResult<()>,
) -> AppResult<()> {
    let title = new_title.filter(|t| t != old_title);
    if let Some(title) = &title {
        set_title(conn, template_id, title)?;
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT e.*, {a}.* FROM entities e JOIN {t} {a} ON {a}.entity_id = e.id
         WHERE {a}.template_id = ?1 AND {a}.date >= ?2 AND e.deleted_at IS NULL",
        t = O::TABLE,
        a = O::ALIAS,
    ))?;
    let occurrences = stmt
        .query_map(params![template_id, from_date], O::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    for occurrence in occurrences {
        update_occurrence(&occurrence)?;
        if let Some(title) = &title {
            if occurrence.entity().title == old_title {
                set_title(conn, &occurrence.entity().id, title)?;
            }
        }
    }
    Ok(())
}

/// Moves a series' occurrences from `from_date` on to Trash, and the template
/// too once no occurrence is left. Returns how many occurrences went.
pub(crate) fn delete_series<O: SeriesOccurrence>(
    conn: &Connection,
    template_id: &str,
    from_date: &str,
) -> AppResult<usize> {
    let ids: Vec<String> = conn
        .prepare(&format!(
            "SELECT e.id FROM entities e JOIN {t} {a} ON {a}.entity_id = e.id
             WHERE {a}.template_id = ?1 AND {a}.date >= ?2 AND e.deleted_at IS NULL",
            t = O::TABLE,
            a = O::ALIAS,
        ))?
        .query_map(params![template_id, from_date], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    for id in &ids {
        crate::db::entities::soft_delete_entity(conn, id)?;
    }
    let remaining: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM entities e JOIN {t} {a} ON {a}.entity_id = e.id
             WHERE {a}.template_id = ?1 AND e.deleted_at IS NULL",
            t = O::TABLE,
            a = O::ALIAS,
        ),
        params![template_id],
        |row| row.get(0),
    )?;
    if remaining == 0 {
        crate::db::entities::soft_delete_entity(conn, template_id)?;
    }
    Ok(ids.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_times_is_shared_by_sessions_and_calendar_entries() {
        let msg = |r: AppResult<()>| match r {
            Err(AppError::InvalidInput(m)) => m,
            other => panic!("expected InvalidInput, got {other:?}"),
        };
        assert!(validate_times("a session", false, Some("10:00"), Some("10:01")).is_ok());
        assert_eq!(
            msg(validate_times(
                "a session",
                false,
                Some("10:00"),
                Some("09:00")
            )),
            "a session has to end after it starts"
        );
        assert_eq!(
            msg(validate_times(
                "a calendar entry",
                false,
                Some("10:00"),
                Some("10:00")
            )),
            "a calendar entry has to end after it starts"
        );
        // All day needs no times, and ignores any it is given.
        assert!(validate_times("a calendar entry", true, None, None).is_ok());
        assert!(validate_times("a calendar entry", true, Some("10:00"), Some("09:00")).is_ok());
        for (start, end) in [(None, None), (Some("10:00"), None), (None, Some("10:00"))] {
            assert_eq!(
                msg(validate_times("a calendar entry", false, start, end)),
                "startTime and endTime are required unless allDay is true"
            );
        }
    }
}
