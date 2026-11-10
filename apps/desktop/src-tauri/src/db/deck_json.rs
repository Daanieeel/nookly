//! Export and import of one Deck as a Nookly JSON file (`nookly-deck`, version 2).
//!
//! The file holds the Deck's title and its cards. A card written as text carries its
//! `front` and `back` as written (inline markdown); one written with blocks carries
//! `frontBlocks` and `backBlocks` instead. The images those blocks show travel inside the
//! file as base64, once per File however many cards use it, and the image blocks point at
//! them by a key of the file (`[cell.png](mention:file1)`). Scheduling and review state stay
//! behind: when a card is due, how well it is known and its review history belong to the
//! person who studied it. Imported cards start as new ones, due now. Which Exam the Deck is
//! filed under, its labels and its Space do not travel either; the import dialog can file
//! the new Deck under an Exam like any other relation.
//!
//! An image that is not a File of Nookly (a web address stays as it is; the full path of a
//! file on this computer cannot travel) or whose File is missing or unreadable becomes a
//! paragraph with its name, as in a page. Version 1 files, without blocks or images, still
//! import.
//!
//! Import creates a new Deck, and the images as new Files in the same Space, and never
//! changes an existing one. It lands whole or not at all, Files included.

use crate::db::decks::{self, Face};
use crate::db::entities::Entity;
use crate::db::page_json::BlockJson;
use crate::db::portable::{
    first_line, parse_document_versions, Exported, Importer, PortableDef, PortablePreview,
    PreviewItem,
};
use crate::db::portable_files::{self, Embedded, FileFile, Stored};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const FORMAT: &str = "nookly-deck";
pub const VERSION: u32 = 2;
/// Versions this reads, newest last.
const READS: &[u32] = &[1, 2];

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeckFile {
    format: String,
    version: u32,
    /// Always `deck`.
    kind: String,
    title: String,
    cards: Vec<CardFile>,
    /// The images the cards' blocks show. Version 2 on.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    files: Vec<FileFile>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CardFile {
    /// Text of a side written as text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    front: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    back: Option<String>,
    /// Blocks of a side written with blocks. Version 2 on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    front_blocks: Option<Vec<BlockJson>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    back_blocks: Option<Vec<BlockJson>>,
}

/// The Deck as a `nookly-deck` JSON document: its cards in order, without the ones in the
/// trash.
#[cfg(test)]
pub fn export_deck_json(conn: &Connection, entity_id: &str) -> AppResult<String> {
    Ok(export_deck(conn, entity_id)?.json)
}

/// `export_deck_json` that also says which images could not go in the file.
pub fn export_deck(conn: &Connection, entity_id: &str) -> AppResult<Exported> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    if entity.entity_type != "index_card_deck" {
        return Err(AppError::InvalidInput(format!(
            "only a deck can be exported this way, not a {}",
            entity.entity_type
        )));
    }
    let mut embedded = Embedded::default();
    let mut side = |text: String, blocks: Option<Vec<BlockJson>>| match blocks {
        Some(blocks) => blocks
            .iter()
            .map(|b| embedded.json_block(conn, b))
            .collect::<AppResult<Vec<_>>>()
            .map(|blocks| (None, Some(blocks))),
        None => Ok((Some(text), None)),
    };
    let mut cards = Vec::new();
    for c in decks::list_cards(conn, entity_id, false)? {
        let (front, front_blocks) = side(c.front, c.front_blocks)?;
        let (back, back_blocks) = side(c.back, c.back_blocks)?;
        cards.push(CardFile {
            front,
            back,
            front_blocks,
            back_blocks,
        });
    }
    let file = DeckFile {
        format: FORMAT.into(),
        version: VERSION,
        kind: "deck".into(),
        title: entity.title,
        cards,
        files: embedded.take_files(),
    };
    embedded.finish("deck", &file)
}

