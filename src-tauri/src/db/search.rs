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
    /// Set when the match came from one block of a Note/Jot/Refinement rather
    /// than the entity's title. A page can yield several block hits.
    pub block_id: Option<String>,
    /// The matching block's text around the hit, matched terms wrapped in
    /// `\u{1}` / `\u{2}` (see `char(1)`/`char(2)` below). Only set alongside `block_id`.
    pub snippet: Option<String>,
    /// The page the block actually lives in. Differs from `entity_id` when the
    /// block belongs to notes embedded in another entity's page (Course Notes,
    /// Semester Notes): the hit then resolves to that owning entity instead.
    pub block_entity_id: Option<String>,
}

/// Structural relationships whose target is a notes page rendered inline on
/// the source entity's own page. Such notes are never a destination on their
/// own: their blocks resolve to the owning entity.
pub const EMBEDDED_NOTES_RELATIONSHIPS: &str = "'course-notes', 'semester-notes'";

/// Ids of every notes page embedded in another entity's page, for surfaces
/// that list destinations (Cmd+P) and must skip them.
pub fn list_embedded_page_ids(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT to_entity_id FROM relationships WHERE relationship_type IN ({EMBEDDED_NOTES_RELATIONSHIPS})"
    ))?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Generous per kind (titles, blocks) so the palette's "View all (N)" counts
/// stay accurate for any realistic single user dataset.
const HIT_LIMIT: i64 = 200;

/// Turns free user input into a safe FTS5 expression: every whitespace separated
/// word becomes a quoted prefix term (`"word"*`), ANDed together, so punctuation
/// like `-` or `:` can't be parsed as FTS syntax. `column` scopes each term.
fn match_expression(query: &str, column: Option<&str>) -> Option<String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|word| word.replace('"', ""))
        .filter(|word| !word.is_empty())
        .map(|word| match column {
            Some(col) => format!("{col} : \"{word}\"*"),
            None => format!("\"{word}\"*"),
        })
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

/// Full-text search across the whole app, deliberately not Space-scoped (§6) unless
/// the caller passes a space_id to narrow it (used by in-Space search UIs, if any).
/// Returns title hits first (exact, then prefix, then substring title matches ahead
/// of looser FTS ranking), followed by block-level hits ordered by FTS relevance.
/// Soft-deleted entities never appear.
pub fn search(conn: &Connection, query: &str, space_id: Option<&str>) -> AppResult<Vec<SearchHit>> {
    let mut hits = search_titles(conn, query, space_id)?;
    hits.extend(search_blocks(conn, query, space_id)?);
    Ok(hits)
}

