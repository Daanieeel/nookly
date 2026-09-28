use crate::db::entities::Entity;
use crate::db::schema::{
    ChildCollectionDef, ComputedFieldDef, CreateInput, EntitySchemaDef, FieldDef, FieldKind,
    JsonMap,
};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;

/// Meal kinds offered by the category select. Documented here rather than
/// enforced by the CLI parser (`FieldKind::Enum` is descriptive only, per
/// `schema.rs`), but `set_recipe_kind` refuses anything else.
pub const RECIPE_KINDS: &[&str] = &["breakfast", "lunch", "dinner", "snack", "dessert", "other"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeEntity {
    pub entity: Entity,
    pub kind: String,
    /// Manual override, in minutes. `None` falls back to `totalDurationMinutes`.
    pub duration_minutes: Option<i64>,
    pub banner_path: Option<String>,
    /// `durationMinutes` if set, else the sum of the steps' own
    /// `durationMinutes` (`None` if neither is set).
    pub total_duration_minutes: Option<i64>,
    /// Read only — set with the `tagIds` field. Ordered by the catalog's own
    /// `position`, not assignment order.
    pub tags: Vec<RecipeTag>,
}

/// One entry in the fixed `recipe_tags` catalog (global, not per-Space, like
/// `task_statuses` — see `02-entity-model.md`'s note that Labels are the
/// *freeform* per-Space system; this is deliberately not that). Seeded by
/// migration; not user-creatable in this version.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeTag {
    pub id: String,
    pub name: String,
    /// A key the frontend maps to an icon component — not a Tabler
    /// icon-library value string (that's `entity.icon`'s own convention for
    /// user-chosen icons; this is a fixed, curated catalog instead).
    pub icon: String,
    pub color: String,
    pub position: i64,
}

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<RecipeTag> {
    Ok(RecipeTag {
        id: row.get("id")?,
        name: row.get("name")?,
        icon: row.get("icon")?,
        color: row.get("color")?,
        position: row.get("position")?,
    })
}

/// The whole catalog, in display order. Global — every Space's recipes pick
/// from the same list.
pub fn list_recipe_tags(conn: &Connection) -> AppResult<Vec<RecipeTag>> {
    let mut stmt = conn.prepare("SELECT * FROM recipe_tags ORDER BY position ASC")?;
    let rows = stmt.query_map([], row_to_tag)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn tags_for_recipe(conn: &Connection, recipe_id: &str) -> AppResult<Vec<RecipeTag>> {
    let mut stmt = conn.prepare(
        "SELECT t.* FROM recipe_tags t
         JOIN recipe_tag_links l ON l.tag_id = t.id
         WHERE l.recipe_entity_id = ?1 ORDER BY t.position ASC",
    )?;
    let rows = stmt.query_map(params![recipe_id], row_to_tag)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

/// Replaces the recipe's whole tag set with `tag_ids`, refusing any id not in
/// the catalog. Order doesn't matter — display order always follows the
/// catalog's own `position`.
pub fn set_recipe_tags(conn: &Connection, recipe_id: &str, tag_ids: &[String]) -> AppResult<()> {
    for tag_id in tag_ids {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM recipe_tags WHERE id = ?1",
            params![tag_id],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::InvalidInput(format!(
                "unknown recipe tag '{tag_id}'"
            )));
        }
    }
    conn.execute(
        "DELETE FROM recipe_tag_links WHERE recipe_entity_id = ?1",
        params![recipe_id],
    )?;
    for tag_id in tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO recipe_tag_links (recipe_entity_id, tag_id) VALUES (?1, ?2)",
            params![recipe_id, tag_id],
        )?;
    }
    Ok(())
}

fn recipe_core(
    conn: &Connection,
    entity_id: &str,
) -> AppResult<(String, Option<i64>, Option<String>)> {
    conn.query_row(
        "SELECT kind, duration_minutes, banner_path FROM recipes WHERE entity_id = ?1",
        params![entity_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("recipe {entity_id}")))
}

