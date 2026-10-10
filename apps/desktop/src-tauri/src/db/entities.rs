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
        "calendar_entry" | "calendar_entry_template" => "CAL",
        "exam" => "EXM",
        "index_card_deck" => "DCK",
        "study_block" => "STB",
        "assignment" => "ASG",
        "file" => "FIL",
        "bookmark" => "BMK",
        "recipe" => "RCP",
        "view" => "VEW",
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
    let space_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM spaces WHERE id = ?1)",
        params![space_id],
        |row| row.get(0),
    )?;
    if !space_exists {
        return Err(AppError::NotFound(format!("space {space_id}")));
    }
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

/// Like `get_entity`, but an entity of another type is `NotFound` too, so a verb
/// named for one type (`note get`, `note delete`) can never act on another.
pub fn get_entity_of_type(conn: &Connection, id: &str, entity_type: &str) -> AppResult<Entity> {
    let entity = get_entity(conn, id)?;
    if entity.entity_type != entity_type {
        return Err(AppError::NotFound(format!("{entity_type} {id}")));
    }
    Ok(entity)
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
    // Atomic: a rename that rewrites the labels of mentions across pages either lands
    // with the title, or not at all.
    super::atomically(conn, || update_entity_inner(conn, id, patch))
}

fn update_entity_inner(conn: &Connection, id: &str, patch: EntityPatch) -> AppResult<Entity> {
    let mut entity = get_entity(conn, id)?;
    let mut title_changed = false;
    if let Some(title) = patch.title {
        if title != entity.title {
            sync_mention_labels(conn, id, &entity.entity_type, &entity.title, &title)?;
        }
        title_changed = title != entity.title;
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
    if title_changed {
        set_title_override(conn, id, true)?;
    }
    Ok(entity)
}

/// Marks (or unmarks) a series occurrence's title as edited on its own, so a later
/// series rename leaves it alone. A no-op for anything that isn't an occurrence.
fn set_title_override(conn: &Connection, id: &str, on: bool) -> AppResult<()> {
    let bit = super::series::TITLE_OVERRIDE;
    for table in ["sessions", "calendar_entries"] {
        let expr = if on {
            "overridden_fields | ?2"
        } else {
            "overridden_fields & ~?2"
        };
        conn.execute(
            &format!(
                "UPDATE {table} SET overridden_fields = {expr}
                 WHERE entity_id = ?1 AND template_id IS NOT NULL"
            ),
            params![id, bit],
        )?;
    }
    Ok(())
}

pub(crate) fn clear_title_override(conn: &Connection, id: &str) -> AppResult<()> {
    set_title_override(conn, id, false)
}

/// Blocks whose text is prose, where a mention's label may be the file's name.
const PROSE_BLOCK_TYPES: &[&str] = &[
    "paragraph",
    "heading1",
    "heading2",
    "heading3",
    "heading4",
    "heading5",
    "heading6",
    "quote",
    "callout",
    "bulleted_list",
    "numbered_list",
    "checklist",
    "toggle",
    "table",
];

/// Media blocks (`/file`, image, video, audio) hold nothing but one mention of their
/// File, so their label is always the file's name.
const MEDIA_BLOCK_TYPES: &[&str] = &["file", "image", "video", "audio"];

/// A label as it sits in markdown: no brackets, and a literal `$` written `\$` (the
/// editor's inline format, which reads a bare one as math).
fn markdown_label(title: &str) -> String {
    title
        .chars()
        .filter(|c| *c != '[' && *c != ']')
        .collect::<String>()
        .replace('$', "\\$")
}

/// The name shown for an entity with no title, as the app writes it into a mention's
/// label ("Untitled Note"). Mirrors `labelForType` in the frontend's `entity-title.ts`.
fn untitled_label(entity_type: &str) -> String {
    let noun = match entity_type {
        "task" | "sub_task" => "Task",
        "note" => "Note",
        "jot" => "Jot",
        "course" => "Course",
        "course_notes" => "Course Notes",
        "semester" => "Semester",
        "session" | "session_template" => "Session",
        "exam" => "Exam",
        "index_card_deck" => "Deck",
        "study_block" => "Study Block",
        "assignment" => "Assignment",
        "file" => "File",
        "bookmark" => "Bookmark",
        "recipe" => "Recipe",
        "view" => "View",
        "space" => "Space",
        _ => "Item",
    };
    format!("Untitled {noun}")
}

/// After an entity is renamed, mentions that showed its old name show the new one. A label
/// the author wrote is left alone: only one equal to the old title (or, with no title,
/// to its "Untitled Note" fallback), or to that with a page suffix (`Slides (p. 3)` on a
/// `#p3` mention), counts as the default one. Runs inside the rename's savepoint, touches
/// only blocks that change and reindexes their pages so search finds the new name.
fn sync_mention_labels(
    conn: &Connection,
    file_id: &str,
    entity_type: &str,
    old_title: &str,
    new_title: &str,
) -> AppResult<()> {
    let mut stmt = conn
        .prepare("SELECT id, entity_id, block_type, content FROM blocks WHERE content LIKE ?1")?;
    let rows = stmt
        .query_map(params![format!("%(mention:{file_id}%")], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let label_pattern = regex::Regex::new(&format!(
        r"\[([^\]]*)\]\(mention:{}(#[a-zA-Z0-9_-]+)?\)",
        regex::escape(file_id)
    ))
    .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    // The old name as it may have been stored: as typed, trimmed, in markdown form, or the
    // fallback a title-less entity shows.
    let old_forms: Vec<String> = if old_title.trim().is_empty() {
        vec![untitled_label(entity_type)]
    } else {
        vec![
            old_title.to_string(),
            old_title.trim().to_string(),
            markdown_label(old_title),
            markdown_label(old_title.trim()),
        ]
    };
    let new_label = if new_title.trim().is_empty() {
        untitled_label(entity_type)
    } else {
        markdown_label(new_title.trim())
    };
    let target = format!("(mention:{file_id})");

    let mut changed_pages = std::collections::BTreeSet::new();
    for (block_id, entity_id, block_type, content) in rows {
        let rewritten = if MEDIA_BLOCK_TYPES.contains(&block_type.as_str()) {
            // Exactly `[name](mention:<id>)`, the only shape a media block stores.
            let is_plain = content
                .trim()
                .strip_prefix('[')
                .and_then(|c| c.strip_suffix(&target))
                .and_then(|c| c.strip_suffix(']'))
                .is_some_and(|name| !name.contains(['[', ']']));
            let label: String = if new_title.trim().is_empty() {
                untitled_label(entity_type)
            } else {
                new_title
                    .chars()
                    .filter(|c| *c != '[' && *c != ']')
                    .collect()
            };
            is_plain.then(|| format!("[{label}]{target}"))
        } else if PROSE_BLOCK_TYPES.contains(&block_type.as_str()) {
            let replaced = label_pattern.replace_all(&content, |caps: &regex::Captures| {
                let label = &caps[1];
                let fragment = caps.get(2).map_or("", |m| m.as_str());
                let page = fragment
                    .strip_prefix("#p")
                    .filter(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()));
                if old_forms.iter().any(|old| old == label) {
                    format!("[{new_label}](mention:{file_id}{fragment})")
                } else if page.is_some_and(|n| {
                    old_forms
                        .iter()
                        .any(|old| *label == format!("{old} (p. {n})"))
                }) {
                    let n = page.unwrap_or_default();
                    format!("[{new_label} (p. {n})](mention:{file_id}{fragment})")
                } else {
                    caps[0].to_string()
                }
            });
            Some(replaced.into_owned())
        } else {
            None
        };
        let Some(rewritten) = rewritten.filter(|r| *r != content) else {
            continue;
        };
        conn.execute(
            "UPDATE blocks SET content = ?1, updated_at = ?2 WHERE id = ?3",
            params![rewritten, super::now(), block_id],
        )?;
        changed_pages.insert(entity_id);
    }
    for entity_id in changed_pages {
        super::notes::reindex_page(conn, &entity_id)?;
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
    // Entities hidden along with a removed module (`hidden_at`) are never listed,
    // not even with `include_deleted`: they are not in Trash, they come back
    // when the module is added again.
    let mut sql =
        String::from("SELECT * FROM entities WHERE type != 'course_notes' AND hidden_at IS NULL");
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

/// Trashes an entity. A Task takes its live Sub-tasks along, stamped with the same
/// `deleted_at` so a restore can tell them from Sub-tasks trashed on their own.
pub fn soft_delete_entity(conn: &Connection, id: &str) -> AppResult<()> {
    super::atomically(conn, || {
        let now = super::now();
        let affected = conn.execute(
            "UPDATE entities SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now, id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!("entity {id}")));
        }
        conn.execute(
            "UPDATE entities SET deleted_at = ?1, updated_at = ?1
             WHERE deleted_at IS NULL AND id IN
               (SELECT from_entity_id FROM relationships
                WHERE to_entity_id = ?2 AND relationship_type = 'sub-task-of')",
            params![now, id],
        )?;
        Ok(())
    })
}

/// Restores an entity, and the Sub-tasks that went to Trash with it. A Sub-task
/// trashed separately (a different `deleted_at`) stays in Trash.
pub fn restore_entity(conn: &Connection, id: &str) -> AppResult<()> {
    super::atomically(conn, || {
        let now = super::now();
        let trashed_at: Option<String> = conn
            .query_row(
                "SELECT deleted_at FROM entities WHERE id = ?1 AND deleted_at IS NOT NULL AND hidden_at IS NULL",
                params![id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(trashed_at) = trashed_at else {
            return Err(AppError::NotFound(format!("entity {id}")));
        };
        conn.execute(
            "UPDATE entities SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        conn.execute(
            "UPDATE entities SET deleted_at = NULL, updated_at = ?1
             WHERE deleted_at = ?2 AND hidden_at IS NULL AND id IN
               (SELECT from_entity_id FROM relationships
                WHERE to_entity_id = ?3 AND relationship_type = 'sub-task-of')",
            params![now, trashed_at, id],
        )?;
        Ok(())
    })
}

/// Permanently removes a trashed entity and every row in another table keyed by
/// its id — there is no `ON DELETE CASCADE` anywhere in this schema (SQLite FK
/// enforcement is never turned on), so each subtype/child table has to be swept
/// explicitly. Only ever allowed on an already soft-deleted entity — this is the
/// Trash view's "Delete Forever", not a general hard-delete. All or nothing:
/// a failure halfway (a series template whose occurrences still point at it)
/// rolls back what was already swept.
pub fn hard_delete_entity(conn: &Connection, id: &str) -> AppResult<()> {
    super::atomically(conn, || sweep_entity(conn, id))
}

fn sweep_entity(conn: &Connection, id: &str) -> AppResult<()> {
    // Checked before anything is swept: an entity hidden with its module is kept
    // data, not trash, and must never be erased from here.
    let hidden: bool = conn
        .query_row(
            "SELECT hidden_at IS NOT NULL FROM entities WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if hidden {
        return Err(AppError::NotFound(format!("trashed entity {id}")));
    }
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
    conn.execute(
        "DELETE FROM calendar_entry_templates WHERE entity_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM calendar_entries WHERE entity_id = ?1",
        params![id],
    )?;
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
    conn.execute(
        "DELETE FROM note_settings WHERE entity_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM recipe_ingredients WHERE recipe_entity_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM recipe_steps WHERE recipe_entity_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM recipes WHERE entity_id = ?1", params![id])?;
    conn.execute(
        "DELETE FROM recipe_tag_links WHERE recipe_entity_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM series_slots WHERE template_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM views WHERE entity_id = ?1", params![id])?;
    conn.execute("DELETE FROM search_index WHERE entity_id = ?1", params![id])?;

    let affected = conn.execute(
        "DELETE FROM entities WHERE id = ?1 AND deleted_at IS NOT NULL AND hidden_at IS NULL",
        params![id],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("trashed entity {id}")));
    }
    Ok(())
}

/// Permanently removes every trashed entity in every Space, all or nothing.
/// Returns how many were removed.
///
/// A series' occurrences point at their template (`template_id`), so they go
/// first and the templates after them. A trashed template that a live
/// occurrence still points at (one restored from Trash on its own) stays in
/// Trash, since removing it would break that occurrence's series link.
pub fn empty_trash(conn: &Connection) -> AppResult<usize> {
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM entities WHERE deleted_at IS NOT NULL AND hidden_at IS NULL")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let is_template = |id: &str| -> AppResult<bool> {
        Ok(conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM session_templates WHERE entity_id = ?1)
                 OR EXISTS(SELECT 1 FROM calendar_entry_templates WHERE entity_id = ?1)",
            params![id],
            |row| row.get(0),
        )?)
    };
    let mut templates = Vec::new();
    let mut others = Vec::new();
    for id in ids {
        if is_template(&id)? {
            templates.push(id);
        } else {
            others.push(id);
        }
    }
    super::atomically(conn, || {
        for id in &others {
            sweep_entity(conn, id)?;
        }
        let mut removed = others.len();
        for id in &templates {
            let still_used: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sessions WHERE template_id = ?1)
                     OR EXISTS(SELECT 1 FROM calendar_entries WHERE template_id = ?1)",
                params![id],
                |row| row.get(0),
            )?;
            if !still_used {
                sweep_entity(conn, id)?;
                removed += 1;
            }
        }
        Ok(removed)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::spaces::create_space;

    fn setup() -> Connection {
        crate::db::test_conn()
    }

    /// A page with the given blocks (type, content), and what each block looked like.
    fn page_with(
        conn: &Connection,
        space_id: &str,
        blocks: &[(&str, String)],
    ) -> (String, Vec<crate::db::notes::Block>) {
        use crate::db::notes::{create_block, list_blocks};
        let note = create_entity(conn, space_id.into(), "note".into(), "N".into(), None).unwrap();
        for (block_type, content) in blocks {
            create_block(
                conn,
                &note.id,
                (*block_type).into(),
                content.clone(),
                None,
                None,
                None,
            )
            .unwrap();
        }
        (note.id.clone(), list_blocks(conn, &note.id).unwrap())
    }

    fn rename(conn: &Connection, id: &str, title: &str) {
        let patch = EntityPatch {
            title: Some(title.into()),
            ..Default::default()
        };
        update_entity(conn, id, patch).unwrap();
    }

    #[test]
    fn renaming_a_file_updates_media_blocks_and_mentions_that_show_its_name() {
        use crate::db::notes::list_blocks;
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let file =
            create_entity(&conn, space.id.clone(), "file".into(), "a.pdf".into(), None).unwrap();
        let id = &file.id;
        let (note, before) = page_with(
            &conn,
            &space.id,
            &[
                ("file", format!("[a.pdf](mention:{id})")),
                ("paragraph", format!("See [a.pdf](mention:{id}) here")),
                ("paragraph", format!("See [my slides](mention:{id}) here")),
                (
                    "paragraph",
                    format!("Read [a.pdf (p. 3)](mention:{id}#p3)."),
                ),
                (
                    "paragraph",
                    format!("Read [a.pdf (p. 4)](mention:{id}#p3)."),
                ),
                ("heading2", format!("About [a.pdf](mention:{id})")),
                ("bulleted_list", format!("[a.pdf](mention:{id})\nplain")),
                ("table", format!("Name\tFile\nX\t[a.pdf](mention:{id})")),
                ("callout", format!("Look at [a.pdf](mention:{id})")),
                ("paragraph", "Nothing to do with it".into()),
                ("code", format!("[a.pdf](mention:{id})")),
            ],
        );

        rename(&conn, id, "b.pdf");

        let after = list_blocks(&conn, &note).unwrap();
        let content: Vec<&str> = after.iter().map(|b| b.content.as_str()).collect();
        assert_eq!(content[0], format!("[b.pdf](mention:{id})"));
        assert_eq!(content[1], format!("See [b.pdf](mention:{id}) here"));
        // A label the author wrote is theirs.
        assert_eq!(content[2], format!("See [my slides](mention:{id}) here"));
        // The page number of a default label stays.
        assert_eq!(content[3], format!("Read [b.pdf (p. 3)](mention:{id}#p3)."));
        assert_eq!(content[4], format!("Read [a.pdf (p. 4)](mention:{id}#p3)."));
        assert_eq!(content[5], format!("About [b.pdf](mention:{id})"));
        assert_eq!(content[6], format!("[b.pdf](mention:{id})\nplain"));
        assert_eq!(content[7], format!("Name\tFile\nX\t[b.pdf](mention:{id})"));
        assert_eq!(content[8], format!("Look at [b.pdf](mention:{id})"));
        assert_eq!(content[9], "Nothing to do with it");
        // Code is code: a link written in it is not a mention.
        assert_eq!(content[10], format!("[a.pdf](mention:{id})"));
        // Only blocks that changed are touched.
        for index in [2, 4, 9, 10] {
            assert_eq!(after[index].updated_at, before[index].updated_at, "{index}");
        }
        for index in [0, 1, 3, 5, 6, 7, 8] {
            assert_ne!(after[index].updated_at, before[index].updated_at, "{index}");
        }
    }

    #[test]
    fn renaming_any_entity_updates_the_mentions_that_show_its_name() {
        use crate::db::notes::list_blocks;
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        for entity_type in ["note", "task", "course", "jot"] {
            let target = create_entity(
                &conn,
                space.id.clone(),
                entity_type.into(),
                "Old name".into(),
                None,
            )
            .unwrap();
            let id = &target.id;
            let (page, _) = page_with(
                &conn,
                &space.id,
                &[
                    ("paragraph", format!("See [Old name](mention:{id}) here")),
                    ("paragraph", format!("See [my label](mention:{id}) here")),
                    ("heading1", format!("About [Old name](mention:{id}#blk1)")),
                ],
            );
            rename(&conn, id, "New name");
            let content: Vec<String> = list_blocks(&conn, &page)
                .unwrap()
                .into_iter()
                .map(|b| b.content)
                .collect();
            assert_eq!(
                content[0],
                format!("See [New name](mention:{id}) here"),
                "{entity_type}"
            );
            assert_eq!(content[1], format!("See [my label](mention:{id}) here"));
            assert_eq!(content[2], format!("About [New name](mention:{id}#blk1)"));
        }
    }

    #[test]
    fn renaming_an_untitled_entity_updates_mentions_labelled_with_its_fallback_name() {
        use crate::db::notes::list_blocks;
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        for (entity_type, fallback) in [
            ("note", "Untitled Note"),
            ("task", "Untitled Task"),
            ("jot", "Untitled Jot"),
            ("bookmark", "Untitled Bookmark"),
        ] {
            let target =
                create_entity(&conn, space.id.clone(), entity_type.into(), "".into(), None)
                    .unwrap();
            let id = &target.id;
            let (page, _) = page_with(
                &conn,
                &space.id,
                &[("paragraph", format!("[{fallback}](mention:{id})"))],
            );
            rename(&conn, id, "Physics");
            assert_eq!(
                list_blocks(&conn, &page).unwrap()[0].content,
                format!("[Physics](mention:{id})"),
                "{entity_type}"
            );
        }
    }

    #[test]
    fn clearing_a_title_leaves_the_fallback_name_in_mentions_and_back_again() {
        use crate::db::notes::list_blocks;
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let target = create_entity(
            &conn,
            space.id.clone(),
            "note".into(),
            "Physics".into(),
            None,
        )
        .unwrap();
        let id = &target.id;
        let (page, _) = page_with(
            &conn,
            &space.id,
            &[("paragraph", format!("[Physics](mention:{id})"))],
        );
        rename(&conn, id, "");
        assert_eq!(
            list_blocks(&conn, &page).unwrap()[0].content,
            format!("[Untitled Note](mention:{id})")
        );
        rename(&conn, id, "Chemistry");
        assert_eq!(
            list_blocks(&conn, &page).unwrap()[0].content,
            format!("[Chemistry](mention:{id})")
        );
    }

    #[test]
    fn a_rename_that_changes_nothing_touches_no_block() {
        use crate::db::notes::list_blocks;
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let target =
            create_entity(&conn, space.id.clone(), "note".into(), "Same".into(), None).unwrap();
        let id = &target.id;
        let (page, before) = page_with(
            &conn,
            &space.id,
            &[("paragraph", format!("[Same](mention:{id})"))],
        );
        rename(&conn, id, "Same");
        assert_eq!(
            list_blocks(&conn, &page).unwrap()[0].updated_at,
            before[0].updated_at
        );
    }

    #[test]
    fn renaming_a_file_keeps_other_files_and_pages_untouched() {
        use crate::db::notes::list_blocks;
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let file =
            create_entity(&conn, space.id.clone(), "file".into(), "a.pdf".into(), None).unwrap();
        let other =
            create_entity(&conn, space.id.clone(), "file".into(), "a.pdf".into(), None).unwrap();
        let page =
            create_entity(&conn, space.id.clone(), "note".into(), "a.pdf".into(), None).unwrap();
        let text = format!("[a.pdf](mention:{}) [a.pdf](mention:{})", other.id, page.id);
        let (note, _) = page_with(&conn, &space.id, &[("paragraph", text.clone())]);
        rename(&conn, &file.id, "b.pdf");
        assert_eq!(list_blocks(&conn, &note).unwrap()[0].content, text);
    }

    #[test]
    fn a_renamed_file_name_with_brackets_or_dollars_stays_valid_markdown() {
        use crate::db::notes::list_blocks;
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let file =
            create_entity(&conn, space.id.clone(), "file".into(), "a.pdf".into(), None).unwrap();
        let id = &file.id;
        let (note, _) = page_with(
            &conn,
            &space.id,
            &[("paragraph", format!("[a.pdf](mention:{id})"))],
        );
        rename(&conn, id, "Cost [$5].pdf");
        assert_eq!(
            list_blocks(&conn, &note).unwrap()[0].content,
            format!("[Cost \\$5.pdf](mention:{id})")
        );
        // And back again: the label written above counts as the default label.
        rename(&conn, id, "Final.pdf");
        assert_eq!(
            list_blocks(&conn, &note).unwrap()[0].content,
            format!("[Final.pdf](mention:{id})")
        );
    }

    #[test]
    fn renaming_a_file_updates_what_search_finds_on_the_page() {
        let conn = setup();
        let space = create_space(&conn, "S".into(), None, "#000".into()).unwrap();
        let file =
            create_entity(&conn, space.id.clone(), "file".into(), "a.pdf".into(), None).unwrap();
        let id = &file.id;
        let (note, _) = page_with(
            &conn,
            &space.id,
            &[("paragraph", format!("Read [zebra.pdf](mention:{id}) now"))],
        );
        rename(&conn, id, "zebra.pdf");
        rename(&conn, id, "giraffe.pdf");
        let hits = crate::db::search::search(&conn, "giraffe", None).unwrap();
        assert!(hits.iter().any(|h| h.entity_id == note), "{hits:?}");
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
