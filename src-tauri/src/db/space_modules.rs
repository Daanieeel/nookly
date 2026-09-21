use crate::error::AppResult;
use rusqlite::{params, Connection};

/// Which module a given `entities.type` belongs to. Mirrors `MODULE_ENTITY_TYPES`
/// in `src/lib/modules.ts` — keep the two in sync.
pub fn module_key_for_entity_type(entity_type: &str) -> Option<&'static str> {
    match entity_type {
        "task" | "sub_task" => Some("tasks"),
        "note" => Some("notes"),
        "jot" | "refinement" => Some("jots"),
        "course" | "semester" => Some("courses"),
        "session" | "session_template" => Some("sessions"),
        "exam" | "index_card_deck" | "study_block" => Some("exams"),
        "assignment" => Some("assignments"),
        "file" => Some("files"),
        "bookmark" => Some("bookmarks"),
        _ => None,
    }
}

/// Idempotently marks `module_key` as added to `space_id`. Sticky: once added,
/// it stays even if every entity of that module is later deleted — see the
/// `space_modules` migration comment.
pub fn add_space_module(conn: &Connection, space_id: &str, module_key: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO space_modules (space_id, module_key, added_at) VALUES (?1, ?2, ?3)",
        params![space_id, module_key, super::now()],
    )?;
    Ok(())
}

/// Every module ever added to this Space — explicitly (the sidebar's '+') or
/// implicitly (creating its first entity, handled in `entities::create_entity`).
///
/// Also lazily backfills: any module with entities in this Space (including
/// soft-deleted ones — they still prove the module was once in genuine use)
/// but no `space_modules` row yet — e.g. content created before this table
/// existed — gets one written here, so it becomes sticky from this read
/// onward instead of disappearing the next time its last entity is deleted.
pub fn list_space_modules(conn: &Connection, space_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT type FROM entities WHERE space_id = ?1")?;
    let entity_types: Vec<String> = stmt
        .query_map(params![space_id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    for entity_type in &entity_types {
        if let Some(module_key) = module_key_for_entity_type(entity_type) {
            add_space_module(conn, space_id, module_key)?;
        }
    }

    let mut stmt = conn.prepare("SELECT module_key FROM space_modules WHERE space_id = ?1")?;
    let rows = stmt.query_map(params![space_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::MIGRATIONS
            .to_latest(&mut conn)
            .unwrap();
        conn
    }

    #[test]
    fn explicit_add_is_idempotent_and_listed() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();

        add_space_module(&conn, &space.id, "tasks").unwrap();
        add_space_module(&conn, &space.id, "tasks").unwrap();

        let modules = list_space_modules(&conn, &space.id).unwrap();
        assert_eq!(modules, vec!["tasks".to_string()]);
    }

    #[test]
    fn stays_listed_after_its_only_entity_is_deleted() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let task =
            crate::db::tasks::create_task(&conn, space.id.clone(), "Task".into(), None, None)
                .unwrap();

        // First entity creation should have already recorded it (via the
        // `create_entity` hook), but list_space_modules' own backfill covers
        // it too either way.
        assert_eq!(list_space_modules(&conn, &space.id).unwrap(), vec!["tasks"]);

        crate::db::entities::soft_delete_entity(&conn, &task.entity.id).unwrap();
        assert_eq!(list_space_modules(&conn, &space.id).unwrap(), vec!["tasks"]);
    }

    #[test]
    fn backfills_modules_from_pre_existing_entities() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        crate::db::tasks::create_task(&conn, space.id.clone(), "Task".into(), None, None).unwrap();

        // Simulate content that predates this table by wiping any row the
        // create_entity hook already wrote.
        conn.execute("DELETE FROM space_modules", []).unwrap();

        let modules = list_space_modules(&conn, &space.id).unwrap();
        assert_eq!(modules, vec!["tasks".to_string()]);
    }
}