/// The sum of the recipe's steps' `duration_minutes`, ignoring steps with none
/// set and soft-deleted ones. `None` if nothing has a duration.
fn steps_duration_sum(conn: &Connection, entity_id: &str) -> AppResult<Option<i64>> {
    Ok(conn.query_row(
        "SELECT SUM(duration_minutes) FROM recipe_steps WHERE recipe_entity_id = ?1 AND deleted_at IS NULL",
        params![entity_id],
        |row| row.get(0),
    )?)
}

pub fn create_recipe(conn: &Connection, space_id: String, title: String) -> AppResult<Entity> {
    let entity = crate::db::entities::create_entity(conn, space_id, "recipe".into(), title, None)?;
    conn.execute(
        "INSERT INTO recipes (entity_id) VALUES (?1)",
        params![entity.id],
    )?;
    Ok(entity)
}

pub fn get_recipe(conn: &Connection, entity_id: &str) -> AppResult<RecipeEntity> {
    let entity = crate::db::entities::get_entity(conn, entity_id)?;
    let (kind, duration_minutes, banner_path) = recipe_core(conn, entity_id)?;
    let total_duration_minutes = match duration_minutes {
        Some(minutes) => Some(minutes),
        None => steps_duration_sum(conn, entity_id)?,
    };
    let tags = tags_for_recipe(conn, entity_id)?;
    Ok(RecipeEntity {
        entity,
        kind,
        duration_minutes,
        banner_path,
        total_duration_minutes,
        tags,
    })
}

pub fn list_recipes(conn: &Connection, space_id: &str) -> AppResult<Vec<RecipeEntity>> {
    let mut stmt = conn.prepare(
        "SELECT e.* FROM entities e JOIN recipes r ON r.entity_id = e.id
         WHERE e.space_id = ?1 AND e.deleted_at IS NULL ORDER BY e.created_at ASC",
    )?;
    let rows = stmt.query_map(params![space_id], crate::db::entities::row_to_entity)?;
    let entities: Vec<Entity> = rows.collect::<Result<Vec<_>, _>>()?;
    entities
        .into_iter()
        .map(|e| get_recipe(conn, &e.id))
        .collect()
}

pub fn set_recipe_kind(conn: &Connection, entity_id: &str, kind: String) -> AppResult<()> {
    if !RECIPE_KINDS.contains(&kind.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "kind must be one of {}, got '{kind}'",
            RECIPE_KINDS.join(", ")
        )));
    }
    conn.execute(
        "UPDATE recipes SET kind = ?1 WHERE entity_id = ?2",
        params![kind, entity_id],
    )?;
    Ok(())
}

/// `None` clears the manual override, falling back to `totalDurationMinutes` again.
pub fn set_recipe_duration_minutes(
    conn: &Connection,
    entity_id: &str,
    minutes: Option<i64>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE recipes SET duration_minutes = ?1 WHERE entity_id = ?2",
        params![minutes, entity_id],
    )?;
    Ok(())
}

/// Copies `source_path` into `banners_dir` and points the recipe at it,
/// returning the previous banner's path (if any) so the caller can remove the
/// now-orphaned file once the change is committed — same convention as
/// `files::replace_file`.
pub fn set_recipe_banner(
    conn: &Connection,
    banners_dir: &Path,
    entity_id: &str,
    source_path: &Path,
) -> AppResult<(RecipeEntity, Option<String>)> {
    let (_, _, previous) = recipe_core(conn, entity_id)?;
    let bytes = std::fs::read(source_path).map_err(|e| AppError::Io(e.to_string()))?;
    let ext = source_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    std::fs::create_dir_all(banners_dir).map_err(|e| AppError::Io(e.to_string()))?;
    let dest = banners_dir.join(format!("{}.{ext}", crate::db::new_id()));
    std::fs::write(&dest, &bytes).map_err(|e| AppError::Io(e.to_string()))?;
    let dest_str = dest.to_string_lossy().to_string();
    conn.execute(
        "UPDATE recipes SET banner_path = ?1 WHERE entity_id = ?2",
        params![dest_str, entity_id],
    )?;
    Ok((get_recipe(conn, entity_id)?, previous))
}

