//! The recurring series behavior calendar entries (`calendar`) and course
//! sessions (`sessions`) share: retitling a series, walking its live
//! occurrences from a date on, and moving them to Trash. Keeping it in one
//! place keeps the two entity types behaving identically where they should.
//! What differs (fields, validation, the template's own row) stays with each
//! module and comes in through `SeriesOccurrence` and closures.

use crate::db::entities::Entity;
use crate::error::AppResult;
use rusqlite::{params, Connection};

/// An occurrence row of a recurring series, stored in `TABLE` with a
/// `template_id` and a `date` column.
pub(crate) trait SeriesOccurrence: Sized {
    /// The occurrence table, e.g. `calendar_entries`.
    const TABLE: &'static str;
    /// The alias `TABLE` takes in queries, e.g. `a`.
    const ALIAS: &'static str;

    fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self>;
    fn entity(&self) -> &Entity;
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
