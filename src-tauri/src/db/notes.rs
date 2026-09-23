use crate::db::block_types::{self, BlockAttrs};
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
    /// Settings of a custom block (`block_types`), like a callout's `variant`.
    /// Always empty on the standard block types.
    pub attrs: BlockAttrs,
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
        attrs: row
            .get::<_, Option<String>>("attrs")?
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default(),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Creates the page entity. `page_type` lets Jots (§5.3) reuse the same
/// block storage under their own entity type rather than a dedicated schema.
pub fn create_page(
    conn: &Connection,
    space_id: String,
    page_type: &str,
    title: String,
) -> AppResult<Entity> {
    crate::db::entities::create_entity(conn, space_id, page_type.into(), title, None)
}

/// A live Note related to Jot `e` through any relationship, in either direction: the
/// Jot has been refined into it. Same rule as `PageSummary::linked`, so the sidebar
/// badge matches the list's "Unrefined" preset.
const LINKED_NOTE: &str = "SELECT 1 FROM relationships r JOIN entities t
           ON t.id = CASE WHEN r.from_entity_id = e.id THEN r.to_entity_id ELSE r.from_entity_id END
         WHERE (r.from_entity_id = e.id OR r.to_entity_id = e.id)
           AND t.type = 'note' AND t.deleted_at IS NULL";

/// Counts Jots with no linked Note (§ sidebar badges). Jots and Notes are linked via
/// the generic relationship system, not a dedicated pairing structure,
/// so this is an anti-join rather than a foreign-key check.
pub fn count_unrefined_jots(conn: &Connection, space_id: &str) -> AppResult<i64> {
    let count: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM entities e
         WHERE e.space_id = ?1 AND e.type = 'jot' AND e.deleted_at IS NULL
         AND NOT EXISTS ({LINKED_NOTE})"
        ),
        params![space_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Cross-Space sibling of `count_unrefined_jots`, for the Dashboard briefing.
pub fn count_unrefined_jots_all_spaces(conn: &Connection) -> AppResult<i64> {
    let count: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM entities e
         WHERE e.type = 'jot' AND e.deleted_at IS NULL
         AND NOT EXISTS ({LINKED_NOTE})"
        ),
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

/// One row of a page list (Notes or Jots): the entity plus what it
/// takes to recognize a page without opening it. Loaded in one call for the whole
/// Space so the list never fans out into a `list_blocks` per row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSummary {
    pub entity: Entity,
    /// Raw markdown of the leading text blocks, joined by `\n`, capped near
    /// `PREVIEW_CHARS`. The frontend strips inline markdown for display.
    pub preview: String,
    /// Latest block edit, falling back to the entity's own `updated_at` (same rule
    /// as `list_recent_notes`).
    pub last_edited_at: String,
    pub label_ids: Vec<String>,
    /// Jot rows only: every Note linked to this Jot through any relationship, in
    /// either direction. Trashed pages stay
    /// listed (rendered dimmed) like everywhere else a reference shows.
    pub linked: Vec<Entity>,
    /// Jot rows only: the most recent Session occurrence this page is
    /// related to, in either direction.
    pub session: Option<SessionContext>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContext {
    pub entity: Entity,
    pub date: String,
    pub start_time: String,
    pub course_id: Option<String>,
    pub course_title: Option<String>,
}

const PREVIEW_CHARS: usize = 280;

/// Block types whose content reads as prose in a preview; code, tables and media don't.
const PREVIEW_BLOCK_TYPES: &str =
    "'paragraph','heading1','heading2','heading3','quote','callout','bulleted_list','numbered_list'";

/// Relationship edges seen from `e`: `t` is whichever end isn't `e`.
const OTHER_END_JOIN: &str = "JOIN relationships r ON r.from_entity_id = e.id OR r.to_entity_id = e.id
     JOIN entities t ON t.id = CASE WHEN r.from_entity_id = e.id THEN r.to_entity_id ELSE r.from_entity_id END";

pub fn list_note_summaries(conn: &Connection, space_id: &str) -> AppResult<Vec<PageSummary>> {
    list_page_summaries(conn, space_id, "'note'")
}

/// Jots for their list page, with the linked Notes and Session context each row shows.
pub fn list_jot_summaries(conn: &Connection, space_id: &str) -> AppResult<Vec<PageSummary>> {
    let mut summaries = list_page_summaries(conn, space_id, "'jot'")?;
    let index = summary_index(&summaries);

    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT e.id AS owner_id, t.* FROM entities e {OTHER_END_JOIN}
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL AND e.type = 'jot'
           AND t.type = 'note'
         ORDER BY t.title COLLATE NOCASE ASC"
    ))?;
    let rows = stmt.query_map(params![space_id], |row| {
        Ok((row.get::<_, String>("owner_id")?, row_to_entity(row)?))
    })?;
    for row in rows {
        let (owner_id, entity) = row?;
        if let Some(&i) = index.get(&owner_id) {
            summaries[i].linked.push(entity);
        }
    }

    let mut stmt = conn.prepare(&format!(
        "SELECT e.id AS owner_id, t.*, s.date, s.start_time,
                c.id AS course_id, c.title AS course_title
         FROM entities e {OTHER_END_JOIN}
         JOIN sessions s ON s.entity_id = t.id
         LEFT JOIN relationships rc ON rc.from_entity_id = t.id AND rc.relationship_type = 'session-course'
         LEFT JOIN entities c ON c.id = rc.to_entity_id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL AND e.type = 'jot'
           AND t.type = 'session'
         ORDER BY s.date DESC, s.start_time DESC"
    ))?;
    let rows = stmt.query_map(params![space_id], |row| {
        Ok((
            row.get::<_, String>("owner_id")?,
            SessionContext {
                entity: row_to_entity(row)?,
                date: row.get("date")?,
                start_time: row.get("start_time")?,
                course_id: row.get("course_id")?,
                course_title: row.get("course_title")?,
            },
        ))
    })?;
    for row in rows {
        let (owner_id, session) = row?;
        if let Some(&i) = index.get(&owner_id) {
            summaries[i].session.get_or_insert(session);
        }
    }
    Ok(summaries)
}

