use crate::db::entities::Entity;
use crate::db::notes::{self, Block, BlockPatch, PageSummary};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use tauri::State;

#[tauri::command]
pub fn create_note(state: State<DbState>, space_id: String, title: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    notes::create_page(&conn, space_id, "note", title)
}

/// Jots (raw capture) are Notes pages under a different entity type, refined into a
/// regular Note linked afterwards via the generic relationship system (§5.3).
#[tauri::command]
pub fn create_jot(state: State<DbState>, space_id: String, title: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    notes::create_page(&conn, space_id, "jot", title)
}

#[tauri::command]
pub fn count_unrefined_jots(state: State<DbState>, space_id: String) -> AppResult<i64> {
    let conn = state.0.lock().unwrap();
    notes::count_unrefined_jots(&conn, &space_id)
}

#[tauri::command]
pub fn count_unrefined_jots_all_spaces(state: State<DbState>) -> AppResult<i64> {
    let conn = state.0.lock().unwrap();
    notes::count_unrefined_jots_all_spaces(&conn)
}

#[tauri::command]
pub fn list_unrefined_jots_all_spaces(
    state: State<DbState>,
    limit: i64,
) -> AppResult<Vec<PageSummary>> {
    let conn = state.0.lock().unwrap();
    notes::list_unrefined_jots_all_spaces(&conn, limit)
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
pub fn list_note_summaries(state: State<DbState>, space_id: String) -> AppResult<Vec<PageSummary>> {
    let conn = state.0.lock().unwrap();
    notes::list_note_summaries(&conn, &space_id)
}

#[tauri::command]
pub fn list_jot_summaries(state: State<DbState>, space_id: String) -> AppResult<Vec<PageSummary>> {
    let conn = state.0.lock().unwrap();
    notes::list_jot_summaries(&conn, &space_id)
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
#[allow(clippy::too_many_arguments)]
pub fn create_block(
    state: State<DbState>,
    entity_id: String,
    block_type: String,
    content: String,
    position: Option<i64>,
    language: Option<String>,
    filename: Option<String>,
    attrs: Option<crate::db::block_types::BlockAttrs>,
) -> AppResult<Block> {
    let conn = state.0.lock().unwrap();
    notes::create_block_with_attrs(
        &conn,
        &entity_id,
        block_type,
        content,
        position,
        language,
        filename,
        attrs.unwrap_or_default(),
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

/// Writes the page as a Nookly page file (`nookly-page` JSON, see `db::page_json`).
/// `path` comes from the native save dialog.
#[tauri::command]
pub fn export_page_json(state: State<DbState>, entity_id: String, path: String) -> AppResult<()> {
    let json = {
        let conn = state.0.lock().unwrap();
        crate::db::page_json::export_page_json(&conn, &entity_id)?
    };
    std::fs::write(&path, json).map_err(|err| AppError::Io(err.to_string()))
}

/// Reads a Nookly page file for the import dialog. 20 MB cap checked before the read.
fn read_page_file(path: &str) -> AppResult<String> {
    let size = std::fs::metadata(path)
        .map_err(|err| AppError::Io(err.to_string()))?
        .len();
    if size > crate::db::page_json::MAX_IMPORT_BYTES {
        return Err(AppError::InvalidInput(
            "this file is too large to import (the limit is 20 MB)".into(),
        ));
    }
    std::fs::read_to_string(path).map_err(|err| AppError::Io(err.to_string()))
}

/// Says what importing the file would create, without creating anything. Refuses the
/// same files `import_page_json` refuses.
#[tauri::command]
pub fn preview_page_json(path: String) -> AppResult<crate::db::page_json::PagePreview> {
    crate::db::page_json::preview_page_json(&read_page_file(&path)?)
}

/// `preview_page_json` for a file whose text the webview already holds (a drop or a
/// paste, which hand over contents and no path). Same checks, same limit.
#[tauri::command]
pub fn preview_page_text(text: String) -> AppResult<crate::db::page_json::PagePreview> {
    crate::db::page_json::preview_page_json(&text)
}

/// `import_page_json` for text the webview already holds. Creates a new page the same
/// way, whole or not at all.
#[tauri::command]
pub fn import_page_text(
    state: State<DbState>,
    space_id: String,
    text: String,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    crate::db::page_json::import_page_json(&conn, &space_id, &text)
}

/// Creates a new page in `space_id` from a Nookly page file the user picked. Never
/// changes an existing page, and creates nothing when the file is refused.
#[tauri::command]
pub fn import_page_json(
    state: State<DbState>,
    space_id: String,
    path: String,
) -> AppResult<Entity> {
    let text = read_page_file(&path)?;
    let conn = state.0.lock().unwrap();
    crate::db::page_json::import_page_json(&conn, &space_id, &text)
}

#[tauri::command]
pub fn get_note_code_language(
    state: State<DbState>,
    entity_id: String,
) -> AppResult<Option<String>> {
    let conn = state.0.lock().unwrap();
    notes::get_note_code_language(&conn, &entity_id)
}

#[tauri::command]
pub fn set_note_code_language(
    state: State<DbState>,
    entity_id: String,
    language: Option<String>,
) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    notes::set_note_code_language(&conn, &entity_id, language)
}
