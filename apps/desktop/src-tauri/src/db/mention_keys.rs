//! Mentions are stored with the id of what they point at, `[Title](mention:<id>)`, which
//! survives renames. People see the short key instead (`JOT-12`), so a mention written out
//! as text uses it, and a mention typed or pasted with a key is turned into its id before it
//! is saved. Both forms open the same page and count as the same backlink.

use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::sync::LazyLock;

/// Blocks that hold source text, which must stay exactly as written: a mention shaped
/// string inside a code block is code, not a link.
const VERBATIM_BLOCK_TYPES: &[&str] = &["code", "equation", "math", "diagram", "circuit", "plot"];

/// `](mention:JOT-12)` or `](mention:JOT-12#blockId)`, in any case.
static KEY_TARGET: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\]\(mention:([A-Za-z]{3}-[0-9]+)((?:#[a-zA-Z0-9_-]+)?)\)").unwrap()
});

/// `](mention:<anything>` up to its end, with the optional `#fragment` kept apart.
static ANY_TARGET: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\]\(mention:([a-zA-Z0-9-]+)((?:#[a-zA-Z0-9_-]+)?)\)").unwrap()
});

/// Whether a block of this type holds text where a mention is a mention.
pub fn holds_mentions(block_type: &str) -> bool {
    !VERBATIM_BLOCK_TYPES.contains(&block_type)
}

/// `content` with every mention written with a key turned into the id of its entity. A key
/// that matches nothing stays as written, so nothing a person typed is dropped.
pub fn keys_to_ids(conn: &Connection, content: &str) -> AppResult<String> {
    if !KEY_TARGET.is_match(content) {
        return Ok(content.to_string());
    }
    let mut ids: HashMap<String, Option<String>> = HashMap::new();
    for caps in KEY_TARGET.captures_iter(content) {
        if let Entry::Vacant(slot) = ids.entry(caps[1].to_ascii_uppercase()) {
            let id = id_of_key(conn, slot.key())?;
            slot.insert(id);
        }
    }
    Ok(KEY_TARGET
        .replace_all(content, |caps: &regex::Captures| {
            match ids.get(&caps[1].to_ascii_uppercase()) {
                Some(Some(id)) => format!("](mention:{id}{})", &caps[2]),
                _ => caps[0].to_string(),
            }
        })
        .into_owned())
}

/// `content` with every mention of an entity written with its key. A target that is not an
/// entity stays as it is.
pub fn ids_to_keys(conn: &Connection, content: &str) -> AppResult<String> {
    if !ANY_TARGET.is_match(content) {
        return Ok(content.to_string());
    }
    let mut keys: HashMap<String, Option<String>> = HashMap::new();
    for caps in ANY_TARGET.captures_iter(content) {
        if let Entry::Vacant(slot) = keys.entry(caps[1].to_string()) {
            let key = key_of_id(conn, slot.key())?;
            slot.insert(key);
        }
    }
    Ok(ANY_TARGET
        .replace_all(content, |caps: &regex::Captures| match keys.get(&caps[1]) {
            Some(Some(key)) => format!("](mention:{key}{})", &caps[2]),
            _ => caps[0].to_string(),
        })
        .into_owned())
}

fn id_of_key(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let Some((prefix, number)) = key.split_once('-') else {
        return Ok(None);
    };
    Ok(conn
        .query_row(
            "SELECT id FROM entities WHERE key_prefix = ?1 AND key_number = ?2",
            params![prefix, number.parse::<i64>().unwrap_or(0)],
            |row| row.get(0),
        )
        .optional()?)
}

fn key_of_id(conn: &Connection, id: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT key_prefix || '-' || key_number FROM entities WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::notes::{
        create_block, create_page, list_blocks, list_mentioning_entities, render_page_markdown,
        update_block, BlockPatch,
    };

    struct Fixture {
        conn: Connection,
        target: crate::db::entities::Entity,
        page: crate::db::entities::Entity,
    }

    fn fixture() -> Fixture {
        let conn = crate::db::test_conn();
        let space = crate::db::test_space(&conn, "Study");
        let target =
            create_page(&conn, space.id.clone(), "jot", "Lecture, 29. Okt.".into()).unwrap();
        let page = create_page(&conn, space.id, "note", "Summary".into()).unwrap();
        Fixture { conn, target, page }
    }

    fn add(f: &Fixture, block_type: &str, content: &str) -> crate::db::notes::Block {
        create_block(
            &f.conn,
            &f.page.id,
            block_type.into(),
            content.into(),
            None,
            None,
            None,
        )
        .unwrap()
    }

    #[test]
    fn a_mention_with_a_key_is_saved_with_the_id() {
        let f = fixture();
        let block = add(
            &f,
            "paragraph",
            &format!("See [Lecture](mention:{})", f.target.key),
        );
        assert_eq!(
            block.content,
            format!("See [Lecture](mention:{})", f.target.id)
        );
        assert_eq!(
            list_blocks(&f.conn, &f.page.id).unwrap()[0].content,
            block.content
        );
    }

    #[test]
    fn the_key_is_read_in_any_case_and_keeps_a_block_fragment() {
        let f = fixture();
        let key = f.target.key.to_lowercase();
        let block = add(
            &f,
            "paragraph",
            &format!("[Lecture](mention:{key}#blk_abc1)"),
        );
        assert_eq!(
            block.content,
            format!("[Lecture](mention:{}#blk_abc1)", f.target.id)
        );
    }

    #[test]
    fn an_edit_with_a_key_is_saved_with_the_id() {
        let f = fixture();
        let block = add(&f, "paragraph", "plain");
        let updated = update_block(
            &f.conn,
            &block.id,
            BlockPatch {
                content: Some(format!("[Lecture](mention:{})", f.target.key)),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            updated.content,
            format!("[Lecture](mention:{})", f.target.id)
        );
    }

    #[test]
    fn a_card_or_file_block_takes_a_key_too() {
        let f = fixture();
        let card = add(
            &f,
            "entity_card",
            &format!("[Lecture](mention:{})", f.target.key),
        );
        assert_eq!(card.content, format!("[Lecture](mention:{})", f.target.id));
    }

    #[test]
    fn a_key_that_matches_nothing_stays_as_written() {
        let f = fixture();
        let block = add(
            &f,
            "paragraph",
            "[Gone](mention:JOT-9999) and [Odd](mention:ab-12)",
        );
        assert_eq!(
            block.content,
            "[Gone](mention:JOT-9999) and [Odd](mention:ab-12)"
        );
    }

    #[test]
    fn a_mention_with_an_id_is_saved_as_it_was() {
        let f = fixture();
        let content = format!(
            "[Lecture](mention:{}) and [Other](mention:{}#blk_1)",
            f.target.id, f.page.id
        );
        assert_eq!(add(&f, "paragraph", &content).content, content);
    }

    #[test]
    fn source_blocks_keep_what_was_typed() {
        let f = fixture();
        let content = format!("[Lecture](mention:{})", f.target.key);
        for block_type in ["code", "equation", "diagram"] {
            assert_eq!(add(&f, block_type, &content).content, content);
        }
    }

    #[test]
    fn both_forms_count_as_the_same_backlink() {
        let f = fixture();
        add(
            &f,
            "paragraph",
            &format!("[Lecture](mention:{})", f.target.key),
        );
        add(
            &f,
            "paragraph",
            &format!("[Lecture](mention:{})", f.target.id),
        );
        let mentioning = list_mentioning_entities(&f.conn, &f.target.id).unwrap();
        assert_eq!(mentioning.len(), 1);
        assert_eq!(mentioning[0].id, f.page.id);
    }

    #[test]
    fn a_rename_leaves_the_mention_and_its_key_alone() {
        let f = fixture();
        add(
            &f,
            "paragraph",
            &format!("[Lecture, 29. Okt.](mention:{})", f.target.id),
        );
        crate::db::entities::update_entity(
            &f.conn,
            &f.target.id,
            crate::db::entities::EntityPatch {
                title: Some("Renamed".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let markdown = render_page_markdown(&f.conn, &f.page.id).unwrap();
        assert_eq!(markdown, format!("[Renamed](mention:{})", f.target.key));
        assert_eq!(
            list_mentioning_entities(&f.conn, &f.target.id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn markdown_writes_a_mention_with_the_key() {
        let f = fixture();
        add(
            &f,
            "paragraph",
            &format!("[Lecture](mention:{}#blk_1)", f.target.id),
        );
        add(&f, "paragraph", &format!("[Old](mention:{})", f.target.id));
        let markdown = render_page_markdown(&f.conn, &f.page.id).unwrap();
        assert_eq!(
            markdown,
            format!(
                "[Lecture](mention:{key}#blk_1)\n\n[Old](mention:{key})",
                key = f.target.key
            )
        );
        // What is stored does not change.
        assert!(list_blocks(&f.conn, &f.page.id).unwrap()[0]
            .content
            .contains(&f.target.id));
    }

    #[test]
    fn mentions_made_before_the_keys_still_resolve() {
        let f = fixture();
        // Written straight into the table, as an earlier release stored it.
        f.conn
            .execute(
                "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at)
                 VALUES ('old', ?1, 0, 'paragraph', ?2, 'now', 'now')",
                params![f.page.id, format!("[Lecture](mention:{})", f.target.id)],
            )
            .unwrap();
        assert_eq!(
            ids_to_keys(&f.conn, &format!("[Lecture](mention:{})", f.target.id)).unwrap(),
            format!("[Lecture](mention:{})", f.target.key)
        );
        assert_eq!(
            keys_to_ids(&f.conn, &format!("[Lecture](mention:{})", f.target.id)).unwrap(),
            format!("[Lecture](mention:{})", f.target.id)
        );
    }

    #[test]
    fn text_without_a_mention_is_untouched() {
        let f = fixture();
        for text in [
            "",
            "plain JOT-12",
            "[site](https://x.dev)",
            "(mention:JOT-1)",
        ] {
            assert_eq!(keys_to_ids(&f.conn, text).unwrap(), text);
            assert_eq!(ids_to_keys(&f.conn, text).unwrap(), text);
        }
    }
}
