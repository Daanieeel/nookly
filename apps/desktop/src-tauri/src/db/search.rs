use crate::error::AppResult;
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection};
use serde::{Deserialize, Serialize};

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
    /// The entity's `TSK-14` style key (`Entity::key`).
    pub key: String,
    /// Set when the match came from one block of a Note/Jot rather
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
const EMBEDDED_NOTES_RELATIONSHIPS: &str = "'course-note', 'semester-notes'";

/// Most rows one source (keys, titles, blocks, indexed content) can add.
const HIT_LIMIT: i64 = 200;

/// What a search asks for. Everything but `query` narrows or reshapes the answer.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchRequest {
    pub query: String,
    /// Deliberately not Space-scoped by default (§6): only an in-Space search UI sets it.
    pub space_id: Option<String>,
    /// Entity types to keep. Empty keeps all of them.
    pub types: Vec<String>,
    /// Label names to require, case insensitive, matched in every Space. Every one must be on the entity.
    pub labels: Vec<String>,
    /// Title and key matches only: no body search and no snippets.
    pub titles_only: bool,
    /// At most one row per entity (its best match), for a flat ranked list.
    pub one_per_entity: bool,
    /// Cut the ranked list at this many rows.
    pub limit: Option<usize>,
}

impl SearchRequest {
    pub fn simple(query: &str, space_id: Option<&str>) -> Self {
        Self {
            query: query.to_string(),
            space_id: space_id.map(str::to_string),
            ..Self::default()
        }
    }
}

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
/// the caller passes a space_id. Keys first, then title matches (exact, prefix,
/// substring, then FTS rank), then block hits, then Bookmark and File text, each by
/// FTS relevance. Soft-deleted entities never appear. One statement, one pass.
pub fn search(conn: &Connection, query: &str, space_id: Option<&str>) -> AppResult<Vec<SearchHit>> {
    search_ranked(conn, &SearchRequest::simple(query, space_id))
}

/// Binds values for the `?N` placeholders of a query built from several pieces.
#[derive(Default)]
struct Binds(Vec<Value>);

impl Binds {
    fn bind(&mut self, value: impl Into<String>) -> String {
        self.0.push(Value::Text(value.into()));
        format!("?{}", self.0.len())
    }
}

/// The `AND ...` conditions that narrow a source to the request's Space, types and
/// labels. `id`, `space` and `kind` are the SQL expressions of the entity a row resolves to.
fn narrowing(req: &SearchRequest, binds: &mut Binds, id: &str, space: &str, kind: &str) -> String {
    let mut sql = String::new();
    if let Some(space_id) = &req.space_id {
        sql.push_str(&format!(" AND {space} = {}", binds.bind(space_id.as_str())));
    }
    if !req.types.is_empty() {
        let marks: Vec<String> = req.types.iter().map(|t| binds.bind(t.as_str())).collect();
        sql.push_str(&format!(" AND {kind} IN ({})", marks.join(", ")));
    }
    for label in &req.labels {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM entity_labels el JOIN labels l ON l.id = el.label_id
                          WHERE el.entity_id = {id} AND l.name = {} COLLATE NOCASE)",
            binds.bind(label.as_str())
        ));
    }
    sql
}

/// Every source selects the same columns: source number, tier and rank for sorting,
/// then the hit as `row_to_hit` reads it.
fn not_embedded() -> String {
    format!(
        "NOT EXISTS (
             SELECT 1 FROM relationships r
             WHERE r.to_entity_id = e.id AND r.relationship_type IN ({EMBEDDED_NOTES_RELATIONSHIPS})
           )"
    )
}

