//! Export and import of one Note or Jot as a Nookly JSON file (`nookly-page`, version 1).
//!
//! The file holds the page's blocks with all their settings, so every block type ports
//! natively and does not pass through standard markdown. What belongs to one Nookly
//! instance does not travel: ids, timestamps, labels, relationships, the icon and the
//! Space. Mentions of other entities become plain text, and a block that points at a
//! File or another entity (images, files, bookmarks, entity cards) becomes a paragraph
//! with that item's name, since the file or entity does not exist for the reader.
//!
//! Import always creates a new page, never changes an existing one, and either lands
//! whole or not at all.

use crate::db::block_types::{self, BlockAttrs};
use crate::db::entities::Entity;
use crate::db::notes::{self, Block};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

pub const FORMAT: &str = "nookly-page";
pub const VERSION: u32 = 1;
/// The largest file an import reads.
pub const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct PageJson {
    pub format: String,
    pub version: u32,
    /// `note` or `jot`.
    pub kind: String,
    pub title: String,
    pub blocks: Vec<BlockJson>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct BlockJson {
    #[serde(rename = "type")]
    pub block_type: String,
    pub content: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub attrs: BlockAttrs,
}

static MENTION: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\[([^\]]*)\]\(mention:[a-zA-Z0-9-]+(?:#[a-zA-Z0-9_-]+)?\)").unwrap()
});

/// Mention links as their label, so a reference to another entity reads as plain text.
fn strip_mentions(text: &str) -> String {
    MENTION.replace_all(text, "$1").into_owned()
}

/// Block types whose whole content is a mention of a File: shared nowhere but on this
/// instance.
const FILE_BLOCKS: &[&str] = &["image", "video", "audio", "file"];
/// Block types whose whole content is a mention of another entity.
const ENTITY_BLOCKS: &[&str] = &["entity_card", "bookmark"];

fn paragraph(content: String) -> BlockJson {
    BlockJson {
        block_type: "paragraph".into(),
        content,
        language: None,
        filename: None,
        attrs: BlockAttrs::new(),
    }
}

/// One block as it travels. Anything that would only make sense on this instance is
/// turned into text or dropped, whatever the block type: a block type added later is
/// covered too, because mentions are stripped from its content and every attr.
fn export_block(block: &Block) -> BlockJson {
    let references_instance = FILE_BLOCKS.contains(&block.block_type.as_str())
        || ENTITY_BLOCKS.contains(&block.block_type.as_str());
    if references_instance {
        // A media block can also hold a plain URL, which any reader can open.
        let content = block.content.trim();
        if content.starts_with("http://") || content.starts_with("https://") {
            return BlockJson {
                block_type: block.block_type.clone(),
                content: content.to_string(),
                language: None,
                filename: None,
                attrs: export_attrs(&block.attrs),
            };
        }
        return paragraph(strip_mentions(content));
    }
    BlockJson {
        block_type: block.block_type.clone(),
        content: strip_mentions(&block.content),
        language: block.language.clone(),
        filename: block.filename.clone(),
        attrs: export_attrs(&block.attrs),
    }
}

fn export_attrs(attrs: &BlockAttrs) -> BlockAttrs {
    attrs
        .iter()
        .map(|(key, value)| (key.clone(), strip_mentions(value)))
        .collect()
}

/// The page as a `nookly-page` JSON document.
pub fn export_page_json(conn: &Connection, entity_id: &str) -> AppResult<String> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    if !matches!(entity.entity_type.as_str(), "note" | "jot") {
        return Err(AppError::InvalidInput(format!(
            "only a note or a jot can be exported this way, not a {}",
            entity.entity_type
        )));
    }
    let page = PageJson {
        format: FORMAT.into(),
        version: VERSION,
        kind: entity.entity_type,
        title: entity.title,
        blocks: notes::list_blocks(conn, entity_id)?
            .iter()
            .map(export_block)
            .collect(),
    };
    serde_json::to_string_pretty(&page).map_err(|e| AppError::Io(e.to_string()))
}

