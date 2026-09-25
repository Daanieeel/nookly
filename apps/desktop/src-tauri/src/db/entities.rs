use crate::db::search;
use crate::db::space_modules;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub space_id: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub title: String,
    pub icon: Option<String>,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    /// Short human readable id, Jira style: the type's `key_prefix` plus a number
    /// counted per prefix, e.g. `TSK-14`. Assigned once at creation, never reused.
    pub key: String,
    /// When the entity was last opened in the app, set by `touch_entity_opened`.
    /// Null if it was created but never opened. In preparation for a future
    /// smart 'reclaim space' feature — nothing reads this yet.
    pub last_opened_at: Option<String>,
}

/// Three letter prefix of an entity's `key`. Types that read as one kind of thing
/// (a task and its sub-tasks, a session and its template) share a prefix and counter.
/// The backfill in `migrations.rs` repeats this mapping in SQL for existing rows.
pub fn key_prefix(entity_type: &str) -> &'static str {
    match entity_type {
        "task" | "sub_task" => "TSK",
        "note" => "NOT",
        "jot" => "JOT",
        "course" => "CRS",
        "course_notes" => "CNT",
        "semester" => "SEM",
        "session" | "session_template" => "SES",
        "exam" => "EXM",
        "index_card_deck" => "DCK",
        "study_block" => "STB",
        "assignment" => "ASG",
        "file" => "FIL",
        "bookmark" => "BMK",
        _ => "ENT",
    }
}

/// Public because other modules join `entities.*` into their own queries
/// (e.g. `tasks`, `courses`) and need to parse the base-entity columns back out.
pub fn row_to_entity(row: &rusqlite::Row) -> rusqlite::Result<Entity> {
    Ok(Entity {
        id: row.get("id")?,
        space_id: row.get("space_id")?,
        entity_type: row.get("type")?,
        title: row.get("title")?,
        icon: row.get("icon")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
        key: format!(
            "{}-{}",
            row.get::<_, String>("key_prefix")?,
            row.get::<_, i64>("key_number")?
        ),
        last_opened_at: row.get("last_opened_at")?,
    })
}

/// Records that `id` was just opened in the app. Best-effort bookkeeping for a
/// future smart 'reclaim space' feature — never fails a navigation over this.
pub fn touch_entity_opened(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE entities SET last_opened_at = ?1 WHERE id = ?2",
        params![super::now(), id],
    )?;
    Ok(())
}

pub fn create_entity(
    conn: &Connection,
    space_id: String,
    entity_type: String,
    title: String,
    icon: Option<String>,
) -> AppResult<Entity> {
    let id = super::new_id();
    let now = super::now();
    let prefix = key_prefix(&entity_type);
    // Trashed entities keep their number, so MAX never hands one out twice.
    let number: i64 = conn.query_row(
        "SELECT COALESCE(MAX(key_number), 0) + 1 FROM entities WHERE key_prefix = ?1",
        params![prefix],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT INTO entities (id, space_id, type, title, icon, pinned, created_at, updated_at, deleted_at, key_prefix, key_number)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6, NULL, ?7, ?8)",
        params![id, space_id, entity_type, title, icon, now, prefix, number],
    )?;
    search::index_entity_title(conn, &id, &space_id, &title)?;
    for module_key in space_modules::module_keys_for_entity_type(&entity_type) {
        space_modules::add_space_module(conn, &space_id, module_key)?;
    }
    Ok(Entity {
        id,
        space_id,
        entity_type,
        title,
        icon,
        pinned: false,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
        key: format!("{prefix}-{number}"),
        last_opened_at: None,
    })
}

