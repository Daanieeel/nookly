use crate::db::entities::Entity;
use crate::db::relationships::{Cardinality, RelationshipTypeDef};
use crate::db::schema::{CreateInput, EntitySchemaDef, FieldDef, FieldKind, JsonMap};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::Serialize;

inventory::submit! {
    RelationshipTypeDef { name: "deck-exam", inverse_label: "has deck", cardinality: Cardinality::OneToPerFrom }
}

/// Leitner-box interval schedule in days, indexed by box level (1-based).
const BOX_INTERVALS_DAYS: [i64; 6] = [1, 1, 3, 7, 14, 30];

pub fn create_deck(
    conn: &Connection,
    space_id: String,
    title: String,
    exam_id: String,
) -> AppResult<Entity> {
    let entity =
        crate::db::entities::create_entity(conn, space_id, "index_card_deck".into(), title, None)?;
    conn.execute(
        "INSERT INTO index_card_decks (entity_id) VALUES (?1)",
        params![entity.id],
    )?;
    crate::db::relationships::create_relationship(
        conn,
        entity.id.clone(),
        exam_id,
        "deck-exam".into(),
        None,
        None,
    )?;
    Ok(entity)
}

pub fn list_decks(conn: &Connection, space_id: &str) -> AppResult<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM entities e JOIN index_card_decks d ON d.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], crate::db::entities::row_to_entity)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexCard {
    pub id: String,
    pub deck_entity_id: String,
    pub front: String,
    pub back: String,
    pub box_level: i64,
    pub due_at: String,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_card(row: &rusqlite::Row) -> rusqlite::Result<IndexCard> {
    Ok(IndexCard {
        id: row.get("id")?,
        deck_entity_id: row.get("deck_entity_id")?,
        front: row.get("front")?,
        back: row.get("back")?,
        box_level: row.get("box_level")?,
        due_at: row.get("due_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn create_card(
    conn: &Connection,
    deck_entity_id: String,
    front: String,
    back: String,
) -> AppResult<IndexCard> {
    let id = super::new_id();
    let now = super::now();
    conn.execute(
        "INSERT INTO index_cards (id, deck_entity_id, front, back, box_level, due_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5, ?5)",
        params![id, deck_entity_id, front, back, now],
    )?;
    Ok(IndexCard {
        id,
        deck_entity_id,
        front,
        back,
        box_level: 1,
        due_at: now.clone(),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn list_cards(conn: &Connection, deck_entity_id: &str) -> AppResult<Vec<IndexCard>> {
    let mut stmt = conn
        .prepare("SELECT * FROM index_cards WHERE deck_entity_id = ?1 ORDER BY created_at ASC")?;
    let rows = stmt.query_map(params![deck_entity_id], row_to_card)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_due_cards(conn: &Connection, deck_entity_id: &str) -> AppResult<Vec<IndexCard>> {
    let now = super::now();
    let mut stmt = conn.prepare(
        "SELECT * FROM index_cards WHERE deck_entity_id = ?1 AND due_at <= ?2 ORDER BY due_at ASC",
    )?;
    let rows = stmt.query_map(params![deck_entity_id, now], row_to_card)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Leitner-box review: remembered advances a box (longer interval), forgotten resets to box 1.
pub fn review_card(conn: &Connection, card_id: &str, remembered: bool) -> AppResult<IndexCard> {
    let mut card = conn
        .query_row(
            "SELECT * FROM index_cards WHERE id = ?1",
            params![card_id],
            row_to_card,
        )
        .map_err(|_| AppError::NotFound(format!("index card {card_id}")))?;

    card.box_level = if remembered {
        (card.box_level + 1).min(BOX_INTERVALS_DAYS.len() as i64)
    } else {
        1
    };
    let interval_days = BOX_INTERVALS_DAYS[(card.box_level - 1) as usize];
    let due_at = (chrono::Utc::now() + chrono::Duration::days(interval_days)).to_rfc3339();
    let now = super::now();

    conn.execute(
        "UPDATE index_cards SET box_level = ?1, due_at = ?2, updated_at = ?3 WHERE id = ?4",
        params![card.box_level, due_at, now, card_id],
    )?;
    card.due_at = due_at;
    card.updated_at = now;
    Ok(card)
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------
//
// Index Cards themselves (front/back/box_level) aren't exposed as a CLI
// entity type: they have no base entity fields (no title, no space_id) per
// `02-entity-model.md` §2.1 — they're deck-owned child records, the same way
// Note blocks are page-owned child records, not first-class entities.

const DECK_FIELDS: &[FieldDef] = &[FieldDef {
    name: "examId",
    kind: FieldKind::EntityRef("exam"),
    required_on_create: true,
    writable_on_update: false,
    description: "The Exam this deck belongs to (structural: exactly one).",
}];

fn cli_create_deck(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let exam_id = crate::db::schema::require_str(&input.fields, "examId")?;
    let entity = create_deck(conn, input.space_id, input.title, exam_id)?;
    Ok(serde_json::to_value(entity).expect("Entity always serializes"))
}

fn cli_update_deck(conn: &Connection, id: &str, _fields: &JsonMap) -> AppResult<serde_json::Value> {
    cli_get_deck(conn, id)
}

fn cli_get_deck(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(
        serde_json::to_value(crate::db::entities::get_entity(conn, id)?)
            .expect("Entity always serializes"),
    )
}

fn cli_list_decks(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id.ok_or_else(|| {
        AppError::InvalidInput("index_card_deck list requires --space <space-id>".into())
    })?;
    Ok(list_decks(conn, space_id)?
        .into_iter()
        .map(|e| serde_json::to_value(e).expect("Entity always serializes"))
        .collect())
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "index_card_deck",
        supports_blocks: false,
        description: "A deck of Leitner-box spaced-repetition index cards, belonging to exactly one Exam.",
        fields: DECK_FIELDS,
        relationship_types: &["deck-exam"],
        create: cli_create_deck,
        update: cli_update_deck,
        get: cli_get_deck,
        list: cli_list_decks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::exams::create_exam;
    use crate::db::spaces::create_space;

    #[test]
    fn forgotten_card_resets_to_box_one_remembered_advances() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        let space = create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
        let exam = create_exam(
            &conn,
            space.id.clone(),
            "Midterm".into(),
            {
                crate::db::courses::create_course(&conn, space.id.clone(), "Algorithms".into())
                    .unwrap()
                    .id
            },
            None,
            None,
        )
        .unwrap();
        let deck = create_deck(&conn, space.id, "Midterm Deck".into(), exam.entity.id).unwrap();
        let card = create_card(&conn, deck.id, "Q".into(), "A".into()).unwrap();

        let advanced = review_card(&conn, &card.id, true).unwrap();
        assert_eq!(advanced.box_level, 2);

        let reset = review_card(&conn, &card.id, false).unwrap();
        assert_eq!(reset.box_level, 1);
    }
}
