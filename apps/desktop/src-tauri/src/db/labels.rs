use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: String,
    pub space_id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
    /// How many live (not trashed) entities carry this label.
    pub usage_count: i64,
}

/// Every label column plus `usage_count`, for `SELECT {LABEL_COLUMNS} FROM labels l`.
const LABEL_COLUMNS: &str = "l.*, (SELECT COUNT(*) FROM entity_labels u
     JOIN entities e ON e.id = u.entity_id
     WHERE u.label_id = l.id AND e.deleted_at IS NULL) AS usage_count";

fn row_to_label(row: &rusqlite::Row) -> rusqlite::Result<Label> {
    Ok(Label {
        id: row.get("id")?,
        space_id: row.get("space_id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
        usage_count: row.get("usage_count")?,
    })
}

pub fn create_label(
    conn: &Connection,
    space_id: String,
    name: String,
    color: String,
) -> AppResult<Label> {
    let id = super::new_id();
    let now = super::now();
    conn.execute(
        "INSERT INTO labels (id, space_id, name, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, space_id, name, color, now],
    )?;
    Ok(Label {
        id,
        space_id,
        name,
        color,
        created_at: now,
        usage_count: 0,
    })
}

/// Space-siloed (§4.3) — labels from other Spaces are never returned.
pub fn list_labels(conn: &Connection, space_id: &str) -> AppResult<Vec<Label>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {LABEL_COLUMNS} FROM labels l WHERE l.space_id = ?1 ORDER BY l.name ASC"
    ))?;
    let rows = stmt.query_map(params![space_id], row_to_label)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Renames and/or recolors a label; `None` keeps that field.
pub fn update_label(
    conn: &Connection,
    id: &str,
    name: Option<String>,
    color: Option<String>,
) -> AppResult<Label> {
    let affected = conn.execute(
        "UPDATE labels SET name = COALESCE(?1, name), color = COALESCE(?2, color) WHERE id = ?3",
        params![name, color, id],
    )?;
    if affected == 0 {
        return Err(crate::error::AppError::NotFound(format!("label {id}")));
    }
    Ok(conn.query_row(
        &format!("SELECT {LABEL_COLUMNS} FROM labels l WHERE l.id = ?1"),
        params![id],
        row_to_label,
    )?)
}

pub fn delete_label(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM entity_labels WHERE label_id = ?1", params![id])?;
    conn.execute("DELETE FROM labels WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn attach_label(conn: &Connection, entity_id: &str, label_id: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO entity_labels (entity_id, label_id) VALUES (?1, ?2)",
        params![entity_id, label_id],
    )?;
    Ok(())
}

pub fn detach_label(conn: &Connection, entity_id: &str, label_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM entity_labels WHERE entity_id = ?1 AND label_id = ?2",
        params![entity_id, label_id],
    )?;
    Ok(())
}

pub fn list_labels_for_entity(conn: &Connection, entity_id: &str) -> AppResult<Vec<Label>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {LABEL_COLUMNS} FROM labels l
         JOIN entity_labels el ON el.label_id = l.id
         WHERE el.entity_id = ?1 ORDER BY l.name ASC"
    ))?;
    let rows = stmt.query_map(params![entity_id], row_to_label)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Every live entity's label ids in a Space, in one round trip — for filtering a
/// list of hits (e.g. Cmd+K results) by label without one query per hit.
pub fn list_entity_label_ids(
    conn: &Connection,
    space_id: &str,
) -> AppResult<HashMap<String, Vec<String>>> {
    let mut stmt = conn.prepare(
        "SELECT el.entity_id, el.label_id FROM entity_labels el
         JOIN entities e ON e.id = el.entity_id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL",
    )?;
    let rows = stmt.query_map(params![space_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (entity_id, label_id) = row?;
        map.entry(entity_id).or_default().push(label_id);
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::entities::create_entity;
    use crate::db::spaces::create_space;

    #[test]
    fn attach_and_list_labels_for_entity() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let entity = create_entity(
            &conn,
            space.id.clone(),
            "task".into(),
            "Ship it".into(),
            None,
        )
        .unwrap();
        let label =
            create_label(&conn, space.id.clone(), "Urgent".into(), "#ff0000".into()).unwrap();

        attach_label(&conn, &entity.id, &label.id).unwrap();
        let labels = list_labels_for_entity(&conn, &entity.id).unwrap();
        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].name, "Urgent");

        detach_label(&conn, &entity.id, &label.id).unwrap();
        assert!(list_labels_for_entity(&conn, &entity.id)
            .unwrap()
            .is_empty());
    }
}
