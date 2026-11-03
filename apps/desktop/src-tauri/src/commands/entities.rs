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
    let conn = state.conn()?;
    entities::create_entity(&conn, space_id, r#type, title, icon)
}

#[tauri::command]
pub fn list_entities(
    state: State<DbState>,
    space_id: Option<String>,
    include_deleted: bool,
) -> AppResult<Vec<Entity>> {
    let conn = state.conn()?;
    entities::list_entities(&conn, space_id.as_deref(), include_deleted)
}

#[tauri::command]
pub fn update_entity(state: State<DbState>, id: String, patch: EntityPatch) -> AppResult<Entity> {
    let conn = state.conn()?;
    entities::update_entity(&conn, &id, patch)
}

#[tauri::command]
pub fn get_entity(state: State<DbState>, id: String) -> AppResult<Entity> {
    let conn = state.conn()?;
    // A mention written with its readable key (`JOT-12`) asks by key.
    let id = entities::resolve_entity_ref(&conn, &id)?;
    entities::get_entity(&conn, &id)
}

#[tauri::command]
pub fn touch_entity_opened(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    entities::touch_entity_opened(&conn, &id)
}

#[tauri::command]
pub fn soft_delete_entity(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    entities::soft_delete_entity(&conn, &id)
}

#[tauri::command]
pub fn restore_entity(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    entities::restore_entity(&conn, &id)
}

#[tauri::command]
pub fn hard_delete_entity(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    entities::hard_delete_entity(&conn, &id)
}

#[tauri::command]
pub fn empty_trash(state: State<DbState>) -> AppResult<usize> {
    let conn = state.conn()?;
    entities::empty_trash(&conn)
}

/// A copy of the entity in the same Space, through its registered schema.
#[tauri::command]
pub fn duplicate_entity(state: State<DbState>, id: String) -> AppResult<Entity> {
    let conn = state.conn()?;
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
    let conn = state.conn()?;
    crate::db::schema::convert(&conn, &id, &to)?;
    crate::db::entities::get_entity(&conn, &id)
}