/// Accepts either an entity id or its key (`TSK-14`, any case) and returns the id.
/// Anything not shaped like a key passes through untouched, so the caller's own
/// lookup still reports a missing id the usual way.
pub fn resolve_entity_ref(conn: &Connection, raw: &str) -> AppResult<String> {
    let Some((prefix, number)) = raw.trim().split_once('-') else {
        return Ok(raw.to_string());
    };
    let is_key = prefix.len() == 3
        && prefix.chars().all(|c| c.is_ascii_alphabetic())
        && !number.is_empty()
        && number.chars().all(|c| c.is_ascii_digit());
    if !is_key {
        return Ok(raw.to_string());
    }
    conn.query_row(
        "SELECT id FROM entities WHERE key_prefix = ?1 AND key_number = ?2",
        params![
            prefix.to_ascii_uppercase(),
            number.parse::<i64>().unwrap_or(0)
        ],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("entity {}", raw.trim().to_ascii_uppercase())))
}

/// The `TSK-14` style key of an entity id, for outputs that otherwise only carry the id.
pub fn entity_key(conn: &Connection, id: &str) -> AppResult<String> {
    Ok(get_entity(conn, id)?.key)
}

pub fn get_entity(conn: &Connection, id: &str) -> AppResult<Entity> {
    conn.query_row(
        "SELECT * FROM entities WHERE id = ?1",
        params![id],
        row_to_entity,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("entity {id}")))
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityPatch {
    pub title: Option<String>,
    /// `Some` sets the icon; clearing it back to the type default isn't exposed here.
    pub icon: Option<String>,
    pub pinned: Option<bool>,
    /// Moves the entity, and everything structurally owned by it, to another Space.
    pub space_id: Option<String>,
}

pub fn update_entity(conn: &Connection, id: &str, patch: EntityPatch) -> AppResult<Entity> {
    let mut entity = get_entity(conn, id)?;
    if let Some(title) = patch.title {
        if title != entity.title && entity.entity_type == "file" {
            sync_media_block_names(conn, id, &title)?;
        }
        entity.title = title;
    }
    if let Some(icon) = patch.icon {
        entity.icon = Some(icon);
    }
    if let Some(pinned) = patch.pinned {
        entity.pinned = pinned;
    }
    if let Some(space_id) = patch.space_id.filter(|s| *s != entity.space_id) {
        move_to_space(conn, id, &space_id)?;
        entity.space_id = space_id;
    }
    let now = super::now();
    conn.execute(
        "UPDATE entities SET title = ?1, icon = ?2, pinned = ?3, updated_at = ?4 WHERE id = ?5",
        params![entity.title, entity.icon, entity.pinned as i64, now, id],
    )?;
    entity.updated_at = now;
    search::index_entity_title(conn, &entity.id, &entity.space_id, &entity.title)?;
    Ok(entity)
}

