use crate::db::decks::{self, DeckStats, DeckSummary, Face, IndexCard};
use crate::db::entities::Entity;
use crate::db::page_json::BlockJson;
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_deck(
    state: State<DbState>,
    space_id: String,
    title: String,
    exam_id: Option<String>,
) -> AppResult<Entity> {
    let conn = state.conn()?;
    decks::create_deck(&conn, space_id, title, exam_id)
}

#[tauri::command]
pub async fn list_decks(state: State<'_, DbState>, space_id: String) -> AppResult<Vec<Entity>> {
    let conn = state.conn()?;
    decks::list_decks(&conn, &space_id)
}

#[tauri::command]
pub async fn list_deck_summaries(
    state: State<'_, DbState>,
    space_id: String,
) -> AppResult<Vec<DeckSummary>> {
    let conn = state.conn()?;
    decks::list_deck_summaries(&conn, &space_id)
}

#[tauri::command]
pub async fn list_deck_summaries_all_spaces(
    state: State<'_, DbState>,
) -> AppResult<Vec<DeckSummary>> {
    let conn = state.conn()?;
    decks::list_deck_summaries_all_spaces(&conn)
}

#[tauri::command]
pub fn set_deck_exam(
    state: State<DbState>,
    deck_entity_id: String,
    exam_id: Option<String>,
) -> AppResult<()> {
    let conn = state.conn()?;
    decks::set_deck_exam(&conn, &deck_entity_id, exam_id)
}

#[tauri::command]
pub fn deck_stats(state: State<DbState>, deck_entity_id: String) -> AppResult<DeckStats> {
    let conn = state.conn()?;
    decks::deck_stats(&conn, &deck_entity_id)
}

#[tauri::command]
pub fn create_card(
    state: State<DbState>,
    deck_entity_id: String,
    front: Option<String>,
    back: Option<String>,
    front_blocks: Option<Vec<BlockJson>>,
    back_blocks: Option<Vec<BlockJson>>,
) -> AppResult<IndexCard> {
    let side = |text, blocks, name: &str| {
        Face::given(text, blocks)
            .ok_or_else(|| crate::error::AppError::InvalidInput(format!("a card needs a {name}")))
    };
    let front = side(front, front_blocks, "front")?;
    let back = side(back, back_blocks, "back")?;
    let conn = state.conn()?;
    decks::create_card(&conn, deck_entity_id, front, back)
}

#[tauri::command]
pub fn update_card(
    state: State<DbState>,
    card_id: String,
    front: Option<String>,
    back: Option<String>,
    front_blocks: Option<Vec<BlockJson>>,
    back_blocks: Option<Vec<BlockJson>>,
) -> AppResult<IndexCard> {
    let conn = state.conn()?;
    decks::update_card(
        &conn,
        &card_id,
        Face::given(front, front_blocks),
        Face::given(back, back_blocks),
    )
}

#[tauri::command]
pub fn delete_card(state: State<DbState>, card_id: String) -> AppResult<()> {
    let conn = state.conn()?;
    decks::delete_card(&conn, &card_id)
}

#[tauri::command]
pub fn restore_card(state: State<DbState>, card_id: String) -> AppResult<()> {
    let conn = state.conn()?;
    decks::restore_card(&conn, &card_id)
}

#[tauri::command]
pub async fn list_cards(
    state: State<'_, DbState>,
    deck_entity_id: String,
) -> AppResult<Vec<IndexCard>> {
    let conn = state.conn()?;
    decks::list_cards(&conn, &deck_entity_id, false)
}

#[tauri::command]
pub fn study_queue(state: State<DbState>, deck_entity_id: String) -> AppResult<Vec<IndexCard>> {
    let conn = state.conn()?;
    decks::study_queue(&conn, &deck_entity_id)
}

#[tauri::command]
pub fn review_card(state: State<DbState>, card_id: String, rating: String) -> AppResult<IndexCard> {
    let conn = state.conn()?;
    decks::review_card(&conn, &card_id, decks::parse_rating(&rating)?)
}

#[tauri::command]
pub fn undo_review(state: State<DbState>, card_id: String) -> AppResult<IndexCard> {
    let conn = state.conn()?;
    decks::undo_review(&conn, &card_id)
}