// --- ingredients -------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ingredient {
    pub id: String,
    pub recipe_entity_id: String,
    pub text: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

fn row_to_ingredient(row: &rusqlite::Row) -> rusqlite::Result<Ingredient> {
    Ok(Ingredient {
        id: row.get("id")?,
        recipe_entity_id: row.get("recipe_entity_id")?,
        text: row.get("text")?,
        position: row.get("position")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

pub fn get_ingredient(conn: &Connection, id: &str) -> AppResult<Ingredient> {
    conn.query_row(
        "SELECT * FROM recipe_ingredients WHERE id = ?1",
        params![id],
        row_to_ingredient,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("ingredient {id}")))
}

pub fn list_ingredients(
    conn: &Connection,
    recipe_id: &str,
    include_deleted: bool,
) -> AppResult<Vec<Ingredient>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM recipe_ingredients WHERE recipe_entity_id = ?1 AND (?2 OR deleted_at IS NULL)
         ORDER BY position ASC",
    )?;
    let rows = stmt.query_map(params![recipe_id, include_deleted], row_to_ingredient)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create_ingredient(
    conn: &Connection,
    recipe_id: String,
    text: String,
) -> AppResult<Ingredient> {
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM recipe_ingredients WHERE recipe_entity_id = ?1",
        params![recipe_id],
        |row| row.get(0),
    )?;
    let id = crate::db::new_id();
    let now = crate::db::now();
    conn.execute(
        "INSERT INTO recipe_ingredients (id, recipe_entity_id, text, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, recipe_id, text, position, now],
    )?;
    get_ingredient(conn, &id)
}

pub fn update_ingredient(conn: &Connection, id: &str, text: String) -> AppResult<Ingredient> {
    get_ingredient(conn, id)?;
    conn.execute(
        "UPDATE recipe_ingredients SET text = ?1, updated_at = ?2 WHERE id = ?3",
        params![text, crate::db::now(), id],
    )?;
    get_ingredient(conn, id)
}

/// Moves an ingredient to `position` (0 based, clamped) among the recipe's
/// visible ingredients, shifting the ones in between, then rewrites their
/// positions as 0..n so they stay contiguous.
pub fn move_ingredient(conn: &Connection, id: &str, position: i64) -> AppResult<Ingredient> {
    let ingredient = get_ingredient(conn, id)?;
    let mut ids: Vec<String> = list_ingredients(conn, &ingredient.recipe_entity_id, false)?
        .into_iter()
        .map(|i| i.id)
        .collect();
    let Some(from) = ids.iter().position(|i| i == id) else {
        return Err(AppError::InvalidInput(format!(
            "ingredient {id} is deleted and can't be moved"
        )));
    };
    ids.remove(from);
    let to = position.clamp(0, ids.len() as i64) as usize;
    ids.insert(to, id.to_string());
    let now = crate::db::now();
    for (index, ingredient_id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE recipe_ingredients SET position = ?1, updated_at = ?2 WHERE id = ?3 AND position != ?1",
            params![index as i64, now, ingredient_id],
        )?;
    }
    get_ingredient(conn, id)
}

pub fn delete_ingredient(conn: &Connection, id: &str) -> AppResult<()> {
    get_ingredient(conn, id)?;
    conn.execute(
        "UPDATE recipe_ingredients SET deleted_at = ?1 WHERE id = ?2",
        params![crate::db::now(), id],
    )?;
    Ok(())
}