/// Reads and checks a document without touching the database.
fn parse(text: &str) -> AppResult<PageJson> {
    if text.len() as u64 > MAX_IMPORT_BYTES {
        return Err(AppError::InvalidInput(
            "this file is too large to import (the limit is 20 MB)".into(),
        ));
    }
    let page: PageJson = serde_json::from_str(text)
        .map_err(|e| AppError::InvalidInput(format!("this is not a Nookly page file ({e})")))?;
    if page.format != FORMAT {
        return Err(AppError::InvalidInput(format!(
            "this is not a Nookly page file (format \"{}\")",
            page.format
        )));
    }
    if page.version != VERSION {
        return Err(AppError::InvalidInput(format!(
            "this page file is version {}, and this version of Nookly reads version {VERSION}",
            page.version
        )));
    }
    if !matches!(page.kind.as_str(), "note" | "jot") {
        return Err(AppError::InvalidInput(format!(
            "this page file holds a \"{}\", not a note or a jot",
            page.kind
        )));
    }
    Ok(page)
}

/// Creates a new page in `space_id` from a `nookly-page` document. A block type this
/// version does not know becomes a paragraph, so its text survives. A block that does
/// not pass the usual checks for its type fails the whole import: nothing is created.
pub fn import_page_json(conn: &Connection, space_id: &str, text: &str) -> AppResult<Entity> {
    let page = parse(text)?;
    crate::db::atomically(conn, || {
        let entity =
            notes::create_page(conn, space_id.to_string(), &page.kind, page.title.clone())?;
        for (index, block) in page.blocks.iter().enumerate() {
            let known = is_known_type(&block.block_type);
            let (block_type, attrs, language, filename) = if known {
                (
                    block.block_type.clone(),
                    block.attrs.clone(),
                    block.language.clone(),
                    block.filename.clone(),
                )
            } else {
                ("paragraph".into(), BlockAttrs::new(), None, None)
            };
            notes::create_block_with_attrs(
                conn,
                &entity.id,
                block_type,
                block.content.clone(),
                None,
                language,
                filename,
                attrs,
            )
            .map_err(|e| match e {
                AppError::InvalidInput(reason) => {
                    AppError::InvalidInput(format!("block {}: {reason}", index + 1))
                }
                other => other,
            })?;
        }
        crate::db::entities::get_entity(conn, &entity.id)
    })
}

