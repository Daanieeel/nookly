use crate::db::decks::{self, IndexCard};
use crate::db::entities::Entity;
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_deck(
    state: State<DbState>,
    space_id: String,
    title: String,
    exam_id: String,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    decks::create_deck(&conn, space_id, title, exam_id)
}

#[tauri::command]
pub fn list_decks(state: State<DbState>, space_id: String) -> AppResult<Vec<Entity>> {
    let conn = state.0.lock().unwrap();
    decks::list_decks(&conn, &space_id)
}

#[tauri::command]
pub fn create_card(
    state: State<DbState>,
    deck_entity_id: String,
    front: String,
    back: String,
) -> AppResult<IndexCard> {
    let conn = state.0.lock().unwrap();
    decks::create_card(&conn, deck_entity_id, front, back)
}

#[tauri::command]
pub fn list_cards(state: State<DbState>, deck_entity_id: String) -> AppResult<Vec<IndexCard>> {
    let conn = state.0.lock().unwrap();
    decks::list_cards(&conn, &deck_entity_id)
}

#[tauri::command]
pub fn list_due_cards(state: State<DbState>, deck_entity_id: String) -> AppResult<Vec<IndexCard>> {
    let conn = state.0.lock().unwrap();
    decks::list_due_cards(&conn, &deck_entity_id)
}

#[tauri::command]
pub fn review_card(
    state: State<DbState>,
    card_id: String,
    remembered: bool,
) -> AppResult<IndexCard> {
    let conn = state.0.lock().unwrap();
    decks::review_card(&conn, &card_id, remembered)
}
