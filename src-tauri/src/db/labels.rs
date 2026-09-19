use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: String,
    pub space_id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

fn row_to_label(row: &rusqlite::Row) -> rusqlite::Result<Label> {
    Ok(Label {
        id: row.get("id")?,
        space_id: row.get("space_id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
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
    })
}

/// Space-siloed (§4.3) — labels from other Spaces are never returned.
pub fn list_labels(conn: &Connection, space_id: &str) -> AppResult<Vec<Label>> {
    let mut stmt = conn.prepare("SELECT * FROM labels WHERE space_id = ?1 ORDER BY name ASC")?;
    let rows = stmt.query_map(params![space_id], row_to_label)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
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
    let mut stmt = conn.prepare(
        "SELECT l.* FROM labels l
         JOIN entity_labels el ON el.label_id = l.id
         WHERE el.entity_id = ?1 ORDER BY l.name ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], row_to_label)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
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
