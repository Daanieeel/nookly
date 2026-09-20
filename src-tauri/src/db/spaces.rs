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
}
