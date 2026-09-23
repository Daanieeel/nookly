use crate::db::entities::{row_to_entity, Entity};
use crate::db::schema::{CreateInput, EntitySchemaDef, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: String,
    pub entity_id: String,
    pub position: i64,
    pub block_type: String,
    pub content: String,
    /// Header row metadata on a `code` block only (highlight.js grammar name +
    /// display filename) — always `None` for every other block type.
    pub language: Option<String>,
    pub filename: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_block(row: &rusqlite::Row) -> rusqlite::Result<Block> {
    Ok(Block {
        id: row.get("id")?,
        entity_id: row.get("entity_id")?,
        position: row.get("position")?,
        block_type: row.get("block_type")?,
        content: row.get("content")?,
        language: row.get("language")?,
        filename: row.get("filename")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Creates the page entity. `page_type` lets Jots/Refinements (§5.3) reuse the same
/// block storage under their own entity type rather than a dedicated schema.
pub fn create_page(
    conn: &Connection,
    space_id: String,
    page_type: &str,
    title: String,
) -> AppResult<Entity> {
    crate::db::entities::create_entity(conn, space_id, page_type.into(), title, None)
}

/// Counts Jots with no outgoing `relates-to` link to a Refinement (§ sidebar badges).
/// Jots/Refinements are linked via the generic relationship system, not a dedicated
/// pairing structure, so this is an anti-join rather than a foreign-key check.
pub fn count_jots_without_refinement(conn: &Connection, space_id: &str) -> AppResult<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities e
         WHERE e.space_id = ?1 AND e.type = 'jot' AND e.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM relationships r JOIN entities t ON t.id = r.to_entity_id
           WHERE r.from_entity_id = e.id AND r.relationship_type = 'relates-to'
             AND t.type = 'refinement' AND t.deleted_at IS NULL
         )",
        params![space_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Cross-Space sibling of `count_jots_without_refinement`, for the Dashboard briefing.
pub fn count_jots_without_refinement_all_spaces(conn: &Connection) -> AppResult<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities e
         WHERE e.type = 'jot' AND e.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM relationships r JOIN entities t ON t.id = r.to_entity_id
           WHERE r.from_entity_id = e.id AND r.relationship_type = 'relates-to'
             AND t.type = 'refinement' AND t.deleted_at IS NULL
         )",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Most recently *edited* Notes (by block content, falling back to the entity's own
/// `updated_at`) — block edits don't bump `entities.updated_at`, only title/icon/pinned
/// patches do, so recency has to come from `blocks.updated_at` instead.
pub fn list_recent_notes(conn: &Connection, space_id: &str, limit: i64) -> AppResult<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM entities e
         LEFT JOIN (SELECT entity_id, MAX(updated_at) AS last_edit FROM blocks GROUP BY entity_id) b
           ON b.entity_id = e.id
         WHERE e.space_id = ?1 AND e.type = 'note' AND e.deleted_at IS NULL
         ORDER BY COALESCE(b.last_edit, e.updated_at) DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![space_id, limit], row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// One row of the Notes list page: the entity plus what it takes to recognize a Note
/// without opening it. Loaded in one call for the whole Space so the list never fans
/// out into a `list_blocks` per row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub entity: Entity,
    /// Raw markdown of the leading text blocks, joined by `\n`, capped near
    /// `PREVIEW_CHARS`. The frontend strips inline markdown for display.
    pub preview: String,
    /// Latest block edit, falling back to the entity's own `updated_at` (same rule
    /// as `list_recent_notes`).
    pub last_edited_at: String,
    pub label_ids: Vec<String>,
}

const PREVIEW_CHARS: usize = 280;

/// Block types whose content reads as prose in a preview; code, tables and media don't.
const PREVIEW_BLOCK_TYPES: &str =
    "'paragraph','heading1','heading2','heading3','quote','bulleted_list','numbered_list'";

pub fn list_note_summaries(conn: &Connection, space_id: &str) -> AppResult<Vec<NoteSummary>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, COALESCE(MAX(b.updated_at, e.updated_at), e.updated_at) AS last_edited_at
         FROM entities e
         LEFT JOIN (SELECT entity_id, MAX(updated_at) AS updated_at FROM blocks GROUP BY entity_id) b
           ON b.entity_id = e.id
         WHERE e.space_id = ?1 AND e.type = 'note' AND e.deleted_at IS NULL
         ORDER BY last_edited_at DESC",
    )?;
    let mut summaries = stmt
        .query_map(params![space_id], |row| {
            Ok(NoteSummary {
                entity: row_to_entity(row)?,
                preview: String::new(),
                last_edited_at: row.get("last_edited_at")?,
                label_ids: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let index: std::collections::HashMap<String, usize> = summaries
        .iter()
        .enumerate()
        .map(|(i, s)| (s.entity.id.clone(), i))
        .collect();

    let mut stmt = conn.prepare(&format!(
        "SELECT b.entity_id, b.content FROM blocks b JOIN entities e ON e.id = b.entity_id
         WHERE e.space_id = ?1 AND e.type = 'note' AND e.deleted_at IS NULL
           AND b.block_type IN ({PREVIEW_BLOCK_TYPES}) AND TRIM(b.content) != ''
         ORDER BY b.entity_id, b.position ASC"
    ))?;
    let mut rows = stmt.query(params![space_id])?;
    while let Some(row) = rows.next()? {
        let entity_id: String = row.get(0)?;
        let content: String = row.get(1)?;
        let Some(&i) = index.get(&entity_id) else {
            continue;
        };
        let preview = &mut summaries[i].preview;
        if preview.chars().count() >= PREVIEW_CHARS {
            continue;
        }
        if !preview.is_empty() {
            preview.push('\n');
        }
        preview.push_str(content.trim());
    }
    for summary in &mut summaries {
        if let Some((cut, _)) = summary.preview.char_indices().nth(PREVIEW_CHARS) {
            summary.preview.truncate(cut);
        }
    }

    let mut stmt = conn.prepare(
        "SELECT el.entity_id, el.label_id FROM entity_labels el
         JOIN entities e ON e.id = el.entity_id
         JOIN labels l ON l.id = el.label_id
         WHERE e.space_id = ?1 AND e.type = 'note' AND e.deleted_at IS NULL
         ORDER BY l.name ASC",
    )?;
    let mut rows = stmt.query(params![space_id])?;
    while let Some(row) = rows.next()? {
        let entity_id: String = row.get(0)?;
        if let Some(&i) = index.get(&entity_id) {
            summaries[i].label_ids.push(row.get(1)?);
        }
    }
    Ok(summaries)
}

pub fn list_blocks(conn: &Connection, entity_id: &str) -> AppResult<Vec<Block>> {
    let mut stmt =
        conn.prepare("SELECT * FROM blocks WHERE entity_id = ?1 ORDER BY position ASC")?;
    let rows = stmt.query_map(params![entity_id], row_to_block)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Right sidebar's "Mentioned in" (§3.5) — the reverse of the frontend's own
/// `extractMentionIds` (`mention-utils.ts`): every *other* entity that has at
/// least one block containing an inline `[title](mention:<entity_id>)` link
/// pointing at this one. `entity_id` is always a UUID (`new_id`), so it can't
/// contain `LIKE` wildcards (`%`/`_`) and needs no escaping.
pub fn list_mentioning_entities(conn: &Connection, entity_id: &str) -> AppResult<Vec<Entity>> {
    let pattern = format!("%mention:{entity_id}%");
    let mut stmt = conn.prepare(
        "SELECT DISTINCT e.* FROM blocks b JOIN entities e ON e.id = b.entity_id
         WHERE b.content LIKE ?1 AND e.deleted_at IS NULL AND e.id != ?2",
    )?;
    let rows = stmt.query_map(params![pattern, entity_id], row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// A `table` block's real content format is rows joined by `\n`, cells within a row joined by
/// a literal tab (`block_to_markdown`'s "table" arm splits on exactly that) — not markdown pipe
/// syntax. Typing `| a | b |` rows (optionally with a `|---|---|` separator) is an easy, natural
/// mistake from the CLI, and previously failed silently: splitting a tab-free `| a | b |` line
/// on `\t` just returns that whole line as one column, so the table renders with a single
/// garbage column instead of erroring. Detected here and converted automatically instead.
/// Returns `(content, true)` if it actually converted something, `(content, false)` (the input,
/// untouched) if `content` didn't look like a markdown table to begin with.
pub fn normalize_table_content(content: &str) -> (String, bool) {
    let mut lines = content.lines();
    let Some(first) = lines.next() else {
        return (content.to_string(), false);
    };
    if !is_table_row(first) {
        return (content.to_string(), false);
    }
    let mut rows = vec![parse_table_row(first).join("\t")];
    for line in lines {
        if line.trim().is_empty() || is_table_separator(line) {
            continue;
        }
        if !is_table_row(line) {
            // Doesn't actually look like a markdown table after all — bail out and keep the
            // original content untouched rather than guessing.
            return (content.to_string(), false);
        }
        rows.push(parse_table_row(line).join("\t"));
    }
    (rows.join("\n"), true)
}

/// A markdown table row: starts and ends with `|` once trimmed.
fn is_table_row(line: &str) -> bool {
    let t = line.trim();
    t.len() >= 2 && t.starts_with('|') && t.ends_with('|')
}

/// The `|---|:---:|---|`-style separator row that must follow a table header —
/// only `-`, `:`, `|` and whitespace, with at least one `-` (so a lone `||`
/// data row isn't mistaken for one).
fn is_table_separator(line: &str) -> bool {
    let t = line.trim();
    !t.is_empty() && t.contains('-') && t.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '))
}

/// Splits one `| a | b | c |` row into its trimmed cell strings.
fn parse_table_row(line: &str) -> Vec<String> {
    let t = line.trim();
    let inner = t.strip_prefix('|').unwrap_or(t);
    let inner = inner.strip_suffix('|').unwrap_or(inner);
    inner
        .split('|')
        .map(|cell| cell.trim().to_string())
        .collect()
}

pub fn create_block(
    conn: &Connection,
    entity_id: &str,
    block_type: String,
    content: String,
    position: Option<i64>,
    language: Option<String>,
    filename: Option<String>,
) -> AppResult<Block> {
    let content = if block_type == "table" {
        normalize_table_content(&content).0
    } else {
        content
    };
    let position = match position {
        Some(p) => p,
        None => {
            let max: Option<i64> = conn.query_row(
                "SELECT MAX(position) FROM blocks WHERE entity_id = ?1",
                params![entity_id],
                |row| row.get(0),
            )?;
            max.map(|p| p + 1).unwrap_or(0)
        }
    };
    let id = super::new_id();
    let now = super::now();
    conn.execute(
        "INSERT INTO blocks (id, entity_id, position, block_type, content, language, filename, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![id, entity_id, position, block_type, content, language, filename, now],
    )?;
    reindex_page(conn, entity_id)?;
    Ok(Block {
        id,
        entity_id: entity_id.into(),
        position,
        block_type,
        content,
        language,
        filename,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockPatch {
    pub content: Option<String>,
    /// `Some` retypes the block (e.g. a paragraph turned into a heading by an
    /// editor shortcut) — this never moves content between blocks, only relabels one.
    pub block_type: Option<String>,
    /// `Some("")` clears the field to `NULL`; `Some(nonEmpty)` sets it; `None`
    /// leaves it untouched. Only ever meaningful on a `code` block.
    pub language: Option<String>,
    pub filename: Option<String>,
}

pub fn update_block(conn: &Connection, block_id: &str, patch: BlockPatch) -> AppResult<Block> {
    let mut block = conn
        .query_row(
            "SELECT * FROM blocks WHERE id = ?1",
            params![block_id],
            row_to_block,
        )
        .map_err(|_| AppError::NotFound(format!("block {block_id}")))?;
    if let Some(content) = patch.content {
        block.content = content;
    }
    if let Some(block_type) = patch.block_type {
        block.block_type = block_type;
    }
    if let Some(language) = patch.language {
        block.language = (!language.is_empty()).then_some(language);
    }
    if let Some(filename) = patch.filename {
        block.filename = (!filename.is_empty()).then_some(filename);
    }
    if block.block_type == "table" {
        block.content = normalize_table_content(&block.content).0;
    }
    let now = super::now();
    conn.execute(
        "UPDATE blocks SET content = ?1, block_type = ?2, language = ?3, filename = ?4, updated_at = ?5 WHERE id = ?6",
        params![block.content, block.block_type, block.language, block.filename, now, block_id],
    )?;
    block.updated_at = now;
    reindex_page(conn, &block.entity_id)?;
    Ok(block)
}

pub fn delete_block(conn: &Connection, block_id: &str) -> AppResult<()> {
    let entity_id: String = conn
        .query_row(
            "SELECT entity_id FROM blocks WHERE id = ?1",
            params![block_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("block {block_id}")))?;
    conn.execute("DELETE FROM blocks WHERE id = ?1", params![block_id])?;
    reindex_page(conn, &entity_id)
}

pub fn reorder_blocks(
    conn: &Connection,
    entity_id: &str,
    ordered_block_ids: Vec<String>,
) -> AppResult<()> {
    for (position, block_id) in ordered_block_ids.iter().enumerate() {
        conn.execute(
            "UPDATE blocks SET position = ?1 WHERE id = ?2 AND entity_id = ?3",
            params![position as i64, block_id, entity_id],
        )?;
    }
    Ok(())
}

/// Every block type's plain-markdown serialization (§5.2/§8) — guarantees a complete,
/// if not visually polished, export for any block.
pub fn block_to_markdown(block: &Block) -> String {
    match block.block_type.as_str() {
        "heading1" => format!("# {}", block.content),
        "heading2" => format!("## {}", block.content),
        "heading3" => format!("### {}", block.content),
        "quote" => block
            .content
            .lines()
            .map(|l| format!("> {l}"))
            .collect::<Vec<_>>()
            .join("\n"),
        "code" => {
            let mut info = block.language.clone().unwrap_or_default();
            if let Some(filename) = &block.filename {
                if !info.is_empty() {
                    info.push(' ');
                }
                info.push_str(&format!("filename=\"{filename}\""));
            }
            format!("```{info}\n{}\n```", block.content)
        }
        "bulleted_list" => block
            .content
            .lines()
            .map(|l| format!("- {l}"))
            .collect::<Vec<_>>()
            .join("\n"),
        "numbered_list" => block
            .content
            .lines()
            .enumerate()
            .map(|(i, l)| format!("{}. {l}", i + 1))
            .collect::<Vec<_>>()
            .join("\n"),
        "image" => format!("![]({})", block.content),
        "embed" => format!("[embed]({})", block.content),
        // `content` is rows joined by "\n", cells within a row joined by "\t"
        // (§ table block), first row is the header — the editor's own storage
        // shape, not markdown; this is the one place it becomes real markdown.
        "table" => {
            let mut lines = block.content.lines();
            let Some(header) = lines.next() else {
                return String::new();
            };
            let header_cells: Vec<&str> = header.split('\t').collect();
            let mut out = format!("| {} |", header_cells.join(" | "));
            out.push('\n');
            out.push_str(&format!(
                "|{}|",
                header_cells
                    .iter()
                    .map(|_| "---")
                    .collect::<Vec<_>>()
                    .join("|")
            ));
            for row in lines {
                let cells: Vec<&str> = row.split('\t').collect();
                out.push('\n');
                out.push_str(&format!("| {} |", cells.join(" | ")));
            }
            out
        }
        _ => block.content.clone(),
    }
}

pub fn render_page_markdown(conn: &Connection, entity_id: &str) -> AppResult<String> {
    let blocks = list_blocks(conn, entity_id)?;
    Ok(blocks
        .iter()
        .map(block_to_markdown)
        .collect::<Vec<_>>()
        .join("\n\n"))
}

fn reindex_page(conn: &Connection, entity_id: &str) -> AppResult<()> {
    let markdown = render_page_markdown(conn, entity_id)?;
    crate::db::search::index_entity_content(conn, entity_id, &markdown)
}

pub fn list_pages(
    conn: &Connection,
    space_id: &str,
    page_type: &str,
    include_deleted: bool,
) -> AppResult<Vec<Entity>> {
    let mut sql = String::from("SELECT * FROM entities WHERE space_id = ?1 AND type = ?2");
    if !include_deleted {
        sql.push_str(" AND deleted_at IS NULL");
    }
    sql.push_str(" ORDER BY created_at ASC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space_id, page_type], row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------
//
// Notes, Jots and Refinements (§5.2/§5.3) are all "page" entities backed by
// the same block storage, distinguished only by `entities.type`. One set of
// adapters, three registrations.

/// Pages (Notes/Jots/Refinements) have no `--field` values of their own — deliberately: an
/// earlier revision offered `--field body=<markdown>` as a shortcut past the real block
/// commands, and agents reached for it instead of ever learning `add-block`/`update-block`
/// (so e.g. a `code` block created this way had no way to get a `--language`/`--filename`
/// header). `blocks`/`add-block`/`update-block`/... (`cli::block_command`) are the only way
/// to write page content from the CLI now.
fn cli_get_page(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    let entity = crate::db::entities::get_entity(conn, id)?;
    let body = render_page_markdown(conn, id)?;
    Ok(serde_json::json!({ "entity": entity, "body": body }))
}

fn cli_create_page(
    page_type: &'static str,
) -> impl Fn(&Connection, CreateInput) -> AppResult<serde_json::Value> {
    move |conn, input| {
        let entity = create_page(conn, input.space_id, page_type, input.title)?;
        cli_get_page(conn, &entity.id)
    }
}

fn cli_update_page(conn: &Connection, id: &str, _fields: &JsonMap) -> AppResult<serde_json::Value> {
    cli_get_page(conn, id)
}

fn cli_list_pages(
    page_type: &'static str,
) -> impl Fn(&Connection, Option<&str>, bool) -> AppResult<Vec<serde_json::Value>> {
    move |conn, space_id, include_deleted| {
        let space_id = space_id.ok_or_else(|| {
            AppError::InvalidInput(format!("{page_type} list requires --space <space-id>"))
        })?;
        Ok(list_pages(conn, space_id, page_type, include_deleted)?
            .into_iter()
            .map(|e| serde_json::to_value(e).expect("Entity always serializes"))
            .collect())
    }
}

fn cli_create_note(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    cli_create_page("note")(conn, input)
}
fn cli_list_notes(
    conn: &Connection,
    space_id: Option<&str>,
    include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    cli_list_pages("note")(conn, space_id, include_deleted)
}
fn cli_create_jot(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    cli_create_page("jot")(conn, input)
}
fn cli_list_jots(
    conn: &Connection,
    space_id: Option<&str>,
    include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    cli_list_pages("jot")(conn, space_id, include_deleted)
}
fn cli_create_refinement(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    cli_create_page("refinement")(conn, input)
}
fn cli_list_refinements(
    conn: &Connection,
    space_id: Option<&str>,
    include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    cli_list_pages("refinement")(conn, space_id, include_deleted)
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "note",
        supports_blocks: true,
        description: "A free-form page of block content.",
        fields: &[],
        relationship_types: &["relates-to", "attached-file"],
        create: cli_create_note,
        update: cli_update_page,
        get: cli_get_page,
        list: cli_list_notes,
    }
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "jot",
        supports_blocks: true,
        description: "A quick, unrefined capture. Link to a `refinement` via `relates-to` once processed.",
        fields: &[],
        relationship_types: &["relates-to"],
        create: cli_create_jot,
        update: cli_update_page,
        get: cli_get_page,
        list: cli_list_jots,
    }
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "refinement",
        supports_blocks: true,
        description: "A processed/cleaned-up write-up, usually linked from one or more Jots.",
        fields: &[],
        relationship_types: &["relates-to"],
        create: cli_create_refinement,
        update: cli_update_page,
        get: cli_get_page,
        list: cli_list_refinements,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_summaries_carry_preview_recency_and_labels() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let empty = create_page(&conn, space.id.clone(), "note", "Empty".into()).unwrap();
        let page = create_page(&conn, space.id.clone(), "note", "Lecture 1".into()).unwrap();
        create_page(&conn, space.id.clone(), "jot", "Not a note".into()).unwrap();
        create_block(
            &conn,
            &page.id,
            "code".into(),
            "let x = 1;".into(),
            None,
            None,
            None,
        )
        .unwrap();
        create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            "  ".into(),
            None,
            None,
            None,
        )
        .unwrap();
        create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            "First line".into(),
            None,
            None,
            None,
        )
        .unwrap();
        create_block(
            &conn,
            &page.id,
            "quote".into(),
            "Second".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let label =
            crate::db::labels::create_label(&conn, space.id.clone(), "Exam".into(), "#f00".into())
                .unwrap();
        crate::db::labels::attach_label(&conn, &page.id, &label.id).unwrap();

        let summaries = list_note_summaries(&conn, &space.id).unwrap();
        assert_eq!(summaries.len(), 2);
        let lecture = summaries.iter().find(|s| s.entity.id == page.id).unwrap();
        assert_eq!(lecture.preview, "First line\nSecond");
        assert_eq!(lecture.label_ids, vec![label.id]);
        assert!(lecture.last_edited_at >= lecture.entity.updated_at);
        let blank = summaries.iter().find(|s| s.entity.id == empty.id).unwrap();
        assert!(blank.preview.is_empty() && blank.label_ids.is_empty());
    }

    #[test]
    fn markdown_export_covers_every_block_type() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let page = create_page(&conn, space.id, "note", "Lecture 1".into()).unwrap();

        create_block(
            &conn,
            &page.id,
            "heading1".into(),
            "Intro".into(),
            None,
            None,
            None,
        )
        .unwrap();
        create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            "Some text.".into(),
            None,
            None,
            None,
        )
        .unwrap();
        create_block(
            &conn,
            &page.id,
            "code".into(),
            "fn main() {}".into(),
            None,
            Some("rust".into()),
            Some("main.rs".into()),
        )
        .unwrap();

        let markdown = render_page_markdown(&conn, &page.id).unwrap();
        assert!(markdown.contains("# Intro"));
        assert!(markdown.contains("Some text."));
        assert!(markdown.contains("```rust filename=\"main.rs\"\nfn main() {}\n```"));
    }

    #[test]
    fn reorder_changes_export_order() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let page = create_page(&conn, space.id, "note", "Lecture 1".into()).unwrap();

        let first = create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            "First".into(),
            None,
            None,
            None,
        )
        .unwrap();
        let second = create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            "Second".into(),
            None,
            None,
            None,
        )
        .unwrap();

        reorder_blocks(&conn, &page.id, vec![second.id, first.id]).unwrap();
        let markdown = render_page_markdown(&conn, &page.id).unwrap();
        assert!(markdown.find("Second").unwrap() < markdown.find("First").unwrap());
    }

    #[test]
    fn update_block_patches_only_given_fields() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let page = create_page(&conn, space.id, "note", "Lecture 1".into()).unwrap();
        let block = create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            "Intro".into(),
            None,
            None,
            None,
        )
        .unwrap();

        let content_only = update_block(
            &conn,
            &block.id,
            BlockPatch {
                content: Some("Intro.".into()),
                block_type: None,
                language: None,
                filename: None,
            },
        )
        .unwrap();
        assert_eq!(content_only.content, "Intro.");
        assert_eq!(content_only.block_type, "paragraph");

        let retyped = update_block(
            &conn,
            &block.id,
            BlockPatch {
                content: None,
                block_type: Some("heading1".into()),
                language: None,
                filename: None,
            },
        )
        .unwrap();
        assert_eq!(retyped.content, "Intro.");
        assert_eq!(retyped.block_type, "heading1");
    }

    #[test]
    fn list_mentioning_entities_finds_backlinks_and_excludes_self_and_deleted() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let target = create_page(&conn, space.id.clone(), "note", "Target".into()).unwrap();
        let mentioner = create_page(&conn, space.id.clone(), "note", "Mentioner".into()).unwrap();
        let deleted_mentioner =
            create_page(&conn, space.id.clone(), "note", "Deleted".into()).unwrap();
        let unrelated = create_page(&conn, space.id.clone(), "note", "Unrelated".into()).unwrap();

        create_block(
            &conn,
            &mentioner.id,
            "paragraph".into(),
            format!("See [Target](mention:{})", target.id),
            None,
            None,
            None,
        )
        .unwrap();
        create_block(
            &conn,
            &deleted_mentioner.id,
            "paragraph".into(),
            format!("See [Target](mention:{})", target.id),
            None,
            None,
            None,
        )
        .unwrap();
        create_block(
            &conn,
            &unrelated.id,
            "paragraph".into(),
            "No links here".into(),
            None,
            None,
            None,
        )
        .unwrap();
        crate::db::entities::soft_delete_entity(&conn, &deleted_mentioner.id).unwrap();

        let mentioning = list_mentioning_entities(&conn, &target.id).unwrap();
        assert_eq!(mentioning.len(), 1);
        assert_eq!(mentioning[0].id, mentioner.id);
    }

    #[test]
    fn block_to_markdown_renders_a_table_block() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let page = create_page(&conn, space.id, "note", "Doc".into()).unwrap();
        let block = create_block(
            &conn,
            &page.id,
            "table".into(),
            "Name\tAge\nAlice\t30\nBob\t25".into(),
            None,
            None,
            None,
        )
        .unwrap();

        let markdown = block_to_markdown(&block);
        assert_eq!(
            markdown,
            "| Name | Age |\n|---|---|\n| Alice | 30 |\n| Bob | 25 |"
        );
    }
}