pub fn restore_ingredient(conn: &Connection, id: &str) -> AppResult<()> {
    get_ingredient(conn, id)?;
    conn.execute(
        "UPDATE recipe_ingredients SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// --- steps -------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id: String,
    pub recipe_entity_id: String,
    pub text: String,
    pub duration_minutes: Option<i64>,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

fn row_to_step(row: &rusqlite::Row) -> rusqlite::Result<Step> {
    Ok(Step {
        id: row.get("id")?,
        recipe_entity_id: row.get("recipe_entity_id")?,
        text: row.get("text")?,
        duration_minutes: row.get("duration_minutes")?,
        position: row.get("position")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

pub fn get_step(conn: &Connection, id: &str) -> AppResult<Step> {
    conn.query_row(
        "SELECT * FROM recipe_steps WHERE id = ?1",
        params![id],
        row_to_step,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("step {id}")))
}

pub fn list_steps(
    conn: &Connection,
    recipe_id: &str,
    include_deleted: bool,
) -> AppResult<Vec<Step>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM recipe_steps WHERE recipe_entity_id = ?1 AND (?2 OR deleted_at IS NULL)
         ORDER BY position ASC",
    )?;
    let rows = stmt.query_map(params![recipe_id, include_deleted], row_to_step)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create_step(
    conn: &Connection,
    recipe_id: String,
    text: String,
    duration_minutes: Option<i64>,
) -> AppResult<Step> {
    let position: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM recipe_steps WHERE recipe_entity_id = ?1",
        params![recipe_id],
        |row| row.get(0),
    )?;
    let id = crate::db::new_id();
    let now = crate::db::now();
    conn.execute(
        "INSERT INTO recipe_steps (id, recipe_entity_id, text, duration_minutes, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, recipe_id, text, duration_minutes, position, now],
    )?;
    get_step(conn, &id)
}

/// `None` for a field leaves that column unchanged; `Some(None)` for
/// `duration_minutes` clears it (so the recipe's total falls back to
/// whatever the other steps add up to).
pub fn update_step(
    conn: &Connection,
    id: &str,
    text: Option<String>,
    duration_minutes: Option<Option<i64>>,
) -> AppResult<Step> {
    get_step(conn, id)?;
    if let Some(text) = text {
        conn.execute(
            "UPDATE recipe_steps SET text = ?1, updated_at = ?2 WHERE id = ?3",
            params![text, crate::db::now(), id],
        )?;
    }
    if let Some(duration_minutes) = duration_minutes {
        conn.execute(
            "UPDATE recipe_steps SET duration_minutes = ?1, updated_at = ?2 WHERE id = ?3",
            params![duration_minutes, crate::db::now(), id],
        )?;
    }
    get_step(conn, id)
}

/// Moves a step to `position` (0 based, clamped) among the recipe's visible
/// steps, shifting the ones in between, then rewrites the visible steps'
/// positions as 0..n so they stay contiguous.
pub fn move_step(conn: &Connection, id: &str, position: i64) -> AppResult<Step> {
    let step = get_step(conn, id)?;
    let mut ids: Vec<String> = list_steps(conn, &step.recipe_entity_id, false)?
        .into_iter()
        .map(|s| s.id)
        .collect();
    let Some(from) = ids.iter().position(|s| s == id) else {
        return Err(AppError::InvalidInput(format!(
            "step {id} is deleted and can't be moved"
        )));
    };
    ids.remove(from);
    let to = position.clamp(0, ids.len() as i64) as usize;
    ids.insert(to, id.to_string());
    let now = crate::db::now();
    for (index, step_id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE recipe_steps SET position = ?1, updated_at = ?2 WHERE id = ?3 AND position != ?1",
            params![index as i64, now, step_id],
        )?;
    }
    get_step(conn, id)
}

pub fn delete_step(conn: &Connection, id: &str) -> AppResult<()> {
    get_step(conn, id)?;
    conn.execute(
        "UPDATE recipe_steps SET deleted_at = ?1 WHERE id = ?2",
        params![crate::db::now(), id],
    )?;
    Ok(())
}

pub fn restore_step(conn: &Connection, id: &str) -> AppResult<()> {
    get_step(conn, id)?;
    conn.execute(
        "UPDATE recipe_steps SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// --- CLI schema registration (PLAN.md §1/§3) -------------------------------

const RECIPE_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "kind",
        kind: FieldKind::Enum(RECIPE_KINDS),
        required_on_create: false,
        writable_on_update: true,
        description: "Meal kind. Defaults to other.",
    },
    FieldDef {
        name: "durationMinutes",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: true,
        description: "Manual override, in minutes. Unset falls back to summing the steps' own \
                      durationMinutes — see the read only totalDurationMinutes. Pass an empty \
                      value on update to clear it back to automatic.",
    },
    FieldDef {
        name: "bannerPath",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "Path to a local image to copy in as the banner, replacing any existing one.",
    },
    FieldDef {
        name: "tagIds",
        kind: FieldKind::Text,
        required_on_create: false,
        writable_on_update: true,
        description: "Comma-separated ids from the recipe_tags catalog (a fixed, curated set — \
                      see the read only tags field for the full list with name/icon/color; not \
                      the generic per-Space Labels). Replaces the recipe's whole tag set; pass an \
                      empty value to clear it.",
    },
];

fn recipe_json(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    Ok(serde_json::to_value(get_recipe(conn, id)?).expect("RecipeEntity always serializes"))
}

fn apply_recipe_fields(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<()> {
    if let Some(kind) = crate::db::schema::field_str(fields, "kind") {
        set_recipe_kind(conn, id, kind)?;
    }
    if fields.contains_key("durationMinutes") {
        set_recipe_duration_minutes(
            conn,
            id,
            crate::db::schema::field_i64(fields, "durationMinutes"),
        )?;
    }
    if let Some(path) = crate::db::schema::field_str(fields, "bannerPath") {
        let dir = crate::db::standalone_app_data_dir()
            .map_err(|e| AppError::Db(e.to_string()))?
            .join("recipe-banners");
        set_recipe_banner(conn, &dir, id, Path::new(&path))?;
    }
    if fields.contains_key("tagIds") {
        let tag_ids: Vec<String> = crate::db::schema::field_str(fields, "tagIds")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect();
        set_recipe_tags(conn, id, &tag_ids)?;
    }
    Ok(())
}

fn cli_create_recipe(conn: &Connection, input: CreateInput) -> AppResult<serde_json::Value> {
    let entity = create_recipe(conn, input.space_id, input.title)?;
    apply_recipe_fields(conn, &entity.id, &input.fields)?;
    recipe_json(conn, &entity.id)
}

fn cli_update_recipe(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    apply_recipe_fields(conn, id, fields)?;
    recipe_json(conn, id)
}

fn cli_get_recipe(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    recipe_json(conn, id)
}

fn cli_list_recipes(
    conn: &Connection,
    space_id: Option<&str>,
    _include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    let space_id = space_id
        .ok_or_else(|| AppError::InvalidInput("recipe list requires --space <space-id>".into()))?;
    list_recipes(conn, space_id)?
        .into_iter()
        .map(|r| Ok(serde_json::to_value(r).expect("RecipeEntity always serializes")))
        .collect()
}

inventory::submit! {
    EntitySchemaDef {
        entity_type: "recipe",
        supports_blocks: false,
        description: "A recipe: banner image, meal kind, an ingredient list and a step list. \
                      Duration is a manual override, or (when unset) the sum of the steps' own \
                      durationMinutes.",
        fields: RECIPE_FIELDS,
        relationship_types: &["relates-to", "attached-file"],
        create: cli_create_recipe,
        update: cli_update_recipe,
        get: cli_get_recipe,
        list: cli_list_recipes,
    }
}

inventory::submit! {
    ComputedFieldDef {
        entity_type: "recipe",
        name: "totalDurationMinutes",
        kind: FieldKind::Integer,
        description: "Read only. durationMinutes if set, else the sum of the steps' own \
                      durationMinutes (null if neither is set).",
    }
}

inventory::submit! {
    ComputedFieldDef {
        entity_type: "recipe",
        name: "tags",
        kind: FieldKind::Object,
        description: "Read only. Full detail (id, name, icon, color) for each id set via \
                      tagIds, ordered by the recipe_tags catalog's own position.",
    }
}

const INGREDIENT_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "text",
        kind: FieldKind::Text,
        required_on_create: true,
        writable_on_update: true,
        description: "The ingredient line, e.g. '2 cups flour'.",
    },
    FieldDef {
        name: "position",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: true,
        description: "Order within the recipe, 0 based. Setting it moves the ingredient there and \
                  shifts the others; a value past the end puts it last.",
    },
];

