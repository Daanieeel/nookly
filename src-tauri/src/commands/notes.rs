use crate::db::entities::Entity;
use crate::db::notes::{self, Block};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_note(state: State<DbState>, space_id: String, title: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    notes::create_page(&conn, space_id, "note", title)
}

/// Jots (raw capture) and Refinements (polished version) are just Notes pages under
/// a different entity type, linked afterwards via the generic relationship system (§5.3).
#[tauri::command]
pub fn create_jot(state: State<DbState>, space_id: String, title: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    notes::create_page(&conn, space_id, "jot", title)
}

#[tauri::command]
pub fn create_refinement(
    state: State<DbState>,
    space_id: String,
    title: String,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    notes::create_page(&conn, space_id, "refinement", title)
}

#[tauri::command]
pub fn list_blocks(state: State<DbState>, entity_id: String) -> AppResult<Vec<Block>> {
    let conn = state.0.lock().unwrap();
    notes::list_blocks(&conn, &entity_id)
}

#[tauri::command]
pub fn create_block(
    state: State<DbState>,
    entity_id: String,
    block_type: String,
    content: String,
    position: Option<i64>,
) -> AppResult<Block> {
    let conn = state.0.lock().unwrap();
    notes::create_block(&conn, &entity_id, block_type, content, position)
}

#[tauri::command]
pub fn update_block(state: State<DbState>, block_id: String, content: String) -> AppResult<Block> {
    let conn = state.0.lock().unwrap();
    notes::update_block(&conn, &block_id, content)
}

#[tauri::command]
pub fn delete_block(state: State<DbState>, block_id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    notes::delete_block(&conn, &block_id)
}

#[tauri::command]
pub fn reorder_blocks(
    state: State<DbState>,
    entity_id: String,
    ordered_block_ids: Vec<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    notes::reorder_blocks(&conn, &entity_id, ordered_block_ids)
}

#[tauri::command]
pub fn render_page_markdown(state: State<DbState>, entity_id: String) -> AppResult<String> {
    let conn = state.0.lock().unwrap();
    notes::render_page_markdown(&conn, &entity_id)
}