/// The side of card `number` as a face, from its text or its blocks.
fn face_of(
    number: usize,
    side: &str,
    text: Option<String>,
    blocks: Option<Vec<BlockJson>>,
) -> AppResult<Face> {
    Face::given(text, blocks).ok_or_else(|| {
        AppError::InvalidInput(format!(
            "this deck file is not valid (card {number} has no {side})"
        ))
    })
}

fn is_blank(text: &Option<String>, blocks: &Option<Vec<BlockJson>>) -> bool {
    text.as_deref().is_none_or(|t| t.trim().is_empty())
        && blocks
            .as_deref()
            .is_none_or(|b| b.iter().all(|b| b.content.trim().is_empty()))
}

/// Reads and checks a document without touching the database.
fn parse(text: &str) -> AppResult<DeckFile> {
    let file: DeckFile = parse_document_versions(text, FORMAT, READS, "deck")?;
    if file.kind != "deck" {
        return Err(AppError::InvalidInput(format!(
            "this deck file holds a \"{}\", not a deck",
            file.kind
        )));
    }
    for (index, card) in file.cards.iter().enumerate() {
        let number = index + 1;
        if file.version == 1 && (card.front_blocks.is_some() || card.back_blocks.is_some()) {
            return Err(AppError::InvalidInput(format!(
                "this deck file is not valid (card {number} has blocks, which a version 1 file cannot hold)"
            )));
        }
        if is_blank(&card.front, &card.front_blocks) && is_blank(&card.back, &card.back_blocks) {
            return Err(AppError::InvalidInput(format!(
                "card {number} is empty: it needs a front or a back"
            )));
        }
        face_of(
            number,
            "front",
            card.front.clone(),
            card.front_blocks.clone(),
        )?;
        face_of(number, "back", card.back.clone(), card.back_blocks.clone())?;
    }
    portable_files::check_version("deck", file.version, &file.files)?;
    Ok(file)
}

/// Creates a new Deck, with its cards as new cards, in `space_id` from a `nookly-deck`
/// document. Images are stored in the app's files folder.
pub fn import_deck_json(conn: &Connection, space_id: &str, text: &str) -> AppResult<Entity> {
    import_deck_json_into(conn, &portable_files::files_dir()?, space_id, text)
}

/// `import_deck_json` with the folder the images are stored in. If anything fails, the
/// files already written are removed again.
pub fn import_deck_json_into(
    conn: &Connection,
    files_dir: &Path,
    space_id: &str,
    text: &str,
) -> AppResult<Entity> {
    let file = parse(text)?;
    let used = used_keys(&file);
    portable_files::import_with_files(
        conn,
        files_dir,
        space_id,
        "deck",
        &file.files,
        &used,
        |stored| {
            let deck = decks::create_deck(conn, space_id.to_string(), file.title.clone(), None)?;
            for (index, card) in file.cards.iter().enumerate() {
                let number = index + 1;
                let front =
                    imported_face(number, "front", &card.front, &card.front_blocks, stored)?;
                let back = imported_face(number, "back", &card.back, &card.back_blocks, stored)?;
                decks::create_card(conn, deck.id.clone(), front, back)?;
            }
            crate::db::entities::get_entity(conn, &deck.id)
        },
    )
}

/// The keys of the files that an image block of some card shows.
fn used_keys(file: &DeckFile) -> std::collections::HashSet<String> {
    portable_files::used_keys(
        file.cards
            .iter()
            .flat_map(|c| [&c.front_blocks, &c.back_blocks])
            .flatten()
            .flatten(),
    )
}

/// A side of an imported card: its text, or its blocks with every image pointed at the
/// new File made for it. An image of a file the document does not hold refuses the import.
fn imported_face(
    number: usize,
    side: &str,
    text: &Option<String>,
    blocks: &Option<Vec<BlockJson>>,
    stored: &Stored,
) -> AppResult<Face> {
    let Some(blocks) = blocks else {
        return face_of(number, side, text.clone(), None);
    };
    let whose = format!("the {side} of card {number}");
    Ok(Face::Blocks(stored.point(blocks, "deck", &whose)?))
}