/// Media blocks (`/file`, image, video, audio) hold nothing but one mention of
/// their File, so its label is the file's name, not the author's words: a rename
/// rewrites it. Inline @mentions in prose keep whatever text the author left.
fn sync_media_block_names(conn: &Connection, file_id: &str, title: &str) -> AppResult<()> {
    let target = format!("(mention:{file_id})");
    let label: String = title.chars().filter(|c| *c != '[' && *c != ']').collect();
    let mut stmt = conn.prepare(
        "SELECT id, content FROM blocks
         WHERE block_type IN ('file', 'image', 'video', 'audio') AND content LIKE ?1",
    )?;
    let rows = stmt
        .query_map(params![format!("%{target}")], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (block_id, content) in rows {
        // Exactly `[name](mention:<id>)`, the only shape a media block stores.
        let name = content
            .trim()
            .strip_prefix('[')
            .and_then(|c| c.strip_suffix(&target))
            .and_then(|c| c.strip_suffix(']'));
        if name.is_none_or(|n| n.contains(['[', ']'])) {
            continue;
        }
        conn.execute(
            "UPDATE blocks SET content = ?1 WHERE id = ?2",
            params![format!("[{label}]{target}"), block_id],
        )?;
    }
    Ok(())
}

/// Moves `id` to `space_id` along with everything it structurally owns (see
/// `MovesWith`), so a Sub-task or a Course's Sessions never stay behind in the old
/// Space. Labels are siloed per Space, so labels from the old one are detached.
fn move_to_space(conn: &Connection, id: &str, space_id: &str) -> AppResult<()> {
    use crate::db::relationships::{
        list_relationships, lookup_relationship_type, Direction, MovesWith,
    };

    let space_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM spaces WHERE id = ?1",
        params![space_id],
        |row| row.get(0),
    )?;
    if space_exists == 0 {
        return Err(AppError::NotFound(format!("space {space_id}")));
    }

    let owned_by =
        |r: &crate::db::relationships::Relationship, current: &str| match lookup_relationship_type(
            &r.relationship_type,
        )
        .map(|def| def.moves_with)
        {
            Some(MovesWith::FromFollowsTo) if r.from_entity_id == current => {
                Some(r.to_entity_id.clone())
            }
            Some(MovesWith::ToFollowsFrom) if r.to_entity_id == current => {
                Some(r.from_entity_id.clone())
            }
            _ => None,
        };
    let relationships = list_relationships(conn, id, Direction::Both)?;
    if let Some(owner) = relationships.iter().find_map(|r| owned_by(r, id)) {
        return Err(AppError::InvalidInput(format!(
            "{} belongs to {} and moves together with it; move {} instead",
            entity_key(conn, id)?,
            entity_key(conn, &owner)?,
            entity_key(conn, &owner)?,
        )));
    }

    let mut moving = vec![id.to_string()];
    let mut seen = std::collections::HashSet::new();
    while let Some(current) = moving.pop() {
        if !seen.insert(current.clone()) {
            continue;
        }
        for r in list_relationships(conn, &current, Direction::Both)? {
            let other = if r.from_entity_id == current {
                &r.to_entity_id
            } else {
                &r.from_entity_id
            };
            if owned_by(&r, other).as_deref() == Some(current.as_str()) {
                moving.push(other.clone());
            }
        }
    }

    let now = super::now();
    for moved in &seen {
        let entity = get_entity(conn, moved)?;
        conn.execute(
            "UPDATE entities SET space_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![space_id, now, moved],
        )?;
        search::index_entity_title(conn, moved, space_id, &entity.title)?;
        conn.execute(
            "DELETE FROM entity_labels WHERE entity_id = ?1
             AND label_id IN (SELECT id FROM labels WHERE space_id != ?2)",
            params![moved, space_id],
        )?;
        for module_key in space_modules::module_keys_for_entity_type(&entity.entity_type) {
            space_modules::add_space_module(conn, space_id, module_key)?;
        }
    }
    Ok(())
}

pub fn entity_exists(conn: &Connection, id: &str) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn list_entities(
    conn: &Connection,
    space_id: Option<&str>,
    include_deleted: bool,
) -> AppResult<Vec<Entity>> {
    // `course_notes` (§ course sub-dashboard) must stay invisible everywhere except
    // the Course page that embeds it directly by id via `get_course_notes` — never
    // in mentions, entity pickers, search, Dashboard Recent/Pinned, or any other
    // general listing. Every one of those goes through `list_entities`, so excluding
    // it here is the single choke point rather than patching each call site.
    let mut sql = String::from("SELECT * FROM entities WHERE type != 'course_notes'");
    if !include_deleted {
        sql.push_str(" AND deleted_at IS NULL");
    }
    if space_id.is_some() {
        sql.push_str(" AND space_id = ?1");
    }
    sql.push_str(" ORDER BY created_at ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = match space_id {
        Some(sid) => stmt.query_map(params![sid], row_to_entity)?,
        None => stmt.query_map([], row_to_entity)?,
    };
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn soft_delete_entity(conn: &Connection, id: &str) -> AppResult<()> {
    let now = super::now();
    let affected = conn.execute(
        "UPDATE entities SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("entity {id}")));
    }
    Ok(())
}

pub fn restore_entity(conn: &Connection, id: &str) -> AppResult<()> {
    let now = super::now();
    let affected = conn.execute(
        "UPDATE entities SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NOT NULL",
        params![now, id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("entity {id}")));
    }
    Ok(())
}

