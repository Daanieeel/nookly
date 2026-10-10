//! Export and import of any entity that has a `PortableDef` (see `db::portable`): the
//! commands the app's export menus and import dialog call. One set serves every type, so
//! a new portable type needs no new command.

use crate::db::entities::Entity;
use crate::db::portable::{self, PortablePreview, MAX_IMPORT_BYTES};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use tauri::State;

/// The entity as the text of its file, for sharing it without a path.
#[tauri::command]
pub fn render_entity_json(state: State<DbState>, entity_id: String) -> AppResult<String> {
    let conn = state.0.lock().unwrap();
    portable::export_entity(&conn, &entity_id)
}

/// Writes the entity as a Nookly file. `path` comes from the native save dialog, so the
/// user chose it explicitly. Nothing is written when the entity cannot be exported.
#[tauri::command]
pub fn export_entity_json(state: State<DbState>, entity_id: String, path: String) -> AppResult<()> {
    let json = {
        let conn = state.0.lock().unwrap();
        portable::export_entity(&conn, &entity_id)?
    };
    std::fs::write(&path, json).map_err(|err| AppError::Io(err.to_string()))
}

/// Reads a file for the import dialog. The size limit is checked before the read.
fn read_file(path: &str) -> AppResult<String> {
    let size = std::fs::metadata(path)
        .map_err(|err| AppError::Io(err.to_string()))?
        .len();
    if size > MAX_IMPORT_BYTES {
        return Err(AppError::InvalidInput(
            "this file is too large to import (the limit is 20 MB)".into(),
        ));
    }
    std::fs::read_to_string(path).map_err(|err| AppError::Io(err.to_string()))
}

/// Says what importing the file would create, without creating anything.
#[tauri::command]
pub fn preview_entity_json(path: String) -> AppResult<PortablePreview> {
    portable::preview(&read_file(&path)?)
}

/// `preview_entity_json` for a file whose text the webview already holds (a drop or a
/// paste, which hand over contents and no path). Same checks, same limit.
#[tauri::command]
pub fn preview_entity_text(text: String) -> AppResult<PortablePreview> {
    portable::preview(&text)
}

/// Creates a new entity in `space_id` from a file the user picked, filed under
/// `parent_id` when its type needs one (an assignment needs a course). Never changes an
/// existing entity, and creates nothing when the file is refused.
#[tauri::command]
pub fn import_entity_json(
    state: State<DbState>,
    space_id: String,
    path: String,
    parent_id: Option<String>,
) -> AppResult<Entity> {
    let text = read_file(&path)?;
    let conn = state.0.lock().unwrap();
    portable::import(&conn, &space_id, parent_id.as_deref(), &text)
}

/// `import_entity_json` for text the webview already holds.
#[tauri::command]
pub fn import_entity_text(
    state: State<DbState>,
    space_id: String,
    text: String,
    parent_id: Option<String>,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    portable::import(&conn, &space_id, parent_id.as_deref(), &text)
}
