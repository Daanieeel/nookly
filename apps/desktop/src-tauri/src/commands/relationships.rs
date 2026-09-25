use crate::db::relationships::{self, Direction, Relationship, RelationshipTypeInfo};
use crate::db::DbState;
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub fn create_relationship(
    state: State<DbState>,
    from_entity_id: String,
    to_entity_id: String,
    relationship_type: String,
    from_block_id: Option<String>,
    to_block_id: Option<String>,
) -> AppResult<Relationship> {
    let conn = state.0.lock().unwrap();
    relationships::create_relationship(
        &conn,
        from_entity_id,
        to_entity_id,
        relationship_type,
        from_block_id,
        to_block_id,
    )
}

#[tauri::command]
pub fn list_relationships(
    state: State<DbState>,
    entity_id: String,
    direction: String,
) -> AppResult<Vec<Relationship>> {
    let conn = state.0.lock().unwrap();
    let direction = match direction.as_str() {
        "from" => Direction::From,
        "to" => Direction::To,
        _ => Direction::Both,
    };
    relationships::list_relationships(&conn, &entity_id, direction)
}

#[tauri::command]
pub fn delete_relationship(state: State<DbState>, id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    relationships::delete_relationship(&conn, &id)
}

#[tauri::command]
pub fn list_relationship_types() -> Vec<RelationshipTypeInfo> {
    relationships::list_relationship_types()
}
