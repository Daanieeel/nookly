//! Export and import of one Deck as a Nookly JSON file (`nookly-deck`, version 1).
//!
//! The file holds the Deck's title and its cards, front and back as written (inline
//! markdown). Scheduling and review state stay behind: when a card is due, how well it is
//! known and its review history belong to the person who studied it. Imported cards start
//! as new ones, due now. Which Exam the Deck is filed under, its labels and its Space do
//! not travel either; the import dialog can file the new Deck under an Exam like any
//! other relation.
//!
//! Import creates a new Deck and never changes an existing one, and lands whole or not
//! at all.

use crate::db::decks;
use crate::db::entities::Entity;
use crate::db::portable::{
    first_line, parse_document, Importer, PortableDef, PortablePreview, PreviewItem,
};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

pub const FORMAT: &str = "nookly-deck";
pub const VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeckFile {
    format: String,
    version: u32,
    /// Always `deck`.
    kind: String,
    title: String,
    cards: Vec<CardFile>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct CardFile {
    front: String,
    back: String,
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
    let cards = decks::list_cards(conn, entity_id, false)?
        .into_iter()
        .map(|c| CardFile {
            front: c.front,
            back: c.back,
        })
        .collect();
    let file = DeckFile {
        format: FORMAT.into(),
        version: VERSION,
        kind: "deck".into(),
        title: entity.title,
        cards,
    };
    serde_json::to_string_pretty(&file).map_err(|e| AppError::Io(e.to_string()))
}

/// Reads and checks a document without touching the database.
fn parse(text: &str) -> AppResult<DeckFile> {
    let file: DeckFile = parse_document(text, FORMAT, VERSION, "deck")?;
    if file.kind != "deck" {
        return Err(AppError::InvalidInput(format!(
            "this deck file holds a \"{}\", not a deck",
            file.kind
        )));
    }
    for (index, card) in file.cards.iter().enumerate() {
        if card.front.trim().is_empty() && card.back.trim().is_empty() {
            return Err(AppError::InvalidInput(format!(
                "card {} is empty: it needs a front or a back",
                index + 1
            )));
        }
    }
    Ok(file)
}

/// Creates a new Deck, with its cards as new cards, in `space_id` from a `nookly-deck`
/// document.
pub fn import_deck_json(conn: &Connection, space_id: &str, text: &str) -> AppResult<Entity> {
    let file = parse(text)?;
    crate::db::atomically(conn, || {
        let deck = decks::create_deck(conn, space_id.to_string(), file.title.clone(), None)?;
        for card in &file.cards {
            decks::create_card(conn, deck.id.clone(), card.front.clone(), card.back.clone())?;
        }
        crate::db::entities::get_entity(conn, &deck.id)
    })
}

fn preview(text: &str) -> AppResult<PortablePreview> {
    let file = parse(text)?;
    let items: Vec<PreviewItem> = file
        .cards
        .iter()
        .map(|c| PreviewItem {
            label: "Card".into(),
            text: first_line(if c.front.trim().is_empty() {
                &c.back
            } else {
                &c.front
            }),
            converted: false,
        })
        .collect();
    Ok(PortablePreview {
        format: FORMAT.into(),
        kind: "deck".into(),
        title: file.title,
        facts: vec!["Cards arrive as new, with no review history".into()],
        count: items.len(),
        count_label: "card".into(),
        items,
        converted: 0,
        parent_type: None,
    })
}

inventory::submit! {
    PortableDef { entity_type: "index_card_deck", format: FORMAT, version: VERSION, parent_type: None, noun: "deck", export: export_deck_json, preview, import: Importer::Plain(import_deck_json) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::decks::{create_card, create_deck, list_cards, review_card};
    use rs_fsrs::Rating;

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
}