fn ingredient_json(ingredient: Ingredient) -> serde_json::Value {
    serde_json::to_value(ingredient).expect("Ingredient always serializes")
}

fn cli_list_ingredients(
    conn: &Connection,
    recipe_id: &str,
    include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    Ok(list_ingredients(conn, recipe_id, include_deleted)?
        .into_iter()
        .map(ingredient_json)
        .collect())
}

fn cli_get_ingredient(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    get_ingredient(conn, id).map(ingredient_json)
}

fn cli_create_ingredient(
    conn: &Connection,
    recipe_id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let text = crate::db::schema::require_str(fields, "text")?;
    let ingredient = create_ingredient(conn, recipe_id.into(), text)?;
    match crate::db::schema::field_i64(fields, "position") {
        Some(position) => move_ingredient(conn, &ingredient.id, position).map(ingredient_json),
        None => Ok(ingredient_json(ingredient)),
    }
}

fn cli_update_ingredient(
    conn: &Connection,
    id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    if let Some(text) = crate::db::schema::field_str(fields, "text") {
        update_ingredient(conn, id, text)?;
    }
    if let Some(position) = crate::db::schema::field_i64(fields, "position") {
        move_ingredient(conn, id, position)?;
    }
    cli_get_ingredient(conn, id)
}

inventory::submit! {
    ChildCollectionDef {
        parent_type: "recipe",
        singular: "ingredient",
        plural: "ingredients",
        description: "The recipe's ingredient list, one line per ingredient, in order.",
        fields: INGREDIENT_FIELDS,
        computed: &[],
        list: cli_list_ingredients,
        get: cli_get_ingredient,
        create: cli_create_ingredient,
        update: cli_update_ingredient,
        delete: delete_ingredient,
        restore: restore_ingredient,
        actions: &[],
    }
}

