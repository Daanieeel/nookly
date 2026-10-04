use crate::error::{AppError, AppResult};
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
        "calendar_entry" | "calendar_entry_template" => &["calendar"],
        "exam" | "study_block" => &["exams"],
        "index_card_deck" => &["decks"],
        "assignment" => &["assignments"],
        "file" => &["files"],
        "bookmark" => &["bookmarks"],
        "recipe" => &["recipes"],
        _ => &[],
    }
}

/// Entity `type`s that belong to `module_key` on its own (see
/// `MODULE_ENTITY_TYPES` in `src/lib/modules.ts`). Saved Views are matched
/// separately, by the module stored on the `views` row.
fn entity_types_for_module(module_key: &str) -> &'static [&'static str] {
    match module_key {
        "tasks" => &["task", "sub_task"],
        "notes" => &["note"],
        "jots" => &["jot"],
        "courses" => &["course", "course_notes"],
        "semesters" => &["semester"],
        "sessions" => &["session", "session_template"],
        "calendar" => &["calendar_entry", "calendar_entry_template"],
        "exams" => &["exam", "study_block"],
        "decks" => &["index_card_deck"],
        "assignments" => &["assignment"],
        "files" => &["file"],
        "bookmarks" => &["bookmark"],
        "recipes" => &["recipe"],
        _ => &[],
    }
}

/// The module plus the passengers removed with it (`MODULE_PASSENGERS` in
/// `src/lib/modules.ts`). Empty for an unknown key or a passenger on its own.
fn removal_group(module_key: &str) -> &'static [&'static str] {
    match module_key {
        "courses" => &["courses", "semesters"],
        "tasks" => &["tasks"],
        "notes" => &["notes"],
        "jots" => &["jots"],
        "sessions" => &["sessions"],
        "calendar" => &["calendar"],
        "exams" => &["exams"],
        "decks" => &["decks"],
        "assignments" => &["assignments"],
        "files" => &["files"],
        "bookmarks" => &["bookmarks"],
        "recipes" => &["recipes"],
        _ => &[],
    }
}

/// `type IN (...) OR a Saved View of this module`, for one module's entities in
/// one Space. Types come from the static table above, never from input.
fn module_entities_filter(module_key: &str) -> String {
    let types = entity_types_for_module(module_key)
        .iter()
        .map(|t| format!("'{t}'"))
        .collect::<Vec<_>>();
    let by_type = if types.is_empty() {
        "0".to_string()
    } else {
        format!("type IN ({})", types.join(", "))
    };
    format!(
        "space_id = ?1 AND ({by_type} OR (type = 'view' AND id IN \
         (SELECT entity_id FROM views WHERE module = '{module_key}')))"
    )
}