/// Permanently removes a trashed entity and every row in another table keyed by
/// its id — there is no `ON DELETE CASCADE` anywhere in this schema (SQLite FK
/// enforcement is never turned on), so each subtype/child table has to be swept
/// explicitly. Only ever allowed on an already soft-deleted entity — this is the
/// Trash view's "Delete Forever", not a general hard-delete.
pub fn hard_delete_entity(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM relationships WHERE from_entity_id = ?1 OR to_entity_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM entity_labels WHERE entity_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM blocks WHERE entity_id = ?1", params![id])?;
    conn.execute(
        "DELETE FROM mentions WHERE from_entity_id = ?1 OR to_entity_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM tasks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM courses WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM semesters WHERE entity_id = ?1", params![id])?;
    conn.execute(
        "DELETE FROM session_templates WHERE entity_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM sessions WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM exams WHERE entity_id = ?1", params![id])?;
    conn.execute(
        "DELETE FROM index_card_decks WHERE entity_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM index_card_reviews WHERE card_id IN
         (SELECT id FROM index_cards WHERE deck_entity_id = ?1)",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM index_cards WHERE deck_entity_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM study_blocks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM assignments WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM files WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM bookmarks WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM search_index WHERE entity_id = ?1", params![id])?;

    let affected = conn.execute(
        "DELETE FROM entities WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("trashed entity {id}")));
    }
    Ok(())
}