const STEP_FIELDS: &[FieldDef] = &[
    FieldDef {
        name: "text",
        kind: FieldKind::LongText,
        required_on_create: true,
        writable_on_update: true,
        description: "The step's instructions.",
    },
    FieldDef {
        name: "durationMinutes",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: true,
        description: "How long this step takes, in minutes. Counts toward the recipe's \
                      totalDurationMinutes when the recipe has no manual durationMinutes of its \
                      own. Pass an empty value on update to clear it.",
    },
    FieldDef {
        name: "position",
        kind: FieldKind::Integer,
        required_on_create: false,
        writable_on_update: true,
        description: "Order within the recipe, 0 based. Setting it moves the step there and \
                      shifts the others; a value past the end puts it last.",
    },
];

fn step_json(step: Step) -> serde_json::Value {
    serde_json::to_value(step).expect("Step always serializes")
}

fn cli_list_steps(
    conn: &Connection,
    recipe_id: &str,
    include_deleted: bool,
) -> AppResult<Vec<serde_json::Value>> {
    Ok(list_steps(conn, recipe_id, include_deleted)?
        .into_iter()
        .map(step_json)
        .collect())
}

fn cli_get_step(conn: &Connection, id: &str) -> AppResult<serde_json::Value> {
    get_step(conn, id).map(step_json)
}

fn cli_create_step(
    conn: &Connection,
    recipe_id: &str,
    fields: &JsonMap,
) -> AppResult<serde_json::Value> {
    let text = crate::db::schema::require_str(fields, "text")?;
    let duration_minutes = crate::db::schema::field_i64(fields, "durationMinutes");
    let step = create_step(conn, recipe_id.into(), text, duration_minutes)?;
    match crate::db::schema::field_i64(fields, "position") {
        Some(position) => move_step(conn, &step.id, position).map(step_json),
        None => Ok(step_json(step)),
    }
}

