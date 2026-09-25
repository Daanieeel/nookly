use crate::error::AppResult;
use rusqlite::{params, Connection};

/// Which module(s) a given `entities.type` belongs to. Mirrors
/// `MODULE_ENTITY_TYPES`/`MODULE_PASSENGERS` in `src/lib/modules.ts` — keep the
/// two in sync. Usually one module; a course also brings along `semesters`,
/// which exists only to organize courses and is never offered as its own
/// pick in the sidebar's "+" menu.
pub fn module_keys_for_entity_type(entity_type: &str) -> &'static [&'static str] {
    match entity_type {
        "task" | "sub_task" => &["tasks"],
        "note" => &["notes"],
        "jot" => &["jots"],
        "course" => &["courses", "semesters"],
        "course_notes" => &["courses"],
        "semester" => &["semesters"],
        "session" | "session_template" => &["sessions"],
        "exam" | "study_block" => &["exams"],
        "index_card_deck" => &["decks"],
        "assignment" => &["assignments"],
        "file" => &["files"],
        "bookmark" => &["bookmarks"],
        _ => &[],
    }
}

/// Idempotently marks `module_key` as added to `space_id`. Sticky: once added,
/// it stays even if every entity of that module is later deleted — see the
/// `space_modules` migration comment. Joins at the end of that Space's manually
/// ordered module list.
pub fn add_space_module(conn: &Connection, space_id: &str, module_key: &str) -> AppResult<()> {
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM space_modules WHERE space_id = ?1",
        params![space_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO space_modules (space_id, module_key, added_at, position) VALUES (?1, ?2, ?3, ?4)",
        params![space_id, module_key, super::now(), position],
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
        for module_key in module_keys_for_entity_type(entity_type) {
            add_space_module(conn, space_id, module_key)?;
        }
    }

    let mut stmt = conn.prepare(
        "SELECT module_key FROM space_modules WHERE space_id = ?1 ORDER BY position ASC",
    )?;
    let rows = stmt.query_map(params![space_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Applies a full drag-to-reorder drop within one Space: `ordered_keys` is
/// every module key it currently has, in the new order. A key that isn't
/// already added is silently ignored (`WHERE ... AND module_key = ?3` matches
/// nothing) rather than adding it — reordering never adds or removes modules.
pub fn reorder_space_modules(
    conn: &Connection,
    space_id: &str,
    ordered_keys: Vec<String>,
) -> AppResult<()> {
    for (position, module_key) in ordered_keys.iter().enumerate() {
        conn.execute(
            "UPDATE space_modules SET position = ?1 WHERE space_id = ?2 AND module_key = ?3",
            params![position as i64, space_id, module_key],
        )?;
    }
    Ok(())
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
    fn creating_a_course_also_adds_semesters() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        crate::db::courses::create_course(&conn, space.id.clone(), "Algebra".into()).unwrap();

        let mut modules = list_space_modules(&conn, &space.id).unwrap();
        modules.sort();
        assert_eq!(
            modules,
            vec!["courses".to_string(), "semesters".to_string()]
        );
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
