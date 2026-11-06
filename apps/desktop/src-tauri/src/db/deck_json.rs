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
use crate::db::page_json::{export_attrs, export_json_block, BlockJson};
use crate::db::portable::{
    first_line, parse_document_versions, Importer, PortableDef, PortablePreview, PreviewItem,
    MAX_DECK_IMPORT_BYTES,
};
use crate::error::{AppError, AppResult};
use base64::Engine as _;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

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

/// One image inside the file, named by `id` in the image blocks that show it.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct FileFile {
    id: String,
    name: String,
    /// The bytes of the file, base64.
    data: String,
}

/// `[name](mention:<file>)`: the whole content of an image block that shows a File.
static FILE_MENTION: LazyLock<regex::Regex> =
    LazyLock::new(|| crate::error::literal_regex(r"^\[([^\]]*)\]\(mention:([a-zA-Z0-9-]+)\)$"));

/// The Files a deck's images show, collected while exporting.
#[derive(Default)]
struct Embedded {
    /// File id to its key in the export, `None` for one that cannot travel.
    keys: HashMap<String, Option<String>>,
    files: Vec<FileFile>,
}

impl Embedded {
    /// The key of the File `id` in the export, adding its bytes the first time. `None` when
    /// it is not a File of Nookly or its bytes cannot be read.
    fn embed(&mut self, conn: &Connection, id: &str) -> Option<String> {
        if let Some(known) = self.keys.get(id) {
            return known.clone();
        }
        let key = self.read(conn, id).map(|(name, bytes)| {
            let key = format!("file{}", self.files.len() + 1);
            self.files.push(FileFile {
                id: key.clone(),
                name,
                data: base64::engine::general_purpose::STANDARD.encode(bytes),
            });
            key
        });
        self.keys.insert(id.to_string(), key.clone());
        key
    }

    fn read(&self, conn: &Connection, id: &str) -> Option<(String, Vec<u8>)> {
        let file = crate::db::files::get_file(conn, id).ok()?;
        let path = file.local_path.or(file.source_path)?;
        let bytes = std::fs::read(path).ok()?;
        let name = file
            .original_filename
            .as_deref()
            .and_then(crate::db::files::sanitize)
            .or_else(|| crate::db::files::sanitize(&file.entity.title))
            .unwrap_or_else(|| "image".into());
        Some((name, bytes))
    }
}

/// One block of a card as it travels: an image of a File becomes an image of the file inside
/// the export, everything else is exported like a page block.
fn export_block(conn: &Connection, block: &BlockJson, embedded: &mut Embedded) -> BlockJson {
    if block.block_type == "image" {
        if let Some(caps) = FILE_MENTION.captures(block.content.trim()) {
            if let Some(key) = embedded.embed(conn, &caps[2]) {
                return BlockJson {
                    block_type: "image".into(),
                    content: format!("[{}](mention:{key})", &caps[1]),
                    language: None,
                    filename: None,
                    attrs: export_attrs(&block.attrs),
                };
            }
        }
    }
    export_json_block(block)
}

/// The Deck as a `nookly-deck` JSON document: its cards in order, without the ones in the
/// trash.
pub fn export_deck_json(conn: &Connection, entity_id: &str) -> AppResult<String> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    if entity.entity_type != "index_card_deck" {
        return Err(AppError::InvalidInput(format!(
            "only a deck can be exported this way, not a {}",
            entity.entity_type
        )));
    }
    let mut embedded = Embedded::default();
    let mut side = |text: String, blocks: Option<Vec<BlockJson>>| match blocks {
        Some(blocks) => (
            None,
            Some(
                blocks
                    .iter()
                    .map(|b| export_block(conn, b, &mut embedded))
                    .collect(),
            ),
        ),
        None => (Some(text), None),
    };
    let cards = decks::list_cards(conn, entity_id, false)?
        .into_iter()
        .map(|c| {
            let (front, front_blocks) = side(c.front, c.front_blocks);
            let (back, back_blocks) = side(c.back, c.back_blocks);
            CardFile {
                front,
                back,
                front_blocks,
                back_blocks,
            }
        })
        .collect();
    let file = DeckFile {
        format: FORMAT.into(),
        version: VERSION,
        kind: "deck".into(),
        title: entity.title,
        cards,
        files: embedded.files,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| AppError::Io(e.to_string()))?;
    if json.len() as u64 > MAX_DECK_IMPORT_BYTES {
        return Err(AppError::InvalidInput(format!(
            "this deck with its images is over {} MB, more than Nookly can import again",
            MAX_DECK_IMPORT_BYTES / (1024 * 1024)
        )));
    }
    Ok(json)
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
    if file.version == 1 && !file.files.is_empty() {
        return Err(AppError::InvalidInput(
            "this deck file is not valid (a version 1 file cannot hold files)".into(),
        ));
    }
    Ok(file)
}

/// Where imported images are stored: the app's own files folder, the same one the app and
/// the CLI import into.
fn files_dir() -> AppResult<PathBuf> {
    Ok(crate::db::standalone_app_data_dir()
        .map_err(|e| AppError::Db(e.to_string()))?
        .join("files"))
}