fn summary_index(summaries: &[PageSummary]) -> std::collections::HashMap<String, usize> {
    summaries
        .iter()
        .enumerate()
        .map(|(i, s)| (s.entity.id.clone(), i))
        .collect()
}

/// `types_sql` is a fixed, quoted type list from the callers above, never user input.
fn list_page_summaries(
    conn: &Connection,
    space_id: &str,
    types_sql: &str,
) -> AppResult<Vec<PageSummary>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT e.*, COALESCE(MAX(b.updated_at, e.updated_at), e.updated_at) AS last_edited_at
         FROM entities e
         LEFT JOIN (SELECT entity_id, MAX(updated_at) AS updated_at FROM blocks GROUP BY entity_id) b
           ON b.entity_id = e.id
         WHERE e.space_id = ?1 AND e.type IN ({types_sql}) AND e.deleted_at IS NULL
         ORDER BY last_edited_at DESC"
    ))?;
    let mut summaries = stmt
        .query_map(params![space_id], |row| {
            Ok(PageSummary {
                entity: row_to_entity(row)?,
                preview: String::new(),
                last_edited_at: row.get("last_edited_at")?,
                label_ids: Vec::new(),
                linked: Vec::new(),
                session: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let index = summary_index(&summaries);

    let mut stmt = conn.prepare(&format!(
        "SELECT b.entity_id, b.content FROM blocks b JOIN entities e ON e.id = b.entity_id
         WHERE e.space_id = ?1 AND e.type IN ({types_sql}) AND e.deleted_at IS NULL
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

    let mut stmt = conn.prepare(&format!(
        "SELECT el.entity_id, el.label_id FROM entity_labels el
         JOIN entities e ON e.id = el.entity_id
         JOIN labels l ON l.id = el.label_id
         WHERE e.space_id = ?1 AND e.type IN ({types_sql}) AND e.deleted_at IS NULL
         ORDER BY l.name ASC"
    ))?;
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

/// Right sidebar's "Mentioned in" (§1.5): every *other* entity whose blocks hold an
/// inline `[title](mention:<entity_id>)` link to this one, read from the `mentions`
/// backlink index that `reindex_page` keeps in sync.
pub fn list_mentioning_entities(conn: &Connection, entity_id: &str) -> AppResult<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM mentions m JOIN entities e ON e.id = m.from_entity_id
         WHERE m.to_entity_id = ?1 AND e.deleted_at IS NULL AND e.id != ?1
         ORDER BY e.title COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map(params![entity_id], row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Same syntax as the frontend's `MENTION_PATTERN` (`mention-utils.ts`). A `#<blockId>`
/// suffix links one block of the page; the backlink still counts the whole page.
static MENTION_PATTERN: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
    regex::Regex::new(r"\[[^\]]+\]\(mention:([a-zA-Z0-9-]+)(?:#[a-zA-Z0-9_-]+)?\)").unwrap()
});

pub fn extract_mention_ids(content: &str) -> std::collections::BTreeSet<String> {
    MENTION_PATTERN
        .captures_iter(content)
        .map(|c| c[1].to_string())
        .collect()
}

/// Replaces this page's outgoing rows in the `mentions` backlink index.
fn sync_page_mentions(conn: &Connection, entity_id: &str, markdown: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM mentions WHERE from_entity_id = ?1",
        params![entity_id],
    )?;
    let mut stmt = conn
        .prepare("INSERT OR IGNORE INTO mentions (from_entity_id, to_entity_id) VALUES (?1, ?2)")?;
    for target in extract_mention_ids(markdown) {
        if target != entity_id {
            stmt.execute(params![entity_id, target])?;
        }
    }
    Ok(())
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

fn attrs_json(attrs: &BlockAttrs) -> Option<String> {
    (!attrs.is_empty()).then(|| serde_json::to_string(attrs).expect("string map always serializes"))
}

/// A block with no attrs, which is every standard block type.
#[cfg(test)]
pub fn create_block(
    conn: &Connection,
    entity_id: &str,
    block_type: String,
    content: String,
    position: Option<i64>,
    language: Option<String>,
    filename: Option<String>,
) -> AppResult<Block> {
    create_block_with_attrs(
        conn,
        entity_id,
        block_type,
        content,
        position,
        language,
        filename,
        BlockAttrs::new(),
    )
}

#[allow(clippy::too_many_arguments)]
pub fn create_block_with_attrs(
    conn: &Connection,
    entity_id: &str,
    block_type: String,
    content: String,
    position: Option<i64>,
    language: Option<String>,
    filename: Option<String>,
    attrs: BlockAttrs,
) -> AppResult<Block> {
    block_types::validate_attrs(&block_type, &attrs)?;
    block_types::validate_content(&block_type, &content)?;
    let mut merged = BlockAttrs::new();
    block_types::merge_attrs(&block_type, &mut merged, attrs);
    let attrs = merged;
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
        "INSERT INTO blocks (id, entity_id, position, block_type, content, language, filename, attrs, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![id, entity_id, position, block_type, content, language, filename, attrs_json(&attrs), now],
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
        attrs,
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
    /// Merged into the block's attrs; an empty value clears that attr. Keys the
    /// (possibly new) block type doesn't declare are dropped.
    #[serde(default)]
    pub attrs: Option<BlockAttrs>,
}

pub fn get_block(conn: &Connection, block_id: &str) -> AppResult<Block> {
    conn.query_row(
        "SELECT * FROM blocks WHERE id = ?1",
        params![block_id],
        row_to_block,
    )
    .map_err(|_| AppError::NotFound(format!("block {block_id}")))
}

pub fn update_block(conn: &Connection, block_id: &str, patch: BlockPatch) -> AppResult<Block> {
    let mut block = get_block(conn, block_id)?;
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
    let attrs_patch = patch.attrs.unwrap_or_default();
    block_types::validate_attrs(&block.block_type, &attrs_patch)?;
    block_types::validate_content(&block.block_type, &block.content)?;
    block_types::merge_attrs(&block.block_type, &mut block.attrs, attrs_patch);
    let now = super::now();
    conn.execute(
        "UPDATE blocks SET content = ?1, block_type = ?2, language = ?3, filename = ?4, attrs = ?5, updated_at = ?6 WHERE id = ?7",
        params![
            block.content,
            block.block_type,
            block.language,
            block.filename,
            attrs_json(&block.attrs),
            now,
            block_id
        ],
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
/// if not visually polished, export for any block. Custom blocks serialize through
/// their own `block_types` definition.
pub fn block_to_markdown(block: &Block) -> String {
    if let Some(def) = block_types::lookup(&block.block_type) {
        return (def.to_markdown)(block);
    }
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
    let markdown = blocks
        .iter()
        .map(block_to_markdown)
        .collect::<Vec<_>>()
        .join("\n\n");
    resolve_file_links(conn, &markdown)
}

/// Mention links to File entities (an image block, a file mentioned in text)
/// point at the file itself in an export: a `file://` URL for an imported copy,
/// the provider URL for a linked one. Mentions of Bookmarks point at their URL.
/// Every other mention stays as it is.
fn resolve_file_links(conn: &Connection, markdown: &str) -> AppResult<String> {
    static TARGET: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"\]\(mention:([a-zA-Z0-9-]+)\)").unwrap());
    let mut targets = std::collections::HashMap::new();
    for id in TARGET.captures_iter(markdown).map(|c| c[1].to_string()) {
        if targets.contains_key(&id) {
            continue;
        }
        let file = crate::db::files::get_file(conn, &id).ok();
        let target = match file {
            Some(f) => match (f.local_path, f.url) {
                (Some(path), _) => url::Url::from_file_path(&path).ok().map(|u| u.to_string()),
                (None, url) => url,
            },
            None => crate::db::bookmarks::get_bookmark(conn, &id)
                .ok()
                .map(|b| b.url),
        };
        targets.insert(id, target);
    }
    Ok(TARGET
        .replace_all(markdown, |caps: &regex::Captures| {
            match targets.get(&caps[1]) {
                Some(Some(target)) => format!("]({target})"),
                _ => caps[0].to_string(),
            }
        })
        .into_owned())
}

/// Search and the mention index read a custom block's raw content, not its
/// exported figure: the ASCII frame drops mention links and pads words with glyphs.
fn reindex_page(conn: &Connection, entity_id: &str) -> AppResult<()> {
    let text = list_blocks(conn, entity_id)?
        .iter()
        .map(|block| match block_types::lookup(&block.block_type) {
            Some(_) => block.content.replace('\t', " "),
            None => block_to_markdown(block),
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    sync_page_mentions(conn, entity_id, &text)?;
    crate::db::search::index_entity_content(conn, entity_id, &text)
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
// Notes and Jots (§5.2/§5.3) are both "page" entities backed by the same block
// storage, distinguished only by `entities.type`. One set of adapters, two
// registrations.

/// Pages (Notes/Jots) have no `--field` values of their own — deliberately: an
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
        description: "A quick, unrefined capture. Link it to the `note` it was refined into via `relates-to`.",
        fields: &[],
        relationship_types: &["relates-to"],
        create: cli_create_jot,
        update: cli_update_page,
        get: cli_get_page,
        list: cli_list_jots,
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
    fn jot_summaries_carry_links_sessions_and_unrefined_count() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let jot = create_page(&conn, space.id.clone(), "jot", "".into()).unwrap();
        let loose = create_page(&conn, space.id.clone(), "jot", "".into()).unwrap();
        let note = create_page(&conn, space.id.clone(), "note", "Polished".into()).unwrap();
        let other = create_page(&conn, space.id.clone(), "note", "Unrelated".into()).unwrap();
        let course =
            crate::db::courses::create_course(&conn, space.id.clone(), "Algorithms".into())
                .unwrap();
        let session = crate::db::sessions::create_one_off_session(
            &conn,
            space.id.clone(),
            "Lecture".into(),
            course.id.clone(),
            "2026-09-21".into(),
            "10:00".into(),
            "11:30".into(),
            None,
        )
        .unwrap();
        // Note to Jot, so the reverse direction has to count as a link too.
        crate::db::relationships::create_relationship(
            &conn,
            note.id.clone(),
            jot.id.clone(),
            "relates-to".into(),
            None,
            None,
        )
        .unwrap();
        crate::db::relationships::create_relationship(
            &conn,
            jot.id.clone(),
            session.entity.id.clone(),
            "relates-to".into(),
            None,
            None,
        )
        .unwrap();
        // Jot to Jot is not a refinement.
        crate::db::relationships::create_relationship(
            &conn,
            loose.id.clone(),
            jot.id.clone(),
            "relates-to".into(),
            None,
            None,
        )
        .unwrap();

        let summaries = list_jot_summaries(&conn, &space.id).unwrap();
        assert_eq!(summaries.len(), 2);
        let linked_jot = summaries.iter().find(|s| s.entity.id == jot.id).unwrap();
        assert_eq!(linked_jot.linked.len(), 1);
        assert_eq!(linked_jot.linked[0].id, note.id);
        let context = linked_jot.session.as_ref().unwrap();
        assert_eq!(context.entity.id, session.entity.id);
        assert_eq!(context.course_title.as_deref(), Some("Algorithms"));
        let alone = summaries.iter().find(|s| s.entity.id == loose.id).unwrap();
        assert!(alone.linked.is_empty() && alone.session.is_none());
        assert_eq!(count_unrefined_jots(&conn, &space.id).unwrap(), 1);
        assert!(summaries.iter().all(|s| s.entity.id != other.id));
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
                attrs: None,
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
                attrs: None,
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
    fn mention_index_follows_block_edits_and_deletes() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let target = create_page(&conn, space.id.clone(), "note", "Target".into()).unwrap();
        let mentioner = create_page(&conn, space.id.clone(), "note", "Mentioner".into()).unwrap();
        let link = format!("See [Target](mention:{})", target.id);

        let first = create_block(
            &conn,
            &mentioner.id,
            "paragraph".into(),
            link.clone(),
            None,
            None,
            None,
        )
        .unwrap();
        let second = create_block(
            &conn,
            &mentioner.id,
            "paragraph".into(),
            link,
            None,
            None,
            None,
        )
        .unwrap();
        assert_eq!(
            list_mentioning_entities(&conn, &target.id).unwrap().len(),
            1
        );

        update_block(
            &conn,
            &first.id,
            BlockPatch {
                content: Some("No link anymore".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            list_mentioning_entities(&conn, &target.id).unwrap().len(),
            1
        );

        delete_block(&conn, &second.id).unwrap();
        assert!(list_mentioning_entities(&conn, &target.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn export_points_file_mentions_at_the_file() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let page = create_page(&conn, space.id.clone(), "note", "Doc".into()).unwrap();
        let other = create_page(&conn, space.id.clone(), "note", "Other".into()).unwrap();
        let file = crate::db::files::create_file_link(
            &conn,
            space.id,
            "Slides".into(),
            "https://example.com/slides.pdf".into(),
        )
        .unwrap();
        create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            format!(
                "See [Slides](mention:{}) and [Other](mention:{})",
                file.entity.id, other.id
            ),
            None,
            None,
            None,
        )
        .unwrap();

        let markdown = render_page_markdown(&conn, &page.id).unwrap();
        assert!(markdown.contains("[Slides](https://example.com/slides.pdf)"));
        assert!(markdown.contains(&format!("[Other](mention:{})", other.id)));
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
