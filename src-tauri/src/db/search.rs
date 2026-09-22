use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;

/// Upserts the title, preserving any previously indexed content (e.g. a Note's block text)
/// so renaming an entity doesn't blow away its indexed body.
pub fn index_entity_title(
    conn: &Connection,
    entity_id: &str,
    space_id: &str,
    title: &str,
) -> AppResult<()> {
    let affected = conn.execute(
        "UPDATE search_index SET title = ?1, space_id = ?2 WHERE entity_id = ?3",
        params![title, space_id, entity_id],
    )?;
    if affected == 0 {
        conn.execute(
            "INSERT INTO search_index (entity_id, space_id, title, content) VALUES (?1, ?2, ?3, '')",
            params![entity_id, space_id, title],
        )?;
    }
    Ok(())
}

/// Replaces the indexed body content for an entity (e.g. a Note's concatenated block text).
pub fn index_entity_content(conn: &Connection, entity_id: &str, content: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE search_index SET content = ?1 WHERE entity_id = ?2",
        params![content, entity_id],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub entity_id: String,
    pub space_id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub icon: Option<String>,
}

/// Full-text search across the whole app, deliberately not Space-scoped (§6) unless
/// the caller passes a space_id to narrow it (used by in-Space search UIs, if any).
pub fn search(conn: &Connection, query: &str, space_id: Option<&str>) -> AppResult<Vec<SearchHit>> {
    let match_query = format!("{}*", query.replace('"', ""));
    // `course_notes` must never surface as a search result (§ course sub-dashboard) —
    // same invisibility rule `list_entities` enforces for mentions/pickers/Dashboard.
    let mut sql = String::from(
        "SELECT e.id, e.space_id, e.title, e.type, e.icon
         FROM entities e
         JOIN (SELECT entity_id, rank FROM search_index WHERE search_index MATCH ?1) si ON si.entity_id = e.id
         WHERE e.deleted_at IS NULL AND e.type != 'course_notes'",
    );
    if space_id.is_some() {
        sql.push_str(" AND e.space_id = ?2");
    }
    sql.push_str(" ORDER BY si.rank LIMIT 50");

    let mut stmt = conn.prepare(&sql)?;
    let rows = match space_id {
        Some(sid) => stmt.query_map(params![match_query, sid], row_to_hit)?,
        None => stmt.query_map(params![match_query], row_to_hit)?,
    };
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn row_to_hit(row: &rusqlite::Row) -> rusqlite::Result<SearchHit> {
    Ok(SearchHit {
        entity_id: row.get(0)?,
        space_id: row.get(1)?,
        title: row.get(2)?,
        entity_type: row.get(3)?,
        icon: row.get(4)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::entities::create_entity;
    use crate::db::spaces::create_space;

    #[test]
    fn search_finds_indexed_title() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let entity = create_entity(
            &conn,
            space.id.clone(),
            "note".into(),
            "Algorithms Lecture Notes".into(),
            None,
        )
        .unwrap();
        index_entity_content(&conn, &entity.id, "big o notation").unwrap();

        let hits = search(&conn, "algorithms", None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].entity_id, entity.id);

        let content_hits = search(&conn, "notation", None).unwrap();
        assert_eq!(content_hits.len(), 1);
    }

    #[test]
    fn course_notes_never_appear_in_search_results() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let entity = create_entity(
            &conn,
            space.id.clone(),
            "course_notes".into(),
            "Algorithms Notes".into(),
            None,
        )
        .unwrap();
        index_entity_content(&conn, &entity.id, "syllabus reminders").unwrap();

        assert!(search(&conn, "algorithms", None).unwrap().is_empty());
        assert!(search(&conn, "syllabus", None).unwrap().is_empty());
    }
}
