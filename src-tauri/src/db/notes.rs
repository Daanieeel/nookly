use crate::db::entities::Entity;
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

pub fn list_blocks(conn: &Connection, entity_id: &str) -> AppResult<Vec<Block>> {
    let mut stmt =
        conn.prepare("SELECT * FROM blocks WHERE entity_id = ?1 ORDER BY position ASC")?;
    let rows = stmt.query_map(params![entity_id], row_to_block)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create_block(
    conn: &Connection,
    entity_id: &str,
    block_type: String,
    content: String,
    position: Option<i64>,
) -> AppResult<Block> {
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
        "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, entity_id, position, block_type, content, now],
    )?;
    reindex_page(conn, entity_id)?;
    Ok(Block {
        id,
        entity_id: entity_id.into(),
        position,
        block_type,
        content,
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
    let now = super::now();
    conn.execute(
        "UPDATE blocks SET content = ?1, block_type = ?2, updated_at = ?3 WHERE id = ?4",
        params![block.content, block.block_type, now, block_id],
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
        "code" => format!("```\n{}\n```", block.content),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_export_covers_every_block_type() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space =
            crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let page = create_page(&conn, space.id, "note", "Lecture 1".into()).unwrap();

        create_block(&conn, &page.id, "heading1".into(), "Intro".into(), None).unwrap();
        create_block(
            &conn,
            &page.id,
            "paragraph".into(),
            "Some text.".into(),
            None,
        )
        .unwrap();
        create_block(&conn, &page.id, "code".into(), "fn main() {}".into(), None).unwrap();

        let markdown = render_page_markdown(&conn, &page.id).unwrap();
        assert!(markdown.contains("# Intro"));
        assert!(markdown.contains("Some text."));
        assert!(markdown.contains("```\nfn main() {}\n```"));
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

        let first =
            create_block(&conn, &page.id, "paragraph".into(), "First".into(), None).unwrap();
        let second =
            create_block(&conn, &page.id, "paragraph".into(), "Second".into(), None).unwrap();

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
        let block =
            create_block(&conn, &page.id, "paragraph".into(), "Intro".into(), None).unwrap();

        let content_only = update_block(
            &conn,
            &block.id,
            BlockPatch {
                content: Some("Intro.".into()),
                block_type: None,
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
            },
        )
        .unwrap();
        assert_eq!(retyped.content, "Intro.");
        assert_eq!(retyped.block_type, "heading1");
    }
}