/// The standard block types and every registered custom one.
fn is_known_type(block_type: &str) -> bool {
    const STANDARD: &[&str] = &[
        "paragraph",
        "heading1",
        "heading2",
        "heading3",
        "heading4",
        "heading5",
        "heading6",
        "quote",
        "code",
        "bulleted_list",
        "numbered_list",
        "table",
    ];
    STANDARD.contains(&block_type) || block_types::lookup(block_type).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::notes::{create_block_with_attrs, list_blocks};

    struct Fixture {
        conn: Connection,
        space: String,
        other_space: String,
    }

    fn fixture() -> Fixture {
        let conn = crate::db::test_conn();
        let space =
            crate::db::spaces::create_space(&conn, "A".into(), None, "#000".into()).unwrap();
        let other =
            crate::db::spaces::create_space(&conn, "B".into(), None, "#111".into()).unwrap();
        Fixture {
            conn,
            space: space.id,
            other_space: other.id,
        }
    }

    fn add(fx: &Fixture, page: &str, block_type: &str, content: &str, attrs: &[(&str, &str)]) {
        create_block_with_attrs(
            &fx.conn,
            page,
            block_type.into(),
            content.into(),
            None,
            None,
            None,
            attrs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        )
        .unwrap();
    }

    fn entity_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM entities", [], |r| r.get(0))
            .unwrap()
    }

    /// Type, content, language, filename and attrs of every block, in order.
    fn shape(
        conn: &Connection,
        page: &str,
    ) -> Vec<(String, String, Option<String>, Option<String>, BlockAttrs)> {
        list_blocks(conn, page)
            .unwrap()
            .into_iter()
            .map(|b| (b.block_type, b.content, b.language, b.filename, b.attrs))
            .collect()
    }

    #[test]
    fn a_page_round_trips_into_another_space() {
        let fx = fixture();
        let target =
            notes::create_page(&fx.conn, fx.space.clone(), "note", "Target".into()).unwrap();
        let page =
            notes::create_page(&fx.conn, fx.space.clone(), "note", "Physics notes".into()).unwrap();
        let p = &page.id;
        add(&fx, p, "paragraph", "Waves **carry** energy.", &[]);
        add(&fx, p, "heading2", "Light", &[("toggle", "closed")]);
        let code = create_block_with_attrs(
            &fx.conn,
            p,
            "code".into(),
            "fn main() {}".into(),
            None,
            Some("rust".into()),
            Some("main.rs".into()),
            BlockAttrs::new(),
        )
        .unwrap();
        add(
            &fx,
            p,
            "callout",
            "Mind the units",
            &[("variant", "warning")],
        );
        add(&fx, p, "table", "Name\tAge\nAlice\t30", &[]);
        add(&fx, p, "math", "a^2 + b^2 &= c^2", &[("view", "rendered")]);
        add(&fx, p, "numbered_list", "one\ntwo", &[("marker", "a)")]);
        add(
            &fx,
            p,
            "paragraph",
            &format!(
                "See [the target note](mention:{}) and [a part](mention:{}#blk_1).",
                target.id, target.id
            ),
            &[],
        );

        let json = export_page_json(&fx.conn, p).unwrap();
        // Nothing that belongs to this instance travels.
        for private in [
            target.id.as_str(),
            p.as_str(),
            fx.space.as_str(),
            code.id.as_str(),
            "mention:",
            "createdAt",
            "labels",
        ] {
            assert!(!json.contains(private), "{private} leaked into {json}");
        }

        let imported = import_page_json(&fx.conn, &fx.other_space, &json).unwrap();
        assert_ne!(imported.id, *p);
        assert_eq!(imported.title, "Physics notes");
        assert_eq!(imported.entity_type, "note");
        assert_eq!(imported.space_id, fx.other_space);

        let mut expected = shape(&fx.conn, p);
        // Only the mentions became plain text.
        let last = expected.last_mut().unwrap();
        last.1 = "See the target note and a part.".into();
        assert_eq!(shape(&fx.conn, &imported.id), expected);
    }

    #[test]
    fn a_jot_stays_a_jot() {
        let fx = fixture();
        let jot = notes::create_page(&fx.conn, fx.space.clone(), "jot", "Quick".into()).unwrap();
        add(&fx, &jot.id, "paragraph", "a thought", &[]);
        let json = export_page_json(&fx.conn, &jot.id).unwrap();
        let imported = import_page_json(&fx.conn, &fx.space, &json).unwrap();
        assert_eq!(imported.entity_type, "jot");
    }

    #[test]
    fn the_file_has_the_documented_shape() {
        let fx = fixture();
        let page = notes::create_page(&fx.conn, fx.space.clone(), "note", "T".into()).unwrap();
        add(&fx, &page.id, "callout", "x", &[("variant", "tip")]);
        let value: serde_json::Value =
            serde_json::from_str(&export_page_json(&fx.conn, &page.id).unwrap()).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "format": "nookly-page",
                "version": 1,
                "kind": "note",
                "title": "T",
                "blocks": [
                    { "type": "callout", "content": "x", "language": null, "filename": null, "attrs": { "variant": "tip" } }
                ]
            })
        );
    }

    #[test]
    fn blocks_that_point_at_this_instance_become_text() {
        let fx = fixture();
        let file = crate::db::files::store_file(
            &fx.conn,
            &std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id())),
            fx.space.clone(),
            "slides.pdf",
            b"%PDF",
            None,
        )
        .unwrap();
        let other =
            notes::create_page(&fx.conn, fx.space.clone(), "note", "Elsewhere".into()).unwrap();
        let page = notes::create_page(&fx.conn, fx.space.clone(), "note", "P".into()).unwrap();
        let fid = &file.entity.id;
        for kind in ["file", "image", "video", "audio"] {
            add(
                &fx,
                &page.id,
                kind,
                &format!("[slides.pdf](mention:{fid})"),
                &[("caption", "Slides")],
            );
        }
        add(
            &fx,
            &page.id,
            "entity_card",
            &format!("[Elsewhere](mention:{})", other.id),
            &[],
        );
        add(
            &fx,
            &page.id,
            "bookmark",
            &format!("[Rust Book](mention:{})", other.id),
            &[],
        );
        // A plain URL works anywhere, so it stays a media block.
        add(
            &fx,
            &page.id,
            "image",
            "https://example.com/a.png",
            &[("caption", "Remote")],
        );
        add(&fx, &page.id, "embed", "https://example.com/video", &[]);

        let json = export_page_json(&fx.conn, &page.id).unwrap();
        assert!(!json.contains("mention:"), "{json}");
        let imported = import_page_json(&fx.conn, &fx.other_space, &json).unwrap();
        let blocks = shape(&fx.conn, &imported.id);
        for block in &blocks[..4] {
            assert_eq!(
                (block.0.as_str(), block.1.as_str()),
                ("paragraph", "slides.pdf")
            );
            assert!(block.4.is_empty());
        }
        assert_eq!(
            (blocks[4].0.as_str(), blocks[4].1.as_str()),
            ("paragraph", "Elsewhere")
        );
        assert_eq!(
            (blocks[5].0.as_str(), blocks[5].1.as_str()),
            ("paragraph", "Rust Book")
        );
        assert_eq!(blocks[6].0, "image");
        assert_eq!(blocks[6].1, "https://example.com/a.png");
        assert_eq!(
            blocks[6].4.get("caption").map(String::as_str),
            Some("Remote")
        );
        assert_eq!(blocks[7].0, "embed");
    }

    #[test]
    fn mentions_in_any_text_or_attr_are_stripped() {
        let fx = fixture();
        let other =
            notes::create_page(&fx.conn, fx.space.clone(), "note", "Elsewhere".into()).unwrap();
        let page = notes::create_page(&fx.conn, fx.space.clone(), "note", "P".into()).unwrap();
        let m = format!("[Elsewhere](mention:{})", other.id);
        add(&fx, &page.id, "bulleted_list", &format!("{m}\nplain"), &[]);
        add(&fx, &page.id, "heading1", &format!("About {m}"), &[]);
        add(&fx, &page.id, "table", &format!("A\tB\n{m}\tx"), &[]);
        add(
            &fx,
            &page.id,
            "timeline",
            &format!("2026-01-01\tStart {m}"),
            &[("title", &m)],
        );
        let json = export_page_json(&fx.conn, &page.id).unwrap();
        assert!(
            !json.contains("mention:") && !json.contains(&other.id),
            "{json}"
        );
        assert!(json.contains("About Elsewhere"));
    }

    #[test]
    fn every_block_type_exports_without_leaking_and_imports_back() {
        let fx = fixture();
        let page = notes::create_page(&fx.conn, fx.space.clone(), "note", "All".into()).unwrap();
        let other =
            notes::create_page(&fx.conn, fx.space.clone(), "note", "Elsewhere".into()).unwrap();
        let m = format!("[Elsewhere](mention:{})", other.id);
        // A sample for each type the editor offers; custom types come from the registry,
        // so a type added later fails here until it has a sample.
        let mut samples: Vec<(String, String)> = [
            ("paragraph", format!("text {m}")),
            ("heading1", "h".to_string()),
            ("heading3", "h".to_string()),
            ("quote", "q".to_string()),
            ("code", "x = 1".to_string()),
            ("bulleted_list", "a\nb".to_string()),
            ("numbered_list", "a\nb".to_string()),
            ("table", "A\tB\n1\t2".to_string()),
        ]
        .into_iter()
        .map(|(t, c)| (t.to_string(), c))
        .collect();
        for def in block_types::all() {
            let content = match def.block_type {
                "timeline" => "2026-01-01\tStart\n2026-02-01\tEnd".to_string(),
                "progress" => "Reading\t40\t100\nWriting\t10\t50".to_string(),
                "tree" => "Root\n  Child".to_string(),
                "steps" => "One\nTwo".to_string(),
                "stats" => "3.7\tGPA".to_string(),
                "details" => "Room\tB 204".to_string(),
                "checklist" => "[x] done\n[ ] todo".to_string(),
                "toggle" => "Question\nAnswer".to_string(),
                "equation" | "math" => "x^2".to_string(),
                "diagram" => "flowchart LR\n  A --> B".to_string(),
                "circuit" => "S = A ^ B".to_string(),
                "entity_card" | "bookmark" | "image" | "video" | "audio" | "file" => m.clone(),
                "embed" => "https://example.com".to_string(),
                "divider" | "callout" => String::new(),
                other => panic!("block type {other} needs a sample in this test"),
            };
            samples.push((def.block_type.to_string(), content));
        }
        for (block_type, content) in &samples {
            add(&fx, &page.id, block_type, content, &[]);
        }
        assert!(samples.len() > 20);

        let json = export_page_json(&fx.conn, &page.id).unwrap();
        assert!(
            !json.contains("mention:") && !json.contains(&other.id),
            "{json}"
        );
        let imported = import_page_json(&fx.conn, &fx.other_space, &json).unwrap();
        assert_eq!(
            list_blocks(&fx.conn, &imported.id).unwrap().len(),
            samples.len()
        );
    }

    #[test]
    fn an_unknown_block_type_becomes_a_paragraph() {
        let fx = fixture();
        let json = serde_json::json!({
            "format": "nookly-page", "version": 1, "kind": "note", "title": "From the future",
            "blocks": [{ "type": "hologram", "content": "still readable", "attrs": { "mode": "x" } }]
        })
        .to_string();
        let imported = import_page_json(&fx.conn, &fx.space, &json).unwrap();
        let blocks = shape(&fx.conn, &imported.id);
        assert_eq!(blocks.len(), 1);
        assert_eq!(
            (blocks[0].0.as_str(), blocks[0].1.as_str()),
            ("paragraph", "still readable")
        );
        assert!(blocks[0].4.is_empty());
    }

    #[test]
    fn bad_files_are_refused_and_create_nothing() {
        let fx = fixture();
        let before = entity_count(&fx.conn);
        let good = |patch: serde_json::Value| {
            let mut value = serde_json::json!({
                "format": "nookly-page", "version": 1, "kind": "note", "title": "T",
                "blocks": [{ "type": "paragraph", "content": "ok" }]
            });
            for (k, v) in patch.as_object().unwrap() {
                value[k] = v.clone();
            }
            value.to_string()
        };
        let bad = [
            good(serde_json::json!({ "format": "something-else" })),
            good(serde_json::json!({ "version": 2 })),
            good(serde_json::json!({ "kind": "task" })),
            "{ broken".to_string(),
            String::new(),
            "[]".to_string(),
            // A later block fails: nothing of the page may remain.
            good(serde_json::json!({ "blocks": [
                { "type": "paragraph", "content": "fine" },
                { "type": "callout", "content": "x", "attrs": { "variant": "nonsense" } }
            ]})),
            good(serde_json::json!({ "blocks": [
                { "type": "image", "content": "not a link or a url" }
            ]})),
            good(serde_json::json!({ "blocks": [
                { "type": "paragraph", "content": "x", "attrs": { "undeclared": "1" } }
            ]})),
        ];
        for text in &bad {
            let err = import_page_json(&fx.conn, &fx.space, text).unwrap_err();
            assert!(matches!(err, AppError::InvalidInput(_)), "{text}: {err:?}");
            assert_eq!(entity_count(&fx.conn), before, "{text}");
        }
    }

    #[test]
    fn an_oversize_file_is_refused() {
        let fx = fixture();
        let before = entity_count(&fx.conn);
        let huge = format!(
            "{{\"format\":\"nookly-page\",\"version\":1,\"kind\":\"note\",\"title\":\"{}\",\"blocks\":[]}}",
            "x".repeat(MAX_IMPORT_BYTES as usize)
        );
        assert!(matches!(
            import_page_json(&fx.conn, &fx.space, &huge),
            Err(AppError::InvalidInput(_))
        ));
        assert_eq!(entity_count(&fx.conn), before);
    }

    #[test]
    fn import_never_changes_an_existing_page_and_each_import_is_new() {
        let fx = fixture();
        let page = notes::create_page(&fx.conn, fx.space.clone(), "note", "Same".into()).unwrap();
        add(&fx, &page.id, "paragraph", "original", &[]);
        let before = shape(&fx.conn, &page.id);
        let json = export_page_json(&fx.conn, &page.id).unwrap();
        let first = import_page_json(&fx.conn, &fx.space, &json).unwrap();
        let second = import_page_json(&fx.conn, &fx.space, &json).unwrap();
        assert_ne!(first.id, second.id);
        assert_ne!(first.id, page.id);
        assert_eq!(shape(&fx.conn, &page.id), before);
    }

    #[test]
    fn only_notes_and_jots_export() {
        let fx = fixture();
        let task = crate::db::entities::create_entity(
            &fx.conn,
            fx.space.clone(),
            "task".into(),
            "T".into(),
            None,
        )
        .unwrap();
        assert!(matches!(
            export_page_json(&fx.conn, &task.id),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            export_page_json(&fx.conn, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn an_import_into_a_missing_space_is_refused_and_creates_nothing() {
        let fx = fixture();
        let before = entity_count(&fx.conn);
        let json = serde_json::json!({
            "format": "nookly-page", "version": 1, "kind": "note", "title": "T", "blocks": []
        })
        .to_string();
        assert!(import_page_json(&fx.conn, "no-such-space", &json).is_err());
        assert_eq!(entity_count(&fx.conn), before);
    }
}