/// Writes the `space_modules` row if it does not exist. Never reveals a
/// removed module; that is `add_space_module`'s job.
fn ensure_space_module(conn: &Connection, space_id: &str, module_key: &str) -> AppResult<()> {
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

/// Idempotently marks `module_key` as added to `space_id`. Sticky: once added,
/// it stays even if every entity of that module is later deleted — see the
/// `space_modules` migration comment. Joins at the end of that Space's manually
/// ordered module list. Adding a module that was removed brings it back, along
/// with every entity hidden when it was removed (not the ones deleted then).
pub fn add_space_module(conn: &Connection, space_id: &str, module_key: &str) -> AppResult<()> {
    ensure_space_module(conn, space_id, module_key)?;
    let revealed = conn.execute(
        "UPDATE space_modules SET hidden_at = NULL
         WHERE space_id = ?1 AND module_key = ?2 AND hidden_at IS NOT NULL",
        params![space_id, module_key],
    )?;
    if revealed > 0 {
        conn.execute(
            &format!(
                "UPDATE entities SET deleted_at = NULL, hidden_at = NULL
                 WHERE hidden_at IS NOT NULL AND {}",
                module_entities_filter(module_key)
            ),
            params![space_id],
        )?;
    }
    Ok(())
}

/// Removes a module (and its passengers) from a Space. Atomic.
///
/// `delete_content = false` hides its entities: kept as they are, out of every
/// list, search and Pinned, and back when the module is added again.
/// `delete_content = true` moves them to Trash instead, where restoring or
/// deleting them forever works as for any trashed entity. Entities already in
/// Trash stay there either way.
pub fn remove_space_module(
    conn: &Connection,
    space_id: &str,
    module_key: &str,
    delete_content: bool,
) -> AppResult<()> {
    let group = removal_group(module_key);
    if group.is_empty() {
        return Err(AppError::InvalidInput(format!(
            "module '{module_key}' cannot be removed on its own"
        )));
    }
    conn.execute_batch("SAVEPOINT remove_space_module")?;
    let result = (|| -> AppResult<()> {
        let now = super::now();
        for key in group {
            ensure_space_module(conn, space_id, key)?;
            conn.execute(
                "UPDATE space_modules SET hidden_at = ?3
                 WHERE space_id = ?1 AND module_key = ?2 AND hidden_at IS NULL",
                params![space_id, key, now],
            )?;
            let hidden_marker = if delete_content { "NULL" } else { "?2" };
            conn.execute(
                &format!(
                    "UPDATE entities SET deleted_at = ?2, hidden_at = {hidden_marker}, updated_at = ?2
                     WHERE deleted_at IS NULL AND {}",
                    module_entities_filter(key)
                ),
                params![space_id, now],
            )?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => {
            conn.execute_batch("RELEASE remove_space_module")?;
            Ok(())
        }
        Err(e) => {
            conn.execute_batch("ROLLBACK TO remove_space_module; RELEASE remove_space_module")?;
            Err(e)
        }
    }
}

/// Every module added to this Space and not removed since — explicitly (the sidebar's '+') or
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
            ensure_space_module(conn, space_id, module_key)?;
        }
    }

    let mut stmt = conn.prepare(
        "SELECT module_key FROM space_modules
         WHERE space_id = ?1 AND hidden_at IS NULL ORDER BY position ASC",
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
        crate::db::test_conn()
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

    fn visible_titles(conn: &Connection, space_id: &str) -> Vec<String> {
        crate::db::entities::list_entities(conn, Some(space_id), false)
            .unwrap()
            .into_iter()
            .map(|e| e.title)
            .collect()
    }

    #[test]
    fn removing_a_module_keeps_and_hides_its_data() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let hidden =
            crate::db::tasks::create_task(&conn, space.id.clone(), "Hidden".into(), None, None)
                .unwrap();
        let trashed =
            crate::db::tasks::create_task(&conn, space.id.clone(), "Trashed".into(), None, None)
                .unwrap();
        crate::db::entities::soft_delete_entity(&conn, &trashed.entity.id).unwrap();
        crate::db::notes::create_page(&conn, space.id.clone(), "note", "Note".into()).unwrap();

        remove_space_module(&conn, &space.id, "tasks", false).unwrap();

        assert_eq!(list_space_modules(&conn, &space.id).unwrap(), vec!["notes"]);
        assert_eq!(visible_titles(&conn, &space.id), vec!["Note"]);
        // Kept data is not Trash, so it cannot be restored or erased from there.
        let trash = crate::db::entities::list_entities(&conn, Some(&space.id), true).unwrap();
        assert!(trash.iter().all(|e| e.id != hidden.entity.id));
        assert!(crate::db::entities::restore_entity(&conn, &hidden.entity.id).is_err());
        assert!(crate::db::entities::hard_delete_entity(&conn, &hidden.entity.id).is_err());
        crate::db::entities::empty_trash(&conn).unwrap();

        add_space_module(&conn, &space.id, "tasks").unwrap();

        let mut titles = visible_titles(&conn, &space.id);
        titles.sort();
        assert_eq!(titles, vec!["Hidden", "Note"]);
        // What was already in Trash before the removal stays in Trash.
        assert!(!titles.contains(&"Trashed".to_string()));
    }

    #[test]
    fn removing_with_content_sends_it_to_trash() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let task =
            crate::db::tasks::create_task(&conn, space.id.clone(), "Task".into(), None, None)
                .unwrap();

        remove_space_module(&conn, &space.id, "tasks", true).unwrap();

        assert!(list_space_modules(&conn, &space.id).unwrap().is_empty());
        assert!(visible_titles(&conn, &space.id).is_empty());
        let trash = crate::db::entities::list_entities(&conn, Some(&space.id), true).unwrap();
        assert_eq!(trash.len(), 1);

        // The module stays removed (no backfill from the trashed task), the task
        // stays in Trash when the module is added back, and can be restored.
        assert!(list_space_modules(&conn, &space.id).unwrap().is_empty());
        add_space_module(&conn, &space.id, "tasks").unwrap();
        assert!(visible_titles(&conn, &space.id).is_empty());
        crate::db::entities::restore_entity(&conn, &task.entity.id).unwrap();
        assert_eq!(visible_titles(&conn, &space.id), vec!["Task"]);
    }

    #[test]
    fn removing_courses_takes_semesters_along_and_only_this_space() {
        let conn = setup();
        let work = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let home = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        crate::db::courses::create_course(&conn, work.id.clone(), "Algebra".into()).unwrap();
        crate::db::courses::create_course(&conn, home.id.clone(), "Latin".into()).unwrap();

        remove_space_module(&conn, &work.id, "courses", false).unwrap();

        assert!(list_space_modules(&conn, &work.id).unwrap().is_empty());
        assert!(visible_titles(&conn, &work.id).is_empty());
        assert_eq!(visible_titles(&conn, &home.id), vec!["Latin"]);
        assert!(remove_space_module(&conn, &work.id, "semesters", false).is_err());
        assert!(remove_space_module(&conn, &work.id, "nope", false).is_err());
    }
}
