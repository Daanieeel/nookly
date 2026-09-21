use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_space(row: &rusqlite::Row) -> rusqlite::Result<Space> {
    Ok(Space {
        id: row.get("id")?,
        name: row.get("name")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn create_space(
    conn: &Connection,
    name: String,
    icon: Option<String>,
    color: String,
) -> AppResult<Space> {
    let id = super::new_id();
    let now = super::now();
    conn.execute(
        "INSERT INTO spaces (id, name, icon, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, name, icon, color, now],
    )?;
    Ok(Space {
        id,
        name,
        icon,
        color,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn list_spaces(conn: &Connection) -> AppResult<Vec<Space>> {
    let mut stmt = conn.prepare("SELECT * FROM spaces ORDER BY created_at ASC")?;
    let rows = stmt.query_map([], row_to_space)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn get_space(conn: &Connection, id: &str) -> AppResult<Space> {
    conn.query_row(
        "SELECT * FROM spaces WHERE id = ?1",
        params![id],
        row_to_space,
    )
    .optional()?
    .ok_or_else(|| crate::error::AppError::NotFound(format!("space {id}")))
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacePatch {
    pub name: Option<String>,
    /// `Some` sets the icon; clearing it back to the folder default isn't exposed here.
    pub icon: Option<String>,
    pub color: Option<String>,
}

pub fn update_space(conn: &Connection, id: &str, patch: SpacePatch) -> AppResult<Space> {
    let mut space = get_space(conn, id)?;
    if let Some(name) = patch.name {
        space.name = name;
    }
    if let Some(icon) = patch.icon {
        space.icon = Some(icon);
    }
    if let Some(color) = patch.color {
        space.color = color;
    }
    let now = super::now();
    conn.execute(
        "UPDATE spaces SET name = ?1, icon = ?2, color = ?3, updated_at = ?4 WHERE id = ?5",
        params![space.name, space.icon, space.color, now, id],
    )?;
    space.updated_at = now;
    Ok(space)
}

/// Permanently deletes a Space and everything in it — every entity (mirroring
/// `entities::hard_delete_entity`'s per-table sweep, run in bulk here) plus the
/// Space-siloed Labels, regardless of trash state. Spaces have no Trash of
/// their own, and an entity can never move to a different Space (`space_id` is
/// mandatory and singular), so leaving soft-deleted entities behind after
/// their Space is gone would orphan them. No internal transaction — see
/// `relationships::create_relationship`; every command already runs behind the
/// single `DbState` mutex.
pub fn delete_space(conn: &Connection, id: &str) -> AppResult<()> {
    const IN_SPACE: &str = "SELECT id FROM entities WHERE space_id = ?1";

    conn.execute(
        // `?1` is a single indexed parameter reused by both `IN_SPACE` occurrences —
        // one bound value, not two.
        &format!(
            "DELETE FROM relationships WHERE from_entity_id IN ({IN_SPACE}) OR to_entity_id IN ({IN_SPACE})"
        ),
        params![id],
    )?;
    conn.execute(
        &format!(
            "DELETE FROM entity_labels WHERE entity_id IN ({IN_SPACE}) OR label_id IN (SELECT id FROM labels WHERE space_id = ?2)"
        ),
        params![id, id],
    )?;
    for table in [
        "blocks",
        "tasks",
        "courses",
        "semesters",
        "session_templates",
        "sessions",
        "exams",
        "study_blocks",
        "assignments",
        "files",
        "bookmarks",
        "search_index",
    ] {
        conn.execute(
            &format!("DELETE FROM {table} WHERE entity_id IN ({IN_SPACE})"),
            params![id],
        )?;
    }
    // Cards key off the deck's entity id, and must go before the decks themselves.
    conn.execute(
        &format!("DELETE FROM index_cards WHERE deck_entity_id IN ({IN_SPACE})"),
        params![id],
    )?;
    conn.execute(
        &format!("DELETE FROM index_card_decks WHERE entity_id IN ({IN_SPACE})"),
        params![id],
    )?;
    conn.execute("DELETE FROM entities WHERE space_id = ?1", params![id])?;
    conn.execute("DELETE FROM labels WHERE space_id = ?1", params![id])?;
    conn.execute("DELETE FROM space_modules WHERE space_id = ?1", params![id])?;

    let affected = conn.execute("DELETE FROM spaces WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(crate::error::AppError::NotFound(format!("space {id}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_and_list_space() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(
            &conn,
            "Work".into(),
            Some("briefcase".into()),
            "#3366ff".into(),
        )
        .unwrap();
        let listed = list_spaces(&conn).unwrap();

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, space.id);
        assert_eq!(listed[0].name, "Work");
    }

    #[test]
    fn update_space_patches_only_given_fields() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(
            &conn,
            "Work".into(),
            Some("briefcase".into()),
            "#3366ff".into(),
        )
        .unwrap();

        let updated = update_space(
            &conn,
            &space.id,
            SpacePatch {
                name: Some("Personal".into()),
                icon: None,
                color: None,
            },
        )
        .unwrap();

        assert_eq!(updated.name, "Personal");
        assert_eq!(updated.icon, Some("briefcase".into()));
        assert_eq!(updated.color, "#3366ff");
    }

    #[test]
    fn delete_space_cascades_entities_and_labels() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let other = create_space(&conn, "Personal".into(), None, "#111".into()).unwrap();

        let task =
            crate::db::tasks::create_task(&conn, space.id.clone(), "Task".into(), None, None)
                .unwrap();
        crate::db::entities::soft_delete_entity(&conn, &task.entity.id).unwrap();
        crate::db::labels::create_label(&conn, space.id.clone(), "Urgent".into(), "#f00".into())
            .unwrap();
        let kept =
            crate::db::tasks::create_task(&conn, other.id.clone(), "Keep".into(), None, None)
                .unwrap();

        delete_space(&conn, &space.id).unwrap();

        assert_eq!(list_spaces(&conn).unwrap().len(), 1);
        let remaining = crate::db::entities::list_entities(&conn, None, true).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, kept.entity.id);

        let label_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM labels", [], |r| r.get(0))
            .unwrap();
        assert_eq!(label_count, 0);
    }

    #[test]
    fn delete_space_errors_on_unknown_id() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        assert!(delete_space(&conn, "does-not-exist").is_err());
    }
}
