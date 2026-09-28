use crate::db::entities::Entity;
use crate::db::recipes::{self, Ingredient, RecipeEntity, RecipeTag, Step};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

fn banners_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(crate::db::resolve_app_data_dir(
        app.path()
            .app_data_dir()
            .map_err(|e| AppError::Db(e.to_string()))?,
    )
    .join("recipe-banners"))
}

#[tauri::command]
pub fn create_recipe(state: State<DbState>, space_id: String, title: String) -> AppResult<Entity> {
    let conn = state.0.lock().unwrap();
    recipes::create_recipe(&conn, space_id, title)
}

#[tauri::command]
pub fn list_recipes(state: State<DbState>, space_id: String) -> AppResult<Vec<RecipeEntity>> {
    let conn = state.0.lock().unwrap();
    recipes::list_recipes(&conn, &space_id)
}

#[tauri::command]
pub fn get_recipe(state: State<DbState>, entity_id: String) -> AppResult<RecipeEntity> {
    let conn = state.0.lock().unwrap();
    recipes::get_recipe(&conn, &entity_id)
}

#[tauri::command]
pub fn update_recipe_kind(
    state: State<DbState>,
    entity_id: String,
    kind: String,
) -> AppResult<RecipeEntity> {
    let conn = state.0.lock().unwrap();
    recipes::set_recipe_kind(&conn, &entity_id, kind)?;
    recipes::get_recipe(&conn, &entity_id)
}

/// `duration_minutes: None` clears the manual override, falling back to the
/// sum of the steps' own durations again.
#[tauri::command]
pub fn update_recipe_duration(
    state: State<DbState>,
    entity_id: String,
    duration_minutes: Option<i64>,
) -> AppResult<RecipeEntity> {
    let conn = state.0.lock().unwrap();
    recipes::set_recipe_duration_minutes(&conn, &entity_id, duration_minutes)?;
    recipes::get_recipe(&conn, &entity_id)
}

/// The whole recipe-tag catalog (global, fixed, not per-Space), for the
/// tags multi-select control.
#[tauri::command]
pub fn list_recipe_tags(state: State<DbState>) -> AppResult<Vec<RecipeTag>> {
    let conn = state.0.lock().unwrap();
    recipes::list_recipe_tags(&conn)
}

#[tauri::command]
pub fn update_recipe_tags(
    state: State<DbState>,
    entity_id: String,
    tag_ids: Vec<String>,
) -> AppResult<RecipeEntity> {
    let conn = state.0.lock().unwrap();
    recipes::set_recipe_tags(&conn, &entity_id, &tag_ids)?;
    recipes::get_recipe(&conn, &entity_id)
}

#[tauri::command]
pub fn set_recipe_banner(
    app: AppHandle,
    state: State<DbState>,
    entity_id: String,
    source_path: String,
) -> AppResult<RecipeEntity> {
    let dir = banners_dir(&app)?;
    let conn = state.0.lock().unwrap();
    let (recipe, previous) =
        recipes::set_recipe_banner(&conn, &dir, &entity_id, std::path::Path::new(&source_path))?;
    // Committed: the replaced banner has no entity left pointing at it.
    if let Some(previous) = previous.filter(|p| Some(p) != recipe.banner_path.as_ref()) {
        let _ = std::fs::remove_file(previous);
    }
    Ok(recipe)
}

#[tauri::command]
pub fn list_ingredients(state: State<DbState>, recipe_id: String) -> AppResult<Vec<Ingredient>> {
    let conn = state.0.lock().unwrap();
    recipes::list_ingredients(&conn, &recipe_id, false)
}

#[tauri::command]
pub fn create_ingredient(
    state: State<DbState>,
    recipe_id: String,
    text: String,
) -> AppResult<Ingredient> {
    let conn = state.0.lock().unwrap();
    recipes::create_ingredient(&conn, recipe_id, text)
}

#[tauri::command]
pub fn update_ingredient(
    state: State<DbState>,
    ingredient_id: String,
    text: String,
) -> AppResult<Ingredient> {
    let conn = state.0.lock().unwrap();
    recipes::update_ingredient(&conn, &ingredient_id, text)
}

/// Moves an ingredient to `position` (0 based) among the recipe's visible ingredients.
#[tauri::command]
pub fn move_ingredient(
    state: State<DbState>,
    ingredient_id: String,
    position: i64,
) -> AppResult<Ingredient> {
    let conn = state.0.lock().unwrap();
    recipes::move_ingredient(&conn, &ingredient_id, position)
}

#[tauri::command]
pub fn delete_ingredient(state: State<DbState>, ingredient_id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    recipes::delete_ingredient(&conn, &ingredient_id)
}

#[tauri::command]
pub fn list_steps(state: State<DbState>, recipe_id: String) -> AppResult<Vec<Step>> {
    let conn = state.0.lock().unwrap();
    recipes::list_steps(&conn, &recipe_id, false)
}

#[tauri::command]
pub fn create_step(
    state: State<DbState>,
    recipe_id: String,
    text: String,
    duration_minutes: Option<i64>,
) -> AppResult<Step> {
    let conn = state.0.lock().unwrap();
    recipes::create_step(&conn, recipe_id, text, duration_minutes)
}

#[tauri::command]
pub fn update_step(
    state: State<DbState>,
    step_id: String,
    text: String,
    duration_minutes: Option<i64>,
) -> AppResult<Step> {
    let conn = state.0.lock().unwrap();
    recipes::update_step(&conn, &step_id, Some(text), Some(duration_minutes))
}

/// Moves a step to `position` (0 based) among the recipe's visible steps.
#[tauri::command]
pub fn move_step(state: State<DbState>, step_id: String, position: i64) -> AppResult<Step> {
    let conn = state.0.lock().unwrap();
    recipes::move_step(&conn, &step_id, position)
}

#[tauri::command]
pub fn delete_step(state: State<DbState>, step_id: String) -> AppResult<()> {
    let conn = state.0.lock().unwrap();
    recipes::delete_step(&conn, &step_id)
}
