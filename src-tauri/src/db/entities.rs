use crate::db::search;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub space_id: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub title: String,
    pub icon: Option<String>,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

/// Public because other modules join `entities.*` into their own queries
/// (e.g. `tasks`, `courses`) and need to parse the base-entity columns back out.
pub fn row_to_entity(row: &rusqlite::Row) -> rusqlite::Result<Entity> {
    Ok(Entity {
        id: row.get("id")?,
        space_id: row.get("space_id")?,
        entity_type: row.get("type")?,
        title: row.get("title")?,
        icon: row.get("icon")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

pub fn create_entity(
    conn: &Connection,
    space_id: String,
    entity_type: String,
    title: String,
    icon: Option<String>,
) -> AppResult<Entity> {
    let id = super::new_id();
    let now = super::now();
    conn.execute(
        "INSERT INTO entities (id, space_id, type, title, icon, pinned, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6, NULL)",
        params![id, space_id, entity_type, title, icon, now],
    )?;
    search::index_entity_title(conn, &id, &space_id, &title)?;
    Ok(Entity {
        id,
        space_id,
        entity_type,
        title,
        icon,
        pinned: false,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

pub fn get_entity(conn: &Connection, id: &str) -> AppResult<Entity> {
    conn.query_row(
        "SELECT * FROM entities WHERE id = ?1",
        params![id],
        row_to_entity,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("entity {id}")))
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityPatch {
    pub title: Option<String>,
    /// `Some` sets the icon; clearing it back to the type default isn't exposed here.
    pub icon: Option<String>,
    pub pinned: Option<bool>,
}

pub fn update_entity(conn: &Connection, id: &str, patch: EntityPatch) -> AppResult<Entity> {
    let mut entity = get_entity(conn, id)?;
    if let Some(title) = patch.title {
        entity.title = title;
    }
    if let Some(icon) = patch.icon {
        entity.icon = Some(icon);
    }
    if let Some(pinned) = patch.pinned {
        entity.pinned = pinned;
    }
    let now = super::now();
    conn.execute(
        "UPDATE entities SET title = ?1, icon = ?2, pinned = ?3, updated_at = ?4 WHERE id = ?5",
        params![entity.title, entity.icon, entity.pinned as i64, now, id],
    )?;
    entity.updated_at = now;
    search::index_entity_title(conn, &entity.id, &entity.space_id, &entity.title)?;
    Ok(entity)
}

pub fn entity_exists(conn: &Connection, id: &str) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn list_entities(
    conn: &Connection,
    space_id: Option<&str>,
    include_deleted: bool,
) -> AppResult<Vec<Entity>> {
    let mut sql = String::from("SELECT * FROM entities WHERE 1 = 1");
    if !include_deleted {
        sql.push_str(" AND deleted_at IS NULL");
    }
    if space_id.is_some() {
        sql.push_str(" AND space_id = ?1");
    }
    sql.push_str(" ORDER BY created_at ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = match space_id {
        Some(sid) => stmt.query_map(params![sid], row_to_entity)?,
        None => stmt.query_map([], row_to_entity)?,
    };
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn soft_delete_entity(conn: &Connection, id: &str) -> AppResult<()> {
    let now = super::now();
    let affected = conn.execute(
        "UPDATE entities SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("entity {id}")));
    }
    Ok(())
}

pub fn restore_entity(conn: &Connection, id: &str) -> AppResult<()> {
    let now = super::now();
    let affected = conn.execute(
        "UPDATE entities SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NOT NULL",
        params![now, id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("entity {id}")));
    }
    Ok(())
}

/// Permanently removes a trashed entity and every row in another table keyed by
/// its id — there is no `ON DELETE CASCADE` anywhere in this schema (SQLite FK
/// enforcement is never turned on), so each subtype/child table has to be swept
/// explicitly. Only ever allowed on an already soft-deleted entity — this is the
/// Trash view's "Delete Forever", not a general hard-delete.
pub fn hard_delete_entity(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM relationships WHERE from_entity_id = ?1 OR to_entity_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM entity_labels WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM blocks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM tasks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM courses WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM semesters WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM session_templates WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM sessions WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM exams WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM index_card_decks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM index_cards WHERE deck_entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM study_blocks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM assignments WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM files WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM bookmarks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM search_index WHERE entity_id = ?1", params![id])?;

    let affected = conn.execute(
        "DELETE FROM entities WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("trashed entity {id}")));
    }
    Ok(())
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
    fn soft_delete_excludes_from_default_list_and_restore_reverses_it() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let entity =
            create_entity(&conn, space.id.clone(), "note".into(), "Hello".into(), None).unwrap();

        soft_delete_entity(&conn, &entity.id).unwrap();

        let visible = list_entities(&conn, None, false).unwrap();
        assert!(visible.is_empty());

        let with_trash = list_entities(&conn, None, true).unwrap();
        assert_eq!(with_trash.len(), 1);
        assert!(with_trash[0].deleted_at.is_some());

        restore_entity(&conn, &entity.id).unwrap();
        let visible_again = list_entities(&conn, None, false).unwrap();
        assert_eq!(visible_again.len(), 1);
        assert!(visible_again[0].deleted_at.is_none());
    }

    #[test]
    fn hard_delete_requires_trashed_and_cleans_child_tables() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let parent =
            crate::db::tasks::create_task(&conn, space.id.clone(), "Parent".into(), None, None)
                .unwrap();
        let child =
            crate::db::tasks::create_subtask(&conn, parent.entity.id.clone(), "Child".into())
                .unwrap();

        // Refuses a live (non-trashed) entity.
        assert!(hard_delete_entity(&conn, &child.entity.id).is_err());

        soft_delete_entity(&conn, &child.entity.id).unwrap();
        hard_delete_entity(&conn, &child.entity.id).unwrap();

        assert!(get_entity(&conn, &child.entity.id).is_err());

        let task_row_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE entity_id = ?1",
                params![child.entity.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(task_row_count, 0);

        let rel_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM relationships WHERE from_entity_id = ?1 OR to_entity_id = ?1",
                params![child.entity.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rel_count, 0);
    }

    #[test]
    fn hard_delete_unknown_entity_errors() {
        let conn = setup();
        assert!(hard_delete_entity(&conn, "does-not-exist").is_err());
    }

    #[test]
    fn soft_delete_unknown_entity_errors() {
        let conn = setup();
        let result = soft_delete_entity(&conn, "does-not-exist");
        assert!(result.is_err());
    }
}