/// What a side reads as in the import dialog: its text, or the text of its blocks.
fn preview_text(text: &Option<String>, blocks: &Option<Vec<BlockJson>>) -> String {
    if let Some(blocks) = blocks {
        return blocks
            .iter()
            .map(|b| {
                if b.block_type == "image" {
                    match portable_files::FILE_MENTION.captures(b.content.trim()) {
                        Some(caps) if !caps[1].is_empty() => format!("Image: {}", &caps[1]),
                        _ => "Image".to_string(),
                    }
                } else {
                    crate::db::page_json::strip_mentions(&b.content)
                }
            })
            .filter(|t| !t.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
    }
    text.clone().unwrap_or_default()
}

fn preview(text: &str) -> AppResult<PortablePreview> {
    let file = parse(text)?;
    let items: Vec<PreviewItem> = file
        .cards
        .iter()
        .map(|c| {
            let mut shown = preview_text(&c.front, &c.front_blocks);
            if shown.trim().is_empty() {
                shown = preview_text(&c.back, &c.back_blocks);
            }
            PreviewItem {
                label: "Card".into(),
                text: first_line(&shown),
                converted: false,
            }
        })
        .collect();
    let mut facts = vec!["Cards arrive as new, with no review history".to_string()];
    facts.extend(portable_files::files_fact(used_keys(&file).len(), "image"));
    Ok(PortablePreview {
        format: FORMAT.into(),
        kind: "deck".into(),
        title: file.title,
        facts,
        count: items.len(),
        count_label: "card".into(),
        items,
        converted: 0,
        parent_type: None,
    })
}

inventory::submit! {
    PortableDef { entity_type: "index_card_deck", format: FORMAT, version: VERSION, parent_type: None, noun: "deck", max_bytes: crate::db::portable::MAX_IMPORT_BYTES, export: export_deck, preview, import: Importer::Plain(import_deck_json) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::decks::{create_card, create_deck, list_cards, review_card};
    use crate::db::{fixture, Fixture};
    use rs_fsrs::Rating;
    use std::path::{Path, PathBuf};

    fn entity_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM entities", [], |r| r.get(0))
            .unwrap()
    }

    fn card_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM index_cards", [], |r| r.get(0))
            .unwrap()
    }

    fn studied_deck(fx: &Fixture) -> Entity {
        let deck = create_deck(&fx.conn, fx.space.clone(), "Physics terms".into(), None).unwrap();
        let first = create_card(
            &fx.conn,
            deck.id.clone(),
            "Force".into(),
            "mass $\\times$ acceleration".into(),
        )
        .unwrap();
        create_card(
            &fx.conn,
            deck.id.clone(),
            "Energy".into(),
            "**capacity** to do work".into(),
        )
        .unwrap();
        let gone = create_card(&fx.conn, deck.id.clone(), "Trashed".into(), "no".into()).unwrap();
        review_card(&fx.conn, &first.id, Rating::Good).unwrap();
        decks::delete_card(&fx.conn, &gone.id).unwrap();
        deck
    }

    #[test]
    fn a_deck_round_trips_its_cards_into_another_space_as_new_cards() {
        let fx = fixture();
        let deck = studied_deck(&fx);
        let json = export_deck_json(&fx.conn, &deck.id).unwrap();
        for private in [
            deck.id.as_str(),
            fx.space.as_str(),
            "dueAt",
            "due_at",
            "stability",
            "reps",
            "Trashed",
            "createdAt",
        ] {
            assert!(!json.contains(private), "{private} leaked into {json}");
        }

        let imported = import_deck_json(&fx.conn, &fx.other_space, &json).unwrap();
        assert_ne!(imported.id, deck.id);
        assert_eq!(imported.entity_type, "index_card_deck");
        assert_eq!(imported.title, "Physics terms");
        assert_eq!(imported.space_id, fx.other_space);

        let cards = list_cards(&fx.conn, &imported.id, false).unwrap();
        let shape: Vec<(&str, &str)> = cards
            .iter()
            .map(|c| (c.front.as_str(), c.back.as_str()))
            .collect();
        assert_eq!(
            shape,
            vec![
                ("Force", "mass $\\times$ acceleration"),
                ("Energy", "**capacity** to do work")
            ]
        );
        // New cards: no progress came along.
        assert!(cards
            .iter()
            .all(|c| c.state == "new" && c.reps == 0 && c.last_review_at.is_none()));
        assert_eq!(export_deck_json(&fx.conn, &imported.id).unwrap(), json);
    }

    #[test]
    fn importing_leaves_the_original_deck_and_its_progress_alone() {
        let fx = fixture();
        let deck = studied_deck(&fx);
        let before = list_cards(&fx.conn, &deck.id, false).unwrap();
        let json = export_deck_json(&fx.conn, &deck.id).unwrap();
        import_deck_json(&fx.conn, &fx.space, &json).unwrap();
        import_deck_json(&fx.conn, &fx.space, &json).unwrap();
        let after = list_cards(&fx.conn, &deck.id, false).unwrap();
        assert_eq!(before.len(), after.len());
        assert_eq!(before[0].reps, after[0].reps);
        assert_eq!(before[0].due_at, after[0].due_at);
        assert_eq!(before[0].stability, after[0].stability);
    }

    #[test]
    fn an_empty_deck_exports_and_imports_as_an_empty_deck() {
        let fx = fixture();
        let deck = create_deck(&fx.conn, fx.space.clone(), "Empty".into(), None).unwrap();
        let json = export_deck_json(&fx.conn, &deck.id).unwrap();
        let imported = import_deck_json(&fx.conn, &fx.space, &json).unwrap();
        assert!(list_cards(&fx.conn, &imported.id, false)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn something_that_is_not_a_deck_is_refused() {
        let fx = fixture();
        let note =
            crate::db::notes::create_page(&fx.conn, fx.space.clone(), "note", "N".into()).unwrap();
        assert!(matches!(
            export_deck_json(&fx.conn, &note.id),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            export_deck_json(&fx.conn, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_bad_file_is_refused_clearly_and_creates_nothing() {
        let fx = fixture();
        let entities = entity_count(&fx.conn);
        let cards = card_count(&fx.conn);
        let good = r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D","cards":[{"front":"a","back":"b"}]}"#;
        assert!(import_deck_json(&fx.conn, &fx.space, good).is_ok());
        let entities = entities + 1;
        let cards = cards + 1;
        let cases = [
            ("{ nope", "not a Nookly deck file"),
            (
                r#"{"format":"nookly-task","version":1}"#,
                "not a Nookly deck file",
            ),
            (
                r#"{"format":"nookly-deck","version":9,"kind":"deck","title":"D","cards":[]}"#,
                "version 9",
            ),
            (
                r#"{"format":"nookly-deck","version":1,"kind":"task","title":"D","cards":[]}"#,
                "not a deck",
            ),
            (
                r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D"}"#,
                "not valid",
            ),
            (
                r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D","cards":[{"front":"a"}]}"#,
                "not valid",
            ),
            (
                r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D","cards":[{"front":"a","back":"b","due":"now"}]}"#,
                "due",
            ),
            (
                r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D","cards":[{"front":"a","back":"b"},{"front":" ","back":""}]}"#,
                "card 2 is empty",
            ),
            (
                r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D","cards":[],"extra":1}"#,
                "extra",
            ),
        ];
        for (text, expected) in cases {
            let err = import_deck_json(&fx.conn, &fx.space, text).unwrap_err();
            assert!(matches!(err, AppError::InvalidInput(_)), "{text}");
            assert!(err.to_string().contains(expected), "{text}: {err}");
            assert_eq!(entity_count(&fx.conn), entities, "{text}");
            assert_eq!(card_count(&fx.conn), cards, "{text}");
        }
    }

    #[test]
    fn the_preview_lists_the_cards_and_changes_nothing() {
        let fx = fixture();
        let deck = studied_deck(&fx);
        let json = export_deck_json(&fx.conn, &deck.id).unwrap();
        let entities = entity_count(&fx.conn);
        let cards = card_count(&fx.conn);
        let p = preview(&json).unwrap();
        assert_eq!(
            (
                p.kind.as_str(),
                p.title.as_str(),
                p.count,
                p.count_label.as_str()
            ),
            ("deck", "Physics terms", 2, "card")
        );
        assert_eq!(p.items[0].text, "Force");
        assert!(p.facts.iter().any(|f| f.contains("no review history")));
        assert_eq!(
            (entity_count(&fx.conn), card_count(&fx.conn)),
            (entities, cards)
        );
    }

    #[test]
    fn it_is_registered_for_decks() {
        let def = crate::db::portable::for_type("index_card_deck").unwrap();
        assert_eq!((def.format, def.parent_type), (FORMAT, None));
    }

    // --- cards with blocks and images ----------------------------------------------

    use crate::db::page_json::BlockJson;
    use crate::db::portable::MAX_IMPORT_BYTES;
    use crate::db::portable_files::{test_images, FILE_MENTION};
    use base64::Engine as _;

    fn block(block_type: &str, content: &str) -> BlockJson {
        BlockJson {
            block_type: block_type.into(),
            content: content.into(),
            language: None,
            filename: None,
            attrs: Default::default(),
        }
    }

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nookly-deck-json-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn stored(fx: &Fixture, dir: &Path, name: &str, bytes: &[u8]) -> crate::db::files::FileEntity {
        crate::db::files::store_file(&fx.conn, dir, fx.space.clone(), name, bytes, None).unwrap()
    }

    fn image_of(file: &crate::db::files::FileEntity) -> BlockJson {
        block(
            "image",
            &format!("[{}](mention:{})", file.entity.title, file.entity.id),
        )
    }

    fn file_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn images_travel_inside_the_file_once_each_and_come_back_as_new_files() {
        let fx = fixture();
        let dir = scratch();
        let cell_bytes = test_images::png();
        let cell = stored(&fx, &dir, "cell.png", &cell_bytes);
        let deck = create_deck(&fx.conn, fx.space.clone(), "Biology".into(), None).unwrap();
        create_card(
            &fx.conn,
            deck.id.clone(),
            vec![block("paragraph", "Name this"), image_of(&cell)].into(),
            vec![block("paragraph", "A **cell**")].into(),
        )
        .unwrap();
        create_card(
            &fx.conn,
            deck.id.clone(),
            "Same picture".into(),
            vec![image_of(&cell)].into(),
        )
        .unwrap();

        let json = export_deck_json(&fx.conn, &deck.id).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["version"], 2);
        assert_eq!(value["files"].as_array().unwrap().len(), 1, "once per File");
        assert_eq!(value["files"][0]["name"], "cell.png");
        for private in [cell.entity.id.as_str(), fx.space.as_str()] {
            assert!(!json.contains(private), "{private} leaked into {json}");
        }

        let target = scratch();
        let files = file_count(&fx.conn);
        let imported = import_deck_json_into(&fx.conn, &target, &fx.other_space, &json).unwrap();
        // One new File, in the Space picked, holding the same bytes.
        assert_eq!(file_count(&fx.conn), files + 1);
        let cards = list_cards(&fx.conn, &imported.id, false).unwrap();
        let first = cards[0].front_blocks.as_ref().unwrap();
        assert_eq!(first[0].content, "Name this");
        let caps = FILE_MENTION.captures(&first[1].content).unwrap();
        assert_eq!(&caps[1], "cell.png");
        let new_file = crate::db::files::get_file(&fx.conn, &caps[2]).unwrap();
        assert_ne!(new_file.entity.id, cell.entity.id);
        assert_eq!(new_file.entity.space_id, fx.other_space);
        test_images::assert_same_image(
            &cell_bytes,
            &std::fs::read(new_file.local_path.unwrap()).unwrap(),
        );
        // The second card points at the same new File.
        let second = cards[1].back_blocks.as_ref().unwrap();
        assert!(second[0].content.contains(&new_file.entity.id));
        assert_eq!(cards[1].front_blocks, None);
        assert_eq!(cards[1].front, "Same picture");
        // The original keeps pointing at its own File.
        let original = list_cards(&fx.conn, &deck.id, false).unwrap();
        assert!(original[0].front_blocks.as_ref().unwrap()[1]
            .content
            .contains(&cell.entity.id));
    }

    #[test]
    fn an_image_that_cannot_travel_becomes_a_paragraph_with_its_name() {
        let fx = fixture();
        let dir = scratch();
        let gone = stored(&fx, &dir, "gone.png", b"x");
        std::fs::remove_file(gone.local_path.as_ref().unwrap()).unwrap();
        let deck = create_deck(&fx.conn, fx.space.clone(), "D".into(), None).unwrap();
        create_card(
            &fx.conn,
            deck.id.clone(),
            vec![
                image_of(&gone),
                block("image", "/Users/me/Pictures/holiday.png"),
                block("image", "https://example.com/web.png"),
                block("image", "[deleted.png](mention:no-such-file)"),
            ]
            .into(),
            "B".into(),
        )
        .unwrap();
        let json = export_deck_json(&fx.conn, &deck.id).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("files").is_none());
        let blocks = value["cards"][0]["frontBlocks"].as_array().unwrap();
        let shape: Vec<(&str, &str)> = blocks
            .iter()
            .map(|b| (b["type"].as_str().unwrap(), b["content"].as_str().unwrap()))
            .collect();
        assert_eq!(
            shape,
            vec![
                ("paragraph", "gone.png"),
                ("paragraph", "/Users/me/Pictures/holiday.png"),
                ("image", "https://example.com/web.png"),
                ("paragraph", "deleted.png"),
            ]
        );
    }

    #[test]
    fn a_version_1_file_still_imports() {
        let fx = fixture();
        let v1 = r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"Old","cards":[{"front":"a","back":"b"}]}"#;
        let imported = import_deck_json(&fx.conn, &fx.space, v1).unwrap();
        let cards = list_cards(&fx.conn, &imported.id, false).unwrap();
        assert_eq!(
            (cards[0].front.as_str(), cards[0].back.as_str()),
            ("a", "b")
        );
        assert!(cards[0].front_blocks.is_none());
        assert_eq!(preview(v1).unwrap().count, 1);
        // What version 1 cannot hold is refused as such.
        for bad in [
            r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D","cards":[{"front":"a","back":"b","frontBlocks":[]}]}"#,
            r#"{"format":"nookly-deck","version":1,"kind":"deck","title":"D","cards":[],"files":[{"id":"f","name":"n","data":""}]}"#,
        ] {
            assert!(import_deck_json(&fx.conn, &fx.space, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_bad_image_refuses_the_whole_file_and_leaves_no_files_behind() {
        let fx = fixture();
        let entities = entity_count(&fx.conn);
        let cards = card_count(&fx.conn);
        let files = file_count(&fx.conn);
        let target = scratch();
        let png = base64::engine::general_purpose::STANDARD.encode(b"png");
        let doc = |second: &str| {
            format!(
                r#"{{"format":"nookly-deck","version":2,"kind":"deck","title":"D","files":[{{"id":"file1","name":"a.png","data":"{png}"}}],"cards":[
                {{"frontBlocks":[{{"type":"image","content":"[a.png](mention:file1)"}}],"back":"ok"}},
                {second}]}}"#
            )
        };
        let cases = [
            (
                doc(
                    r#"{"front":"x","backBlocks":[{"type":"image","content":"[b.png](mention:file9)"}]}"#,
                ),
                "file9",
            ),
            (
                doc(
                    r#"{"front":"x","backBlocks":[{"type":"callout","content":"c","attrs":{"variant":"nonsense"}}]}"#,
                ),
                "block 1",
            ),
            (doc(r#"{"front":"x"}"#), "card 2 has no back"),
        ];
        for (text, expected) in cases {
            let err = import_deck_json_into(&fx.conn, &target, &fx.space, &text).unwrap_err();
            assert!(err.to_string().contains(expected), "{expected}: {err}");
            assert_eq!(entity_count(&fx.conn), entities, "{expected}");
            assert_eq!(card_count(&fx.conn), cards, "{expected}");
            assert_eq!(file_count(&fx.conn), files, "{expected}");
            let leftovers = std::fs::read_dir(&target).map_or(0, Iterator::count);
            assert_eq!(leftovers, 0, "a file was left behind: {expected}");
        }
        let broken = doc(r#"{"front":"x","back":"y"}"#).replace(&png, "***not base64***");
        let err = import_deck_json_into(&fx.conn, &target, &fx.space, &broken).unwrap_err();
        assert!(err.to_string().contains("base64"), "{err}");
    }

    #[test]
    fn an_image_name_cannot_reach_outside_the_files_folder() {
        let fx = fixture();
        let target = scratch();
        let png = base64::engine::general_purpose::STANDARD.encode(b"png");
        let text = format!(
            r#"{{"format":"nookly-deck","version":2,"kind":"deck","title":"D","files":[{{"id":"f","name":"../../evil.png","data":"{png}"}}],"cards":[{{"front":"x","backBlocks":[{{"type":"image","content":"[x](mention:f)"}}]}}]}}"#
        );
        let imported = import_deck_json_into(&fx.conn, &target, &fx.space, &text).unwrap();
        let cards = list_cards(&fx.conn, &imported.id, false).unwrap();
        let content = &cards[0].back_blocks.as_ref().unwrap()[0].content;
        assert!(content.starts_with("[evil.png]"), "{content}");
        let stored: Vec<_> = std::fs::read_dir(&target).unwrap().collect();
        assert_eq!(stored.len(), 1);
    }

    #[test]
    fn the_preview_names_the_images_and_a_deck_may_be_bigger_than_a_page() {
        let png = base64::engine::general_purpose::STANDARD.encode(b"png");
        let text = format!(
            r#"{{"format":"nookly-deck","version":2,"kind":"deck","title":"D","files":[{{"id":"f","name":"cell.png","data":"{png}"}}],"cards":[{{"frontBlocks":[{{"type":"image","content":"[cell.png](mention:f)"}}],"back":"A cell"}}]}}"#
        );
        let p = preview(&text).unwrap();
        assert_eq!(p.items[0].text, "Image: cell.png");
        assert!(p.facts.iter().any(|f| f.contains("1 image")));
        // A file with its images may be well over what a page of text is: read; over the
        // limit: refused.
        let big = format!(
            r#"{{"format":"nookly-deck","version":2,"kind":"deck","title":"D","cards":[{{"front":"{}","back":"b"}}]}}"#,
            "x".repeat(21 * 1024 * 1024)
        );
        assert!(crate::db::portable::preview(&big).is_ok());
        let too_big = format!(
            r#"{{"format":"nookly-deck","version":2,"kind":"deck","title":"D","pad":"{}"}}"#,
            "x".repeat(MAX_IMPORT_BYTES as usize)
        );
        let err = crate::db::portable::preview(&too_big).unwrap_err();
        assert!(err.to_string().contains("100 MB"), "{err}");
    }
}
