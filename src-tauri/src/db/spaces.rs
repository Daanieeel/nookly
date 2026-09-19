use crate::error::AppResult;
use rusqlite::{params, Connection};
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
}