/// Creates a new Deck, with its cards as new cards, in `space_id` from a `nookly-deck`
/// document. Images are stored in the app's files folder.
pub fn import_deck_json(conn: &Connection, space_id: &str, text: &str) -> AppResult<Entity> {
    import_deck_json_into(conn, &files_dir()?, space_id, text)
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
    let mut written: Vec<String> = Vec::new();
    let result = crate::db::atomically(conn, || {
        let stored = store_images(conn, files_dir, space_id, &file, &mut written)?;
        let deck = decks::create_deck(conn, space_id.to_string(), file.title.clone(), None)?;
        for (index, card) in file.cards.iter().enumerate() {
            let number = index + 1;
            let front = imported_face(number, "front", &card.front, &card.front_blocks, &stored)?;
            let back = imported_face(number, "back", &card.back, &card.back_blocks, &stored)?;
            decks::create_card(conn, deck.id.clone(), front, back)?;
        }
        crate::db::entities::get_entity(conn, &deck.id)
    });
    if result.is_err() {
        for path in written {
            let _ = std::fs::remove_file(path);
        }
    }
    result
}

/// The new File (its id and name) for each image of the file that a block shows, by its key.
fn store_images(
    conn: &Connection,
    files_dir: &Path,
    space_id: &str,
    file: &DeckFile,
    written: &mut Vec<String>,
) -> AppResult<HashMap<String, (String, String)>> {
    let used = used_keys(file);
    let mut stored = HashMap::new();
    for image in file.files.iter().filter(|f| used.contains(f.id.as_str())) {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(image.data.trim())
            .map_err(|_| {
                AppError::InvalidInput(format!(
                    "this deck file is not valid (the data of {} is not base64)",
                    image.name
                ))
            })?;
        let name = crate::db::files::sanitize(&image.name).unwrap_or_else(|| "image".into());
        let created = crate::db::files::store_file(
            conn,
            files_dir,
            space_id.to_string(),
            &name,
            &bytes,
            None,
        )?;
        written.extend(created.local_path);
        stored.insert(image.id.clone(), (created.entity.id, name));
    }
    Ok(stored)
}

/// The keys of the files that an image block of some card shows.
fn used_keys(file: &DeckFile) -> std::collections::HashSet<String> {
    file.cards
        .iter()
        .flat_map(|c| [&c.front_blocks, &c.back_blocks])
        .flatten()
        .flatten()
        .filter(|b| b.block_type == "image")
        .filter_map(|b| {
            FILE_MENTION
                .captures(b.content.trim())
                .map(|caps| caps[2].to_string())
        })
        .collect()
}

/// A side of an imported card: its text, or its blocks with every image pointed at the
/// new File made for it. An image of a file the document does not hold refuses the import.
fn imported_face(
    number: usize,
    side: &str,
    text: &Option<String>,
    blocks: &Option<Vec<BlockJson>>,
    stored: &HashMap<String, (String, String)>,
) -> AppResult<Face> {
    let Some(blocks) = blocks else {
        return face_of(number, side, text.clone(), None);
    };
    let mut imported = Vec::with_capacity(blocks.len());
    for block in blocks {
        let mut block = block.clone();
        if block.block_type == "image" {
            if let Some(caps) = FILE_MENTION.captures(block.content.trim()) {
                let (id, name) = stored.get(&caps[2]).ok_or_else(|| {
                    AppError::InvalidInput(format!(
                        "this deck file is not valid (the {side} of card {number} shows a file it does not hold: {})",
                        &caps[2]
                    ))
                })?;
                block.content = format!("[{name}](mention:{id})");
            }
        }
        imported.push(block);
    }
    Ok(Face::Blocks(imported))
}

/// What a side reads as in the import dialog: its text, or the text of its blocks.
fn preview_text(text: &Option<String>, blocks: &Option<Vec<BlockJson>>) -> String {
    if let Some(blocks) = blocks {
        return blocks
            .iter()
            .map(|b| {
                if b.block_type == "image" {
                    match FILE_MENTION.captures(b.content.trim()) {
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
    let images = used_keys(&file).len();
    if images > 0 {
        facts.push(if images == 1 {
            "1 image arrives as a new File".into()
        } else {
            format!("{images} images arrive as new Files")
        });
    }
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
    PortableDef { entity_type: "index_card_deck", format: FORMAT, version: VERSION, parent_type: None, noun: "deck", max_bytes: MAX_DECK_IMPORT_BYTES, export: export_deck_json, preview, import: Importer::Plain(import_deck_json) }
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
        let cell = stored(&fx, &dir, "cell.png", b"png bytes");
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
        assert_eq!(
            std::fs::read(new_file.local_path.unwrap()).unwrap(),
            b"png bytes"
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
        // Over the usual 20 MB, under the deck's own limit: read; over that: refused.
        let big = format!(
            r#"{{"format":"nookly-deck","version":2,"kind":"deck","title":"D","cards":[{{"front":"{}","back":"b"}}]}}"#,
            "x".repeat(21 * 1024 * 1024)
        );
        assert!(crate::db::portable::preview(&big).is_ok());
        let too_big = format!(
            r#"{{"format":"nookly-deck","version":2,"kind":"deck","title":"D","pad":"{}"}}"#,
            "x".repeat(MAX_DECK_IMPORT_BYTES as usize)
        );
        let err = crate::db::portable::preview(&too_big).unwrap_err();
        assert!(err.to_string().contains("100 MB"), "{err}");
    }
}