fn search_titles(
    conn: &Connection,
    query: &str,
    space_id: Option<&str>,
) -> AppResult<Vec<SearchHit>> {
    let Some(match_query) = match_expression(query, Some("title")) else {
        return Ok(Vec::new());
    };
    // `course_notes` must never surface as a search result (§ course sub-dashboard) —
    // same invisibility rule `list_entities` enforces for mentions/pickers/Dashboard.
    // Embedded notes pages are skipped too: their title just echoes the owner's.
    let mut stmt = conn.prepare(&format!(
        "SELECT e.id, e.space_id, e.title, e.type, e.icon, NULL, NULL, NULL
         FROM entities e
         JOIN (SELECT entity_id, rank FROM search_index WHERE search_index MATCH ?1) si ON si.entity_id = e.id
         WHERE e.deleted_at IS NULL AND e.type != 'course_notes'
           AND NOT EXISTS (
             SELECT 1 FROM relationships r
             WHERE r.to_entity_id = e.id AND r.relationship_type IN ({EMBEDDED_NOTES_RELATIONSHIPS})
           )
           AND (?2 IS NULL OR e.space_id = ?2)
         ORDER BY lower(e.title) = ?3 DESC,
                  instr(lower(e.title), ?3) = 1 DESC,
                  instr(lower(e.title), ?3) > 0 DESC,
                  si.rank
         LIMIT ?4"
    ))?;
    let needle = query.trim().to_lowercase();
    let rows = stmt.query_map(
        params![match_query, space_id, needle, HIT_LIMIT],
        row_to_hit,
    )?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn search_blocks(
    conn: &Connection,
    query: &str,
    space_id: Option<&str>,
) -> AppResult<Vec<SearchHit>> {
    let Some(match_query) = match_expression(query, None) else {
        return Ok(Vec::new());
    };
    // Blocks of embedded notes (`o` = the owning Course/Semester) report the
    // owner as the hit, so opening one lands on the page that renders them.
    let mut stmt = conn.prepare(&format!(
        "SELECT COALESCE(o.id, e.id), COALESCE(o.space_id, e.space_id),
                COALESCE(o.title, e.title), COALESCE(o.type, e.type),
                CASE WHEN o.id IS NULL THEN e.icon ELSE o.icon END,
                b.id, f.snip, e.id
         FROM (
           SELECT block_id, rank, snippet(blocks_fts, 1, char(1), char(2), '…', 16) AS snip
           FROM blocks_fts WHERE blocks_fts MATCH ?1
         ) f
         JOIN blocks b ON b.id = f.block_id
         JOIN entities e ON e.id = b.entity_id
         LEFT JOIN relationships r
           ON r.to_entity_id = e.id AND r.relationship_type IN ({EMBEDDED_NOTES_RELATIONSHIPS})
         LEFT JOIN entities o ON o.id = r.from_entity_id
         WHERE e.deleted_at IS NULL AND (o.id IS NULL OR o.deleted_at IS NULL)
           AND (e.type != 'course_notes' OR o.id IS NOT NULL)
           AND (?2 IS NULL OR e.space_id = ?2)
         ORDER BY f.rank
         LIMIT ?3"
    ))?;
    let rows = stmt.query_map(params![match_query, space_id, HIT_LIMIT], row_to_hit)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn row_to_hit(row: &rusqlite::Row) -> rusqlite::Result<SearchHit> {
    Ok(SearchHit {
        entity_id: row.get(0)?,
        space_id: row.get(1)?,
        title: row.get(2)?,
        entity_type: row.get(3)?,
        icon: row.get(4)?,
        block_id: row.get(5)?,
        snippet: row.get(6)?,
        block_entity_id: row.get(7)?,
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
        let block = crate::db::notes::create_block(
            &conn,
            &entity.id,
            "paragraph".into(),
            "big o notation".into(),
            None,
            None,
            None,
        )
        .unwrap();

        let hits = search(&conn, "algorithms", None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].entity_id, entity.id);
        assert!(hits[0].block_id.is_none());

        let content_hits = search(&conn, "notation", None).unwrap();
        assert_eq!(content_hits.len(), 1);
        assert_eq!(content_hits[0].block_id.as_deref(), Some(block.id.as_str()));
        let snippet = content_hits[0].snippet.as_deref().unwrap();
        assert!(snippet.contains("\u{1}notation\u{2}"));
    }

    #[test]
    fn block_hits_follow_edits_deletes_and_trash() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let note =
            create_entity(&conn, space.id.clone(), "note".into(), "Page".into(), None).unwrap();
        let first = crate::db::notes::create_block(
            &conn,
            &note.id,
            "paragraph".into(),
            "quicksort pivot".into(),
            None,
            None,
            None,
        )
        .unwrap();
        crate::db::notes::create_block(
            &conn,
            &note.id,
            "paragraph".into(),
            "mergesort pivot".into(),
            None,
            None,
            None,
        )
        .unwrap();

        // Each matching block is its own hit.
        assert_eq!(search(&conn, "pivot", None).unwrap().len(), 2);

        crate::db::notes::update_block(
            &conn,
            &first.id,
            crate::db::notes::BlockPatch {
                content: Some("heapsort".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(search(&conn, "pivot", None).unwrap().len(), 1);
        assert_eq!(search(&conn, "heap", None).unwrap().len(), 1);

        crate::db::notes::delete_block(&conn, &first.id).unwrap();
        assert!(search(&conn, "heapsort", None).unwrap().is_empty());

        crate::db::entities::soft_delete_entity(&conn, &note.id).unwrap();
        assert!(search(&conn, "pivot", None).unwrap().is_empty());
    }

    #[test]
    fn punctuation_in_queries_is_not_fts_syntax() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        create_entity(
            &conn,
            space.id.clone(),
            "task".into(),
            "Fix deploy-pipeline".into(),
            None,
        )
        .unwrap();
        assert_eq!(search(&conn, "deploy-pipe", None).unwrap().len(), 1);
        assert!(search(&conn, "   ", None).unwrap().is_empty());
        assert!(search(&conn, "(\"a:", None).is_ok());
    }

    #[test]
    fn embedded_notes_resolve_to_their_owning_page() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();

        let space = create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let course =
            crate::db::courses::create_course(&conn, space.id.clone(), "Algorithms".into())
                .unwrap();
        let notes = crate::db::courses::get_or_create_course_notes(&conn, &course.id).unwrap();
        let block = crate::db::notes::create_block(
            &conn,
            &notes.id,
            "paragraph".into(),
            "dijkstra shortest path".into(),
            None,
            None,
            None,
        )
        .unwrap();

        let hits = search(&conn, "dijkstra", None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].entity_id, course.id);
        assert_eq!(hits[0].entity_type, "course");
        assert_eq!(hits[0].block_id.as_deref(), Some(block.id.as_str()));
        assert_eq!(hits[0].block_entity_id.as_deref(), Some(notes.id.as_str()));

        // The notes page's own title ("Algorithms Notes") only yields the Course.
        let title_hits = search(&conn, "algorithms notes", None).unwrap();
        assert!(title_hits.iter().all(|h| h.entity_id != notes.id));

        let semester = crate::db::courses::create_semester(
            &conn,
            space.id.clone(),
            "Fall".into(),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        let semester_notes =
            crate::db::courses::get_or_create_semester_notes(&conn, &semester.entity.id).unwrap();
        crate::db::notes::create_block(
            &conn,
            &semester_notes.id,
            "paragraph".into(),
            "enrollment deadline".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let hits = search(&conn, "enrollment", None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].entity_id, semester.entity.id);
        assert!(search(&conn, "fall notes", None)
            .unwrap()
            .iter()
            .all(|h| h.entity_id != semester_notes.id));
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
        crate::db::notes::create_block(
            &conn,
            &entity.id,
            "paragraph".into(),
            "syllabus reminders".into(),
            None,
            None,
            None,
        )
        .unwrap();

        assert!(search(&conn, "algorithms", None).unwrap().is_empty());
        assert!(search(&conn, "syllabus", None).unwrap().is_empty());
    }
}
