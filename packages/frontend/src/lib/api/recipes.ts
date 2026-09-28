import { invoke } from "@tauri-apps/api/core";
import type { Entity, Recipe, RecipeIngredient, RecipeKind, RecipeStep, RecipeTag } from "./types";

export function createRecipe(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_recipe", { spaceId, title });
}

export function listRecipes(spaceId: string): Promise<Recipe[]> {
  return invoke("list_recipes", { spaceId });
}

export function getRecipe(entityId: string): Promise<Recipe> {
  return invoke("get_recipe", { entityId });
}

export function updateRecipeKind(entityId: string, kind: RecipeKind): Promise<Recipe> {
  return invoke("update_recipe_kind", { entityId, kind });
}

/// `durationMinutes: null` clears the manual override, falling back to the
/// sum of the steps' own durations again.
export function updateRecipeDuration(
  entityId: string,
  durationMinutes: number | null,
): Promise<Recipe> {
  return invoke("update_recipe_duration", { entityId, durationMinutes });
}

/// The whole recipe-tag catalog (global, fixed, not per-Space), for the tags
/// multi-select control.
export function listRecipeTags(): Promise<RecipeTag[]> {
  return invoke("list_recipe_tags");
}

/// Replaces the recipe's whole tag set.
export function updateRecipeTags(entityId: string, tagIds: string[]): Promise<Recipe> {
  return invoke("update_recipe_tags", { entityId, tagIds });
}

/// `sourcePath` is a path on disk (from the file picker or a drag/drop), copied
/// into Nookly's own storage.
export function setRecipeBanner(entityId: string, sourcePath: string): Promise<Recipe> {
  return invoke("set_recipe_banner", { entityId, sourcePath });
}

export function listIngredients(recipeId: string): Promise<RecipeIngredient[]> {
  return invoke("list_ingredients", { recipeId });
}

export function createIngredient(recipeId: string, text: string): Promise<RecipeIngredient> {
  return invoke("create_ingredient", { recipeId, text });
}

export function updateIngredient(ingredientId: string, text: string): Promise<RecipeIngredient> {
  return invoke("update_ingredient", { ingredientId, text });
}

/// Moves an ingredient to `position` (0 based) among the recipe's visible ingredients.
export function moveIngredient(ingredientId: string, position: number): Promise<RecipeIngredient> {
  return invoke("move_ingredient", { ingredientId, position });
}

export function deleteIngredient(ingredientId: string): Promise<void> {
  return invoke("delete_ingredient", { ingredientId });
}

export function listSteps(recipeId: string): Promise<RecipeStep[]> {
  return invoke("list_steps", { recipeId });
}

export function createStep(
  recipeId: string,
  text: string,
  durationMinutes: number | null = null,
): Promise<RecipeStep> {
  return invoke("create_step", { recipeId, text, durationMinutes });
}

export function updateStep(
  stepId: string,
  text: string,
  durationMinutes: number | null,
): Promise<RecipeStep> {
  return invoke("update_step", { stepId, text, durationMinutes });
}

/// Moves a step to `position` (0 based) among the recipe's visible steps.
export function moveStep(stepId: string, position: number): Promise<RecipeStep> {
  return invoke("move_step", { stepId, position });
}

export function deleteStep(stepId: string): Promise<void> {
  return invoke("delete_step", { stepId });
}
