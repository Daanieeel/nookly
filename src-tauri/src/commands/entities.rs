use crate::db::entities::{self, Entity, EntityPatch};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_entity(
    state: State<DbState>,
    space_id: String,
    r#type: String,
    title: String,
    icon: Option<String>,
) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    entities::create_entity(&conn, space_id, r#type, title, icon)
}

#[tauri::command]
pub fn list_entities(
    state: State<DbState>,
    space_id: Option<String>,
    include_deleted: bool,
) -> AppResult<Vec<Entity>> {
    let conn = state.0.lock().unwrap();
    entities::list_entities(&conn, space_id.as_deref(), include_deleted)
}

#[tauri::command]
pub fn update_entity(state: State<DbState>, id: String, patch: EntityPatch) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    entities::update_entity(&conn, &id, patch)
}

#[tauri::command]
pub fn get_entity(state: State<DbState>, id: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    entities::get_entity(&conn, &id)
}

#[tauri::command]
pub fn soft_delete_entity(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    entities::soft_delete_entity(&conn, &id)
}

#[tauri::command]
pub fn restore_entity(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    entities::restore_entity(&conn, &id)
}

#[tauri::command]
pub fn hard_delete_entity(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    entities::hard_delete_entity(&conn, &id)
}

/// A copy of the entity in the same Space, through its registered schema.
#[tauri::command]
pub fn duplicate_entity(state: State<DbState>, id: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    let data = crate::db::schema::duplicate(&conn, &id)?;
    let new_id = crate::db::schema::payload_id(&data).ok_or_else(|| {
        crate::error::AppError::Db("internal: could not locate id in duplicate result".into())
    })?;
    entities::get_entity(&conn, &new_id)
}

/// Turns an entity into another type in place, through the conversions
/// registered in `schema` (the same ones the CLI's `convert` verb offers).
#[tauri::command]
pub fn convert_entity(
    state: State<DbState>,
    id: String,
    to: String,
) -> AppResult<crate::db::entities::Entity> {
    let conn = state.0.lock().unwrap();
    crate::db::schema::convert(&conn, &id, &to)?;
    crate::db::entities::get_entity(&conn, &id)
}