/// Permanently removes every trashed entity in every Space, all or nothing.
/// Returns how many were removed.
pub fn empty_trash(conn: &Connection) -> AppResult<usize> {
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM entities WHERE deleted_at IS NOT NULL")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    conn.execute_batch("SAVEPOINT empty_trash")?;
    let result = ids.iter().try_for_each(|id| hard_delete_entity(conn, id));
    match result {
        Ok(()) => {
            conn.execute_batch("RELEASE empty_trash")?;
            Ok(ids.len())
        }
        Err(e) => {
            conn.execute_batch("ROLLBACK TO empty_trash; RELEASE empty_trash")?;
            Err(e)
        }
    }
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
    fn renaming_a_file_updates_media_blocks_but_not_prose_mentions() {
        use crate::db::notes::{create_block, list_blocks};
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let file =
            create_entity(&conn, space.id.clone(), "file".into(), "a.pdf".into(), None).unwrap();
        let note = create_entity(&conn, space.id.clone(), "note".into(), "N".into(), None).unwrap();
        let mention = format!("[a.pdf](mention:{})", file.id);
        let prose = format!("See {mention} here");
        create_block(&conn, &note.id, "file".into(), mention, None, None, None).unwrap();
        create_block(
            &conn,
            &note.id,
            "paragraph".into(),
            prose.clone(),
            None,
            None,
            None,
        )
        .unwrap();

        let patch = EntityPatch {
            title: Some("b.pdf".into()),
            ..Default::default()
        };
        update_entity(&conn, &file.id, patch).unwrap();

        let blocks = list_blocks(&conn, &note.id).unwrap();
        assert_eq!(blocks[0].content, format!("[b.pdf](mention:{})", file.id));
        assert_eq!(blocks[1].content, prose);
    }

    #[test]
    fn keys_count_per_prefix_and_resolve_to_ids() {
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let task = create_entity(&conn, space.id.clone(), "task".into(), "A".into(), None).unwrap();
        let sub =
            create_entity(&conn, space.id.clone(), "sub_task".into(), "B".into(), None).unwrap();
        let note = create_entity(&conn, space.id.clone(), "note".into(), "C".into(), None).unwrap();
        assert_eq!(
            (task.key.as_str(), sub.key.as_str(), note.key.as_str()),
            ("TSK-1", "TSK-2", "NOT-1")
        );
        assert_eq!(get_entity(&conn, &sub.id).unwrap().key, "TSK-2");

        assert_eq!(resolve_entity_ref(&conn, "tsk-2").unwrap(), sub.id);
        assert_eq!(resolve_entity_ref(&conn, &note.id).unwrap(), note.id);
        assert!(resolve_entity_ref(&conn, "TSK-99").is_err());
    }

    #[test]
    fn soft_delete_excludes_from_default_list_and_restore_reverses_it() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let entity =
            create_entity(&conn, space.id.clone(), "note".into(), "Hello".into(), None).unwrap();

        soft_delete_entity(&conn, &entity.id).unwrap();

        let visible = list_entities(&conn, None, false).unwrap();
        assert!(visible.is_empty());

        let with_trash = list_entities(&conn, None, true).unwrap();
        assert_eq!(with_trash.len(), 1);
        assert!(with_trash[0].deleted_at.is_some());

        restore_entity(&conn, &entity.id).unwrap();
        let visible_again = list_entities(&conn, None, false).unwrap();
        assert_eq!(visible_again.len(), 1);
        assert!(visible_again[0].deleted_at.is_none());
    }

    #[test]
    fn hard_delete_requires_trashed_and_cleans_child_tables() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let parent =
            crate::db::tasks::create_task(&conn, space.id.clone(), "Parent".into(), None, None)
                .unwrap();
        let child =
            crate::db::tasks::create_subtask(&conn, parent.entity.id.clone(), "Child".into())
                .unwrap();

        // Refuses a live (non-trashed) entity.
        assert!(hard_delete_entity(&conn, &child.entity.id).is_err());

        soft_delete_entity(&conn, &child.entity.id).unwrap();
        hard_delete_entity(&conn, &child.entity.id).unwrap();

        assert!(get_entity(&conn, &child.entity.id).is_err());

        let task_row_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE entity_id = ?1",
                params![child.entity.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(task_row_count, 0);

        let rel_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM relationships WHERE from_entity_id = ?1 OR to_entity_id = ?1",
                params![child.entity.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rel_count, 0);
    }

    #[test]
    fn list_entities_never_includes_course_notes() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        create_entity(
            &conn,
            space.id.clone(),
            "note".into(),
            "Real note".into(),
            None,
        )
        .unwrap();
        create_entity(
            &conn,
            space.id.clone(),
            "course_notes".into(),
            "Algorithms Notes".into(),
            None,
        )
        .unwrap();

        let scoped = list_entities(&conn, Some(&space.id), false).unwrap();
        assert_eq!(scoped.len(), 1);
        assert_eq!(scoped[0].entity_type, "note");

        let global = list_entities(&conn, None, true).unwrap();
        assert!(global.iter().all(|e| e.entity_type != "course_notes"));
    }

    #[test]
    fn hard_delete_unknown_entity_errors() {
        let conn = setup();
        assert!(hard_delete_entity(&conn, "does-not-exist").is_err());
    }

    #[test]
    fn soft_delete_unknown_entity_errors() {
        let conn = setup();
        let result = soft_delete_entity(&conn, "does-not-exist");
        assert!(result.is_err());
    }

    fn two_spaces(conn: &Connection) -> (String, String) {
        let a = create_space(conn, "A".into(), None, "#000".into()).unwrap();
        let b = create_space(conn, "B".into(), None, "#000".into()).unwrap();
        (a.id, b.id)
    }

    fn move_to(conn: &Connection, id: &str, space_id: &str) -> AppResult<Entity> {
        update_entity(
            conn,
            id,
            EntityPatch {
                space_id: Some(space_id.into()),
                ..Default::default()
            },
        )
    }

    #[test]
    fn moving_carries_structural_children_and_drops_foreign_labels() {
        let conn = setup();
        let (a, b) = two_spaces(&conn);
        let course = crate::db::courses::create_course(&conn, a.clone(), "Algo".into()).unwrap();
        let session = crate::db::sessions::create_one_off_session(
            &conn,
            a.clone(),
            "Lecture".into(),
            course.id.clone(),
            "2026-01-05".into(),
            "10:00".into(),
            "11:00".into(),
            None,
        )
        .unwrap();
        let label =
            crate::db::labels::create_label(&conn, a.clone(), "x".into(), "#fff".into()).unwrap();
        crate::db::labels::attach_label(&conn, &course.id, &label.id).unwrap();

        let moved = move_to(&conn, &course.id, &b).unwrap();
        assert_eq!(moved.space_id, b);
        assert_eq!(get_entity(&conn, &session.entity.id).unwrap().space_id, b);
        assert!(crate::db::labels::list_labels_for_entity(&conn, &course.id)
            .unwrap()
            .is_empty());
        assert!(space_modules::list_space_modules(&conn, &b)
            .unwrap()
            .contains(&"sessions".to_string()));
    }

    #[test]
    fn a_structural_child_cannot_move_on_its_own() {
        let conn = setup();
        let (a, b) = two_spaces(&conn);
        let task = crate::db::tasks::create_task(&conn, a, "Parent".into(), None, None).unwrap();
        let sub = crate::db::tasks::create_subtask(&conn, task.entity.id, "Child".into()).unwrap();
        assert!(matches!(
            move_to(&conn, &sub.entity.id, &b),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn duplicate_copies_fields_labels_and_structural_parent() {
        let conn = setup();
        let (a, _) = two_spaces(&conn);
        let task = crate::db::tasks::create_task(
            &conn,
            a.clone(),
            "Parent".into(),
            None,
            Some("2026-02-01".into()),
        )
        .unwrap();
        let sub = crate::db::tasks::create_subtask(&conn, task.entity.id.clone(), "Child".into())
            .unwrap();
        let label = crate::db::labels::create_label(&conn, a, "x".into(), "#fff".into()).unwrap();
        crate::db::labels::attach_label(&conn, &task.entity.id, &label.id).unwrap();

        let copy = crate::db::schema::duplicate(&conn, &task.entity.id).unwrap();
        let copy_id = crate::db::schema::payload_id(&copy).unwrap();
        assert_ne!(copy_id, task.entity.id);
        assert_eq!(copy["entity"]["title"], "Parent (copy)");
        assert_eq!(copy["dueDate"], "2026-02-01");
        assert_eq!(
            crate::db::labels::list_labels_for_entity(&conn, &copy_id)
                .unwrap()
                .len(),
            1
        );

        let sub_copy = crate::db::schema::duplicate(&conn, &sub.entity.id).unwrap();
        let sub_copy_id = crate::db::schema::payload_id(&sub_copy).unwrap();
        let siblings = crate::db::tasks::list_subtasks(&conn, &task.entity.id).unwrap();
        assert!(siblings.iter().any(|t| t.entity.id == sub_copy_id));
    }

    #[test]
    fn a_task_converts_into_a_sub_task_once() {
        let conn = setup();
        let (a, _) = two_spaces(&conn);
        let parent =
            crate::db::tasks::create_task(&conn, a.clone(), "Parent".into(), None, None).unwrap();
        let task = crate::db::tasks::create_task(&conn, a, "Loose".into(), None, None).unwrap();
        crate::db::tasks::convert_to_subtask(&conn, &task.entity.id, &parent.entity.id).unwrap();
        assert_eq!(
            get_entity(&conn, &task.entity.id).unwrap().entity_type,
            "sub_task"
        );
        assert_eq!(
            crate::db::tasks::list_subtasks(&conn, &parent.entity.id)
                .unwrap()
                .len(),
            1
        );
        assert!(
            crate::db::tasks::convert_to_subtask(&conn, &parent.entity.id, &task.entity.id)
                .is_err()
        );
    }

    #[test]
    fn empty_trash_removes_only_trashed_entities() {
        let conn = setup();
        let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
        let kept =
            create_entity(&conn, space.id.clone(), "note".into(), "Kept".into(), None).unwrap();
        let gone =
            create_entity(&conn, space.id.clone(), "note".into(), "Gone".into(), None).unwrap();
        soft_delete_entity(&conn, &gone.id).unwrap();

        assert_eq!(empty_trash(&conn).unwrap(), 1);
        assert!(get_entity(&conn, &kept.id).is_ok());
        assert!(get_entity(&conn, &gone.id).is_err());
        assert_eq!(empty_trash(&conn).unwrap(), 0);
    }
}
