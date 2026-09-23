use crate::db::entities::Entity;
use crate::db::notes::{self, Block, BlockPatch, NoteSummary};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
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
pub fn count_jots_without_refinement(state: State<DbState>, space_id: String) -> AppResult<i64> {
    let conn = state.0.lock().unwrap();
    notes::count_jots_without_refinement(&conn, &space_id)
}

#[tauri::command]
pub fn count_jots_without_refinement_all_spaces(state: State<DbState>) -> AppResult<i64> {
    let conn = state.0.lock().unwrap();
    notes::count_jots_without_refinement_all_spaces(&conn)
}

#[tauri::command]
pub fn list_recent_notes(
    state: State<DbState>,
    space_id: String,
    limit: i64,
) -> AppResult<Vec<Entity>> {
    let conn = state.0.lock().unwrap();
    notes::list_recent_notes(&conn, &space_id, limit)
}

#[tauri::command]
pub fn list_note_summaries(state: State<DbState>, space_id: String) -> AppResult<Vec<NoteSummary>> {
    let conn = state.0.lock().unwrap();
    notes::list_note_summaries(&conn, &space_id)
}

#[tauri::command]
pub fn list_blocks(state: State<DbState>, entity_id: String) -> AppResult<Vec<Block>> {
    let conn = state.0.lock().unwrap();
    notes::list_blocks(&conn, &entity_id)
}

#[tauri::command]
pub fn list_mentioning_entities(
    state: State<DbState>,
    entity_id: String,
) -> AppResult<Vec<Entity>> {
    let conn = state.0.lock().unwrap();
    notes::list_mentioning_entities(&conn, &entity_id)
}

#[tauri::command]
pub fn create_block(
    state: State<DbState>,
    entity_id: String,
    block_type: String,
    content: String,
    position: Option<i64>,
    language: Option<String>,
    filename: Option<String>,
) -> AppResult<Block> {
    let conn = state.0.lock().unwrap();
    notes::create_block(
        &conn, &entity_id, block_type, content, position, language, filename,
    )
}

#[tauri::command]
pub fn update_block(
    state: State<DbState>,
    block_id: String,
    patch: BlockPatch,
) -> AppResult<Block> {
    let conn = state.0.lock().unwrap();
    notes::update_block(&conn, &block_id, patch)
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

/// `path` comes from the native save dialog, so the user chose it explicitly.
#[tauri::command]
pub fn export_page_markdown(
    state: State<DbState>,
    entity_id: String,
    path: String,
) -> AppResult<()> {
    let markdown = {
        let conn = state.0.lock().unwrap();
        notes::render_page_markdown(&conn, &entity_id)?
    };
    std::fs::write(&path, markdown).map_err(|err| AppError::Io(err.to_string()))
}