/// Search with every option, in one SQL statement. See `SearchRequest`.
pub fn search_ranked(conn: &Connection, req: &SearchRequest) -> AppResult<Vec<SearchHit>> {
    let mut binds = Binds::default();
    let mut sources: Vec<String> = Vec::new();
    let limit = HIT_LIMIT;
    let not_embedded = not_embedded();

    if let Some((prefix, digits)) = parse_key_query(&req.query) {
        let (p, d) = (binds.bind(prefix), binds.bind(digits));
        let narrow = narrowing(req, &mut binds, "e.id", "e.space_id", "e.type");
        // `course_notes` must never surface as a search result (§ course sub-dashboard),
        // and embedded notes pages are skipped too: their title just echoes the owner's.
        sources.push(format!(
            "SELECT * FROM (
               SELECT 0 AS src, 0 AS tier, length(CAST(e.key_number AS TEXT)) * 1.0 + e.key_number * 1e-9 AS rank,
                      e.id, e.space_id, e.title, e.type, e.icon, NULL, NULL, NULL,
                      e.key_prefix || '-' || e.key_number
               FROM entities e
               WHERE e.deleted_at IS NULL AND e.type != 'course_notes' AND {not_embedded}
                 AND e.key_prefix = {p} AND CAST(e.key_number AS TEXT) LIKE {d} || '%'{narrow}
               ORDER BY rank LIMIT {limit})"
        ));
    }

    if let Some(match_query) = match_expression(&req.query, Some("title")) {
        let m = binds.bind(match_query);
        let needle = binds.bind(req.query.trim().to_lowercase());
        let narrow = narrowing(req, &mut binds, "e.id", "e.space_id", "e.type");
        sources.push(format!(
            "SELECT * FROM (
               SELECT 1 AS src,
                      CASE WHEN lower(e.title) = {needle} THEN 0
                           WHEN instr(lower(e.title), {needle}) = 1 THEN 1
                           WHEN instr(lower(e.title), {needle}) > 0 THEN 2 ELSE 3 END AS tier,
                      si.rank AS rank,
                      e.id, e.space_id, e.title, e.type, e.icon, NULL, NULL, NULL,
                      e.key_prefix || '-' || e.key_number
               FROM entities e
               JOIN (SELECT entity_id, rank FROM search_index WHERE search_index MATCH {m}) si ON si.entity_id = e.id
               WHERE e.deleted_at IS NULL AND e.type != 'course_notes' AND {not_embedded}{narrow}
               ORDER BY tier, rank LIMIT {limit})"
        ));
    }

    if !req.titles_only {
        if let Some(match_query) = match_expression(&req.query, None) {
            let m = binds.bind(match_query);
            let narrow = narrowing(
                req,
                &mut binds,
                "COALESCE(o.id, e.id)",
                "COALESCE(o.space_id, e.space_id)",
                "COALESCE(o.type, e.type)",
            );
            // Blocks of embedded notes (`o` = the owning Course/Semester) report the
            // owner as the hit, so opening one lands on the page that renders them.
            sources.push(format!(
                "SELECT * FROM (
                   SELECT 2 AS src, 0 AS tier, f.rank AS rank,
                          COALESCE(o.id, e.id), COALESCE(o.space_id, e.space_id),
                          COALESCE(o.title, e.title), COALESCE(o.type, e.type),
                          CASE WHEN o.id IS NULL THEN e.icon ELSE o.icon END,
                          b.id, NULL, e.id,
                          COALESCE(o.key_prefix, e.key_prefix) || '-' || COALESCE(o.key_number, e.key_number)
                   FROM (
                     SELECT block_id, rank
                     FROM blocks_fts WHERE blocks_fts MATCH {m}
                   ) f
                   JOIN blocks b ON b.id = f.block_id
                   JOIN entities e ON e.id = b.entity_id
                   LEFT JOIN relationships r
                     ON r.to_entity_id = e.id AND r.relationship_type IN ({EMBEDDED_NOTES_RELATIONSHIPS})
                   LEFT JOIN entities o ON o.id = r.from_entity_id
                   WHERE e.deleted_at IS NULL AND (o.id IS NULL OR o.deleted_at IS NULL)
                     AND (e.type != 'course_notes' OR o.id IS NOT NULL){narrow}
                   ORDER BY rank LIMIT {limit})"
            ));
        }

        // A Bookmark's target website or a PDF File's extracted text, indexed into
        // `search_index.content`. Scoped to those two types so a Note's body is only
        // ever matched block by block, above.
        if let Some(match_query) = match_expression(&req.query, Some("content")) {
            let m = binds.bind(match_query);
            let narrow = narrowing(req, &mut binds, "e.id", "e.space_id", "e.type");
            sources.push(format!(
                "SELECT * FROM (
                   SELECT 3 AS src, 0 AS tier, f.rank AS rank,
                          e.id, e.space_id, e.title, e.type, e.icon, NULL, f.snip, NULL,
                          e.key_prefix || '-' || e.key_number
                   FROM (
                     SELECT entity_id, rank, snippet(search_index, 3, char(1), char(2), '…', 16) AS snip
                     FROM search_index WHERE search_index MATCH {m}
                   ) f
                   JOIN entities e ON e.id = f.entity_id
                   WHERE e.deleted_at IS NULL AND e.type IN ('bookmark', 'file'){narrow}
                   ORDER BY rank LIMIT {limit})"
            ));
        }
    }

    if sources.is_empty() {
        return Ok(Vec::new());
    }
    // Hits are cut after folding duplicates, so ask for a few more than the list needs.
    let outer = match req.limit {
        Some(n) if req.one_per_entity => format!(" LIMIT {}", n.saturating_mul(4).max(n)),
        Some(n) => format!(" LIMIT {n}"),
        None => String::new(),
    };
    let sql = format!(
        "SELECT * FROM ({}) ORDER BY src, tier, rank{outer}",
        sources.join(" UNION ALL ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(binds.0.iter()), row_to_hit)?;
    let rows = rows.collect::<Result<Vec<_>, _>>()?;
    let (mut hits, wanted) = fold_hits(rows, req);
    load_block_snippets(conn, req, &mut hits, &wanted)?;
    Ok(hits)
}

/// Drops a title hit whose entity already matched by key, and with `one_per_entity`
/// keeps only the best row per entity, lending it the first snippet found for it.
/// Block snippets are costly, so they are not read yet: the second value says, per
/// hit, which block's snippet it needs.
fn fold_hits(
    rows: Vec<(u8, SearchHit)>,
    req: &SearchRequest,
) -> (Vec<SearchHit>, Vec<Option<String>>) {
    let mut out: Vec<SearchHit> = Vec::new();
    let mut wanted: Vec<Option<String>> = Vec::new();
    let mut keyed = std::collections::HashSet::new();
    let mut at: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (src, hit) in rows {
        if src == 1 && keyed.contains(&hit.entity_id) {
            continue;
        }
        if src == 0 {
            keyed.insert(hit.entity_id.clone());
        }
        if req.one_per_entity {
            if let Some(&i) = at.get(&hit.entity_id) {
                if out[i].snippet.is_none() && wanted[i].is_none() {
                    if src == 2 {
                        wanted[i] = hit.block_id;
                    } else {
                        out[i].snippet = hit.snippet;
                    }
                }
                continue;
            }
            at.insert(hit.entity_id.clone(), out.len());
        }
        wanted.push(if src == 2 { hit.block_id.clone() } else { None });
        out.push(hit);
    }
    if let Some(n) = req.limit {
        out.truncate(n);
        wanted.truncate(n);
    }
    (out, wanted)
}

/// Reads the matching text of the blocks the final list shows, and only those.
fn load_block_snippets(
    conn: &Connection,
    req: &SearchRequest,
    hits: &mut [SearchHit],
    wanted: &[Option<String>],
) -> AppResult<()> {
    let ids: Vec<&String> = wanted.iter().flatten().collect();
    let Some(match_query) = match_expression(&req.query, None).filter(|_| !ids.is_empty()) else {
        return Ok(());
    };
    let marks = vec!["?"; ids.len()].join(", ");
    let mut stmt = conn.prepare(&format!(
        "SELECT block_id, snippet(blocks_fts, 1, char(1), char(2), '…', 16)
         FROM blocks_fts WHERE blocks_fts MATCH ?1 AND block_id IN ({marks})"
    ))?;
    let args = std::iter::once(&match_query).chain(ids);
    let found: std::collections::HashMap<String, String> = stmt
        .query_map(params_from_iter(args), |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (hit, block) in hits.iter_mut().zip(wanted) {
        if let Some(snippet) = block.as_ref().and_then(|id| found.get(id)) {
            hit.snippet = Some(snippet.clone());
        }
    }
    Ok(())
}

/// Splits a key shaped query (`TSK-14`, `tsk14`, `tsk 1`) into its prefix and number
/// digits. Needs at least one digit, so a bare `not` stays a title search.
pub fn parse_key_query(query: &str) -> Option<(String, String)> {
    let query = query.trim();
    if !query
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == ' ')
    {
        return None;
    }
    let compact: String = query.chars().filter(char::is_ascii_alphanumeric).collect();
    let (prefix, digits) = compact.split_at_checked(3)?;
    let valid = prefix.chars().all(|c| c.is_ascii_alphabetic())
        && !digits.is_empty()
        && digits.chars().all(|c| c.is_ascii_digit());
    valid.then(|| (prefix.to_ascii_uppercase(), digits.to_string()))
}

/// Reads the source number, then the hit.
fn row_to_hit(row: &rusqlite::Row) -> rusqlite::Result<(u8, SearchHit)> {
    Ok((
        row.get(0)?,
        SearchHit {
            entity_id: row.get(3)?,
            space_id: row.get(4)?,
            title: row.get(5)?,
            entity_type: row.get(6)?,
            icon: row.get(7)?,
            block_id: row.get(8)?,
            snippet: row.get(9)?,
            block_entity_id: row.get(10)?,
            key: row.get(11)?,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::entities::create_entity;
    use crate::db::spaces::create_space;

    #[test]
    fn search_finds_entities_by_key() {
        let conn = crate::db::test_conn();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let first =
            create_entity(&conn, space.id.clone(), "note".into(), "A".into(), None).unwrap();
        for title in ["B", "C", "D", "E", "F", "G", "H", "I", "J"] {
            create_entity(&conn, space.id.clone(), "note".into(), title.into(), None).unwrap();
        }
        let tenth =
            create_entity(&conn, space.id.clone(), "note".into(), "K".into(), None).unwrap();
        assert_eq!(first.key, "NOT-1");
        assert_eq!(tenth.key, "NOT-11");

        let hits = search(&conn, "not-1", None).unwrap();
        assert_eq!(hits[0].entity_id, first.id);
        let keys: Vec<&str> = hits.iter().take(3).map(|h| h.key.as_str()).collect();
        assert_eq!(keys, ["NOT-1", "NOT-10", "NOT-11"]);
        assert_eq!(hits[2].entity_id, tenth.id);
        assert_eq!(search(&conn, "NOT 11", None).unwrap()[0].key, "NOT-11");
        assert_eq!(parse_key_query("not"), None);
        assert_eq!(parse_key_query("tsk14"), Some(("TSK".into(), "14".into())));
    }

    /// macOS names files with decomposed accents (`U` + combining diaeresis), while
    /// typing gives the composed `\u{dc}`; both, and the bare letter, must find the file.
    #[test]
    fn search_ignores_how_an_accent_is_spelled() {
        let conn = crate::db::test_conn();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let file = create_entity(
            &conn,
            space.id.clone(),
            "file".into(),
            "U\u{308}bungsblatt 2- Shannon.pdf".into(),
            None,
        )
        .unwrap();
        for query in ["\u{dc}bungs", "U\u{308}bungs", "ubungs", "\u{dc}BUNGS"] {
            let hits = search(&conn, query, None).unwrap();
            assert_eq!(
                hits.first().map(|h| h.entity_id.as_str()),
                Some(file.id.as_str()),
                "query {query:?}"
            );
        }
    }

    #[test]
    fn search_finds_indexed_title() {
        let conn = crate::db::test_conn();

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
        let conn = crate::db::test_conn();

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
        let conn = crate::db::test_conn();

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
        let conn = crate::db::test_conn();

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
        let conn = crate::db::test_conn();

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

    #[test]
    fn bookmark_and_file_content_are_searchable_but_stay_scoped() {
        let conn = crate::db::test_conn();

        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let bookmark = crate::db::bookmarks::create_bookmark(
            &conn,
            space.id.clone(),
            "https://example.com".into(),
        )
        .unwrap();
        index_entity_content(&conn, &bookmark.entity.id, "a page about rust ownership").unwrap();

        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        let file =
            crate::db::files::store_file(&conn, &dir, space.id.clone(), "notes.txt", b"x", None)
                .unwrap();
        index_entity_content(&conn, &file.entity.id, "a PDF about rust ownership too").unwrap();

        // A Note's own body text is never mixed into a Bookmark or File's content
        // match — scoped strictly to `type IN ('bookmark', 'file')`.
        let note =
            create_entity(&conn, space.id.clone(), "note".into(), "Notes".into(), None).unwrap();
        index_entity_content(&conn, &note.id, "ownership rules in rust").unwrap();

        let hits = search(&conn, "ownership", None).unwrap();
        assert!(hits.iter().any(|h| h.entity_id == bookmark.entity.id));
        assert!(hits.iter().any(|h| h.entity_id == file.entity.id));
        assert!(hits.iter().all(|h| h.entity_id != note.id));
    }

    fn request(query: &str) -> SearchRequest {
        SearchRequest::simple(query, None)
    }

    #[test]
    fn ranked_list_keeps_the_ranking_order_and_folds_to_one_row_per_entity() {
        let conn = crate::db::test_conn();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let body =
            create_entity(&conn, space.id.clone(), "note".into(), "Other".into(), None).unwrap();
        crate::db::notes::create_block(
            &conn,
            &body.id,
            "paragraph".into(),
            "about kiwi trees".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let both = create_entity(
            &conn,
            space.id.clone(),
            "note".into(),
            "Kiwi plan".into(),
            None,
        )
        .unwrap();
        crate::db::notes::create_block(
            &conn,
            &both.id,
            "paragraph".into(),
            "kiwi budget".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let exact =
            create_entity(&conn, space.id.clone(), "task".into(), "kiwi".into(), None).unwrap();

        let ranked = |req: &SearchRequest| -> Vec<String> {
            search_ranked(&conn, req)
                .unwrap()
                .into_iter()
                .map(|h| h.entity_id)
                .collect()
        };
        let mut req = request("kiwi");
        req.one_per_entity = true;
        // Exact title, then a title that starts with it, then a body only match.
        assert_eq!(
            ranked(&req),
            [exact.id.clone(), both.id.clone(), body.id.clone()]
        );
        let hits = search_ranked(&conn, &req).unwrap();
        // The title hit borrows the body's snippet, but still opens the page itself.
        assert!(hits[1]
            .snippet
            .as_deref()
            .unwrap()
            .contains("\u{1}kiwi\u{2}"));
        assert!(hits[1].block_id.is_none());
        // Without folding, a page keeps one row per hit, as the CLI lists them.
        assert!(ranked(&request("kiwi")).len() > 3);

        req.limit = Some(2);
        assert_eq!(ranked(&req).len(), 2);
    }

    #[test]
    fn titles_only_skips_bodies_and_snippets() {
        let conn = crate::db::test_conn();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let note =
            create_entity(&conn, space.id.clone(), "note".into(), "Plain".into(), None).unwrap();
        crate::db::notes::create_block(
            &conn,
            &note.id,
            "paragraph".into(),
            "hidden mango".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let titled =
            create_entity(&conn, space.id.clone(), "note".into(), "Mango".into(), None).unwrap();
        crate::db::notes::create_block(
            &conn,
            &titled.id,
            "paragraph".into(),
            "mango again".into(),
            None,
            None,
            None,
        )
        .unwrap();

        let mut req = request("mango");
        req.titles_only = true;
        let hits = search_ranked(&conn, &req).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].entity_id, titled.id);
        assert!(hits[0].snippet.is_none() && hits[0].block_id.is_none());
        // Keys are titles too.
        req.query = titled.key.clone();
        assert_eq!(search_ranked(&conn, &req).unwrap()[0].entity_id, titled.id);
    }

    #[test]
    fn types_labels_and_space_narrow_every_source() {
        let conn = crate::db::test_conn();
        let work = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let study = create_space(&conn, "Study".into(), None, "#111".into()).unwrap();
        let note = create_entity(
            &conn,
            work.id.clone(),
            "note".into(),
            "Plum note".into(),
            None,
        )
        .unwrap();
        crate::db::notes::create_block(
            &conn,
            &note.id,
            "paragraph".into(),
            "plum jam".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let task = create_entity(
            &conn,
            study.id.clone(),
            "task".into(),
            "Plum task".into(),
            None,
        )
        .unwrap();
        let label =
            crate::db::labels::create_label(&conn, work.id.clone(), "Urgent".into(), "#f00".into())
                .unwrap();
        crate::db::labels::attach_label(&conn, &note.id, &label.id).unwrap();

        let ids = |req: &SearchRequest| -> Vec<String> {
            let mut ids: Vec<String> = search_ranked(&conn, req)
                .unwrap()
                .into_iter()
                .map(|h| h.entity_id)
                .collect();
            ids.dedup();
            ids
        };
        let mut req = request("plum");
        req.types = vec!["task".into()];
        assert_eq!(ids(&req), [task.id.clone()]);

        req.types = vec![];
        req.labels = vec!["urgent".into()];
        assert_eq!(ids(&req), [note.id.clone()]);
        req.labels = vec!["urgent".into(), "nope".into()];
        assert!(ids(&req).is_empty());

        req.labels = vec![];
        req.space_id = Some(study.id.clone());
        assert_eq!(ids(&req), [task.id.clone()]);
    }

    /// The 50 ms budget of the search surfaces (the fastest of a few runs, so a busy machine
    /// does not fail it): a ranked, folded list over 20,000
    /// entities with bodies, the shape the palette asks for.
    #[test]
    fn search_stays_within_its_budget_on_20000_entities() {
        let conn = crate::db::test_conn();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let words = [
            "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india",
            "juliet", "kilo", "lima", "mike", "november", "oscar", "papa", "quebec", "romeo",
            "sierra", "tango",
        ];
        conn.execute_batch("BEGIN").unwrap();
        {
            let mut entity = conn
                .prepare(
                    "INSERT INTO entities (id, space_id, type, title, icon, pinned, created_at, updated_at, deleted_at, key_prefix, key_number)
                     VALUES (?1, ?2, ?3, ?4, NULL, 0, 'now', 'now', NULL, ?5, ?6)",
                )
                .unwrap();
            let mut index = conn
                .prepare("INSERT INTO search_index (entity_id, space_id, title, content) VALUES (?1, ?2, ?3, '')")
                .unwrap();
            let mut block = conn
                .prepare("INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES (?1, ?2, 0, 'paragraph', ?3, 'now', 'now')")
                .unwrap();
            for i in 0..20_000usize {
                let id = format!("e{i}");
                let kind = if i % 2 == 0 { "note" } else { "task" };
                let title = format!(
                    "{} {} {} {i}",
                    words[i % 20],
                    words[(i / 20) % 20],
                    words[(i / 400) % 20]
                );
                let prefix = if kind == "note" { "NOT" } else { "TSK" };
                entity
                    .execute(params![id, space.id, kind, title, prefix, i as i64])
                    .unwrap();
                index.execute(params![id, space.id, title]).unwrap();
                if kind == "note" {
                    let text = format!(
                        "{} {} {} body text about {} and more words to fill the block",
                        words[(i / 3) % 20],
                        words[(i / 7) % 20],
                        words[(i / 11) % 20],
                        words[(i / 13) % 20]
                    );
                    block.execute(params![format!("b{i}"), id, text]).unwrap();
                }
            }
        }
        conn.execute_batch("COMMIT").unwrap();

        for query in ["a", "alpha", "alpha bravo", "tango oscar", "zzzz", "ech"] {
            let mut req = request(query);
            req.one_per_entity = true;
            req.limit = Some(50);
            // The first run warms SQLite's page cache, like a palette that was opened before.
            search_ranked(&conn, &req).unwrap();
            // Other tests and programs share the CPU, so a run is retried until one is
            // quick. A search that really needs more than 50 ms never is.
            let mut times: Vec<u128> = Vec::new();
            while times.len() < 40 && times.iter().all(|&t| t > 50) {
                let start = std::time::Instant::now();
                search_ranked(&conn, &req).unwrap();
                times.push(start.elapsed().as_millis());
            }
            times.sort();
            let fastest = times[0];
            eprintln!("search {query:?}: {times:?} ms");
            assert!(
                fastest <= 50,
                "{query:?} took {fastest} ms (budget 50 ms), runs {times:?}"
            );
        }
    }
}