fn cli_update_step(conn: &Connection, id: &str, fields: &JsonMap) -> AppResult<serde_json::Value> {
    let text = crate::db::schema::field_str(fields, "text");
    let duration_minutes = fields
        .contains_key("durationMinutes")
        .then(|| crate::db::schema::field_i64(fields, "durationMinutes"));
    update_step(conn, id, text, duration_minutes)?;
    if let Some(position) = crate::db::schema::field_i64(fields, "position") {
        move_step(conn, id, position)?;
    }
    cli_get_step(conn, id)
}

inventory::submit! {
    ChildCollectionDef {
        parent_type: "recipe",
        singular: "step",
        plural: "steps",
        description: "The recipe's numbered step list, in order.",
        fields: STEP_FIELDS,
        computed: &[],
        list: cli_list_steps,
        get: cli_get_step,
        create: cli_create_step,
        update: cli_update_step,
        delete: delete_step,
        restore: restore_step,
        actions: &[],
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
    fn duration_falls_back_to_summed_step_durations() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let recipe = create_recipe(&conn, space.id.clone(), "Pancakes".into()).unwrap();

        // No manual duration and no step durations yet: unknown.
        assert_eq!(
            get_recipe(&conn, &recipe.id)
                .unwrap()
                .total_duration_minutes,
            None
        );

        create_step(&conn, recipe.id.clone(), "Mix".into(), Some(5)).unwrap();
        create_step(&conn, recipe.id.clone(), "Cook".into(), Some(10)).unwrap();
        create_step(&conn, recipe.id.clone(), "Plate".into(), None).unwrap();
        assert_eq!(
            get_recipe(&conn, &recipe.id)
                .unwrap()
                .total_duration_minutes,
            Some(15)
        );

        // A manual override wins over the computed sum.
        set_recipe_duration_minutes(&conn, &recipe.id, Some(30)).unwrap();
        assert_eq!(
            get_recipe(&conn, &recipe.id)
                .unwrap()
                .total_duration_minutes,
            Some(30)
        );

        // Clearing the override falls back to the sum again.
        set_recipe_duration_minutes(&conn, &recipe.id, None).unwrap();
        assert_eq!(
            get_recipe(&conn, &recipe.id)
                .unwrap()
                .total_duration_minutes,
            Some(15)
        );
    }

    #[test]
    fn ingredients_and_steps_keep_insertion_order_and_soft_delete() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let recipe = create_recipe(&conn, space.id.clone(), "Soup".into()).unwrap();

        let a = create_ingredient(&conn, recipe.id.clone(), "Carrot".into()).unwrap();
        let b = create_ingredient(&conn, recipe.id.clone(), "Onion".into()).unwrap();
        assert_eq!(a.position, 0);
        assert_eq!(b.position, 1);

        delete_ingredient(&conn, &a.id).unwrap();
        let visible = list_ingredients(&conn, &recipe.id, false).unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, b.id);
        assert_eq!(list_ingredients(&conn, &recipe.id, true).unwrap().len(), 2);

        restore_ingredient(&conn, &a.id).unwrap();
        assert_eq!(list_ingredients(&conn, &recipe.id, false).unwrap().len(), 2);
    }

    #[test]
    fn move_step_reorders_and_keeps_positions_contiguous() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let recipe = create_recipe(&conn, space.id.clone(), "Bread".into()).unwrap();
        let a = create_step(&conn, recipe.id.clone(), "A".into(), None).unwrap();
        let b = create_step(&conn, recipe.id.clone(), "B".into(), None).unwrap();
        let c = create_step(&conn, recipe.id.clone(), "C".into(), None).unwrap();
        let order = |conn: &Connection| {
            list_steps(conn, &recipe.id, false)
                .unwrap()
                .into_iter()
                .map(|s| (s.text, s.position))
                .collect::<Vec<_>>()
        };

        move_step(&conn, &c.id, 0).unwrap();
        assert_eq!(
            order(&conn),
            vec![("C".into(), 0), ("A".into(), 1), ("B".into(), 2)]
        );

        // Past the end clamps to last; a soft-deleted step is skipped.
        delete_step(&conn, &b.id).unwrap();
        move_step(&conn, &c.id, 99).unwrap();
        assert_eq!(order(&conn), vec![("A".into(), 0), ("C".into(), 1)]);
        assert!(move_step(&conn, &b.id, 0).is_err());
        let _ = a;
    }

    #[test]
    fn move_ingredient_reorders_and_keeps_positions_contiguous() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let recipe = create_recipe(&conn, space.id.clone(), "Soup".into()).unwrap();
        create_ingredient(&conn, recipe.id.clone(), "A".into()).unwrap();
        let b = create_ingredient(&conn, recipe.id.clone(), "B".into()).unwrap();
        let c = create_ingredient(&conn, recipe.id.clone(), "C".into()).unwrap();
        let order = |conn: &Connection| {
            list_ingredients(conn, &recipe.id, false)
                .unwrap()
                .into_iter()
                .map(|i| (i.text, i.position))
                .collect::<Vec<_>>()
        };

        move_ingredient(&conn, &c.id, 0).unwrap();
        assert_eq!(
            order(&conn),
            vec![("C".into(), 0), ("A".into(), 1), ("B".into(), 2)]
        );

        delete_ingredient(&conn, &b.id).unwrap();
        move_ingredient(&conn, &c.id, 99).unwrap();
        assert_eq!(order(&conn), vec![("A".into(), 0), ("C".into(), 1)]);
        assert!(move_ingredient(&conn, &b.id, 0).is_err());
    }

    #[test]
    fn set_recipe_kind_rejects_unknown_values() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let recipe = create_recipe(&conn, space.id.clone(), "Toast".into()).unwrap();
        assert!(set_recipe_kind(&conn, &recipe.id, "brunch".into()).is_err());
        set_recipe_kind(&conn, &recipe.id, "breakfast".into()).unwrap();
        assert_eq!(get_recipe(&conn, &recipe.id).unwrap().kind, "breakfast");
    }

    #[test]
    fn recipe_tags_catalog_is_seeded_and_global() {
        let conn = setup();
        let tags = list_recipe_tags(&conn).unwrap();
        assert_eq!(tags.len(), 14);
        assert_eq!(tags[0].id, "chicken");
        assert!(tags
            .iter()
            .all(|t| !t.icon.is_empty() && !t.color.is_empty()));
        // The three meats must not share an icon.
        let icon_of = |id: &str| tags.iter().find(|t| t.id == id).unwrap().icon.clone();
        assert_ne!(icon_of("chicken"), icon_of("beef"));
        assert_ne!(icon_of("beef"), icon_of("pork"));
        assert_ne!(icon_of("chicken"), icon_of("pork"));
    }

    #[test]
    fn set_recipe_tags_replaces_the_whole_set_and_orders_by_catalog_position() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let recipe = create_recipe(&conn, space.id.clone(), "Stew".into()).unwrap();

        set_recipe_tags(&conn, &recipe.id, &["soup".to_string(), "beef".to_string()]).unwrap();
        let tags = get_recipe(&conn, &recipe.id).unwrap().tags;
        // "beef" (position 1) sorts before "soup" (position 7) regardless of
        // the order passed in.
        assert_eq!(
            tags.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["beef", "soup"]
        );

        set_recipe_tags(&conn, &recipe.id, &["vegan".to_string()]).unwrap();
        let tags = get_recipe(&conn, &recipe.id).unwrap().tags;
        assert_eq!(
            tags.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["vegan"]
        );

        assert!(set_recipe_tags(&conn, &recipe.id, &["not-a-tag".to_string()]).is_err());
    }

    #[test]
    fn tag_ids_field_round_trips_through_the_cli_update_path() {
        let conn = setup();
        let space = create_space(&conn, "Home".into(), None, "#000".into()).unwrap();
        let recipe = create_recipe(&conn, space.id.clone(), "Curry".into()).unwrap();

        let mut fields = JsonMap::new();
        fields.insert("tagIds".into(), serde_json::json!("chicken, spicy"));
        apply_recipe_fields(&conn, &recipe.id, &fields).unwrap();

        let tags = get_recipe(&conn, &recipe.id).unwrap().tags;
        assert_eq!(
            tags.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["chicken", "spicy"]
        );
    }
}
