import { type LocalDb, first, iso, num, optStr, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";

/// Recipes as the desktop keeps them (`db/recipes.rs`): a meal kind, a duration, tags
/// from a fixed catalog, and ingredients and steps that are trashed rather than removed.

export const RECIPE_KINDS = ["breakfast", "lunch", "dinner", "snack", "dessert", "other"] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];

export interface RecipeTag {
  id: string;
  name: string;
  icon: string;
  color: string;
  position: number;
}

export interface RecipeRecord {
  entity: EntityRecord;
  kind: string;
  /// What was set on the recipe itself.
  durationMinutes: number | null;
  /// That, else the steps' durations added up.
  totalDurationMinutes: number | null;
  bannerPath: string | null;
  bannerBlob: string | null;
  tags: RecipeTag[];
}

export interface RecipeItem {
  id: string;
  recipeId: string;
  text: string;
  position: number;
}

export interface RecipeStep extends RecipeItem {
  durationMinutes: number | null;
}

const toTag = (r: Record<string, string | number | null>): RecipeTag => ({
  id: str(r.id),
  name: str(r.name),
  icon: str(r.icon),
  color: str(r.color),
  position: num(r.position),
});

/// The whole tag catalog, in its order. It is fixed: every Space picks from the same list.
export async function listRecipeTags(db: LocalDb): Promise<RecipeTag[]> {
  return (
    await rows(db, "SELECT id, name, icon, color, position FROM recipe_tags ORDER BY position")
  ).map(toTag);
}

async function tagsOf(db: LocalDb, id: string): Promise<RecipeTag[]> {
  return (
    await rows(
      db,
      `SELECT t.id, t.name, t.icon, t.color, t.position FROM recipe_tags t
       JOIN recipe_tag_links l ON l.tag_id = t.id WHERE l.recipe_entity_id = ? ORDER BY t.position`,
      id,
    )
  ).map(toTag);
}

async function toRecipe(
  db: LocalDb,
  row: Record<string, string | number | null>,
): Promise<RecipeRecord> {
  const entity = toEntity(row);
  const duration = row.duration_minutes === null ? null : num(row.duration_minutes);
  let total = duration;
  if (total === null) {
    const sum = await first(
      db,
      "SELECT SUM(duration_minutes) AS total FROM recipe_steps WHERE recipe_entity_id = ? AND deleted_at IS NULL",
      entity.id,
    );
    total = sum?.total === null || sum?.total === undefined ? null : num(sum.total);
  }
  return {
    entity,
    kind: str(row.kind),
    durationMinutes: duration,
    totalDurationMinutes: total,
    bannerPath: optStr(row.banner_path),
    bannerBlob: optStr(row.banner_blob),
    tags: await tagsOf(db, entity.id),
  };
}

const RECIPE_SELECT = `SELECT ${ENTITY_COLUMNS}, r.kind, r.duration_minutes, r.banner_path, r.banner_blob
  FROM entities e JOIN recipes r ON r.entity_id = e.id`;

export async function listRecipes(db: LocalDb, spaceId?: string): Promise<RecipeRecord[]> {
  const found = await rows(
    db,
    `${RECIPE_SELECT} WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL${spaceId ? " AND e.space_id = ?" : ""} ORDER BY e.created_at`,
    ...(spaceId ? [spaceId] : []),
  );
  return Promise.all(found.map((row) => toRecipe(db, row)));
}

export async function getRecipe(db: LocalDb, id: string): Promise<RecipeRecord | null> {
  const row = await first(db, `${RECIPE_SELECT} WHERE e.id = ?`, id);
  return row ? toRecipe(db, row) : null;
}

export async function createRecipe(db: LocalDb, spaceId: string, title: string): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, "recipe", title);
  await write(db, [
    ...statements,
    { sql: "INSERT INTO recipes (entity_id) VALUES (?)", params: [id] },
  ]);
  return id;
}

export async function setRecipeKind(db: LocalDb, id: string, kind: string): Promise<void> {
  if (!RECIPE_KINDS.some((k) => k === kind)) {
    throw new Error(`The kind is one of ${RECIPE_KINDS.join(", ")}.`);
  }
  await write(db, [{ sql: "UPDATE recipes SET kind = ? WHERE entity_id = ?", params: [kind, id] }]);
}

export async function setRecipeDuration(
  db: LocalDb,
  id: string,
  minutes: number | null,
): Promise<void> {
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0)) {
    throw new Error("The duration is a whole number of minutes.");
  }
  await write(db, [
    { sql: "UPDATE recipes SET duration_minutes = ? WHERE entity_id = ?", params: [minutes, id] },
  ]);
}

/// Points the recipe at a banner image stored on this device (or none). Sync uploads it.
export async function setRecipeBanner(db: LocalDb, id: string, path: string | null): Promise<void> {
  await write(db, [
    { sql: "UPDATE recipes SET banner_path = ? WHERE entity_id = ?", params: [path, id] },
  ]);
}

/// `set_recipe_tags`: the recipe's whole tag set, every id from the catalog.
export async function setRecipeTags(db: LocalDb, id: string, tagIds: string[]): Promise<void> {
  const catalog = new Set((await listRecipeTags(db)).map((t) => t.id));
  for (const tag of tagIds) if (!catalog.has(tag)) throw new Error("That tag isn't in the list.");
  await write(db, [
    { sql: "DELETE FROM recipe_tag_links WHERE recipe_entity_id = ?", params: [id] },
    ...tagIds.map((tag) => ({
      sql: "INSERT OR IGNORE INTO recipe_tag_links (recipe_entity_id, tag_id) VALUES (?, ?)",
      params: [id, tag],
    })),
  ]);
}

export async function listIngredients(db: LocalDb, recipeId: string): Promise<RecipeItem[]> {
  return (
    await rows(
      db,
      "SELECT id, recipe_entity_id, text, position FROM recipe_ingredients WHERE recipe_entity_id = ? AND deleted_at IS NULL ORDER BY position",
      recipeId,
    )
  ).map((r) => ({
    id: str(r.id),
    recipeId: str(r.recipe_entity_id),
    text: str(r.text),
    position: num(r.position),
  }));
}

export async function listSteps(db: LocalDb, recipeId: string): Promise<RecipeStep[]> {
  return (
    await rows(
      db,
      "SELECT id, recipe_entity_id, text, duration_minutes, position FROM recipe_steps WHERE recipe_entity_id = ? AND deleted_at IS NULL ORDER BY position",
      recipeId,
    )
  ).map((r) => ({
    id: str(r.id),
    recipeId: str(r.recipe_entity_id),
    text: str(r.text),
    durationMinutes: r.duration_minutes === null ? null : num(r.duration_minutes),
    position: num(r.position),
  }));
}

type ListTable = "recipe_ingredients" | "recipe_steps";

async function addItem(
  db: LocalDb,
  table: ListTable,
  recipeId: string,
  text: string,
  duration: number | null | undefined,
): Promise<string> {
  const id = db.newId();
  const now = iso(db);
  const withDuration = table === "recipe_steps";
  await write(db, [
    {
      sql: `INSERT INTO ${table} (id, recipe_entity_id, text, ${withDuration ? "duration_minutes, " : ""}position, created_at, updated_at)
            VALUES (?, ?, ?, ${withDuration ? "?, " : ""}(SELECT COALESCE(MAX(position), -1) + 1 FROM ${table} WHERE recipe_entity_id = ?), ?, ?)`,
      params: [id, recipeId, text, ...(withDuration ? [duration ?? null] : []), recipeId, now, now],
    },
  ]);
  return id;
}

export const createIngredient = (db: LocalDb, recipeId: string, text: string) =>
  addItem(db, "recipe_ingredients", recipeId, text, undefined);

export const createStep = (
  db: LocalDb,
  recipeId: string,
  text: string,
  durationMinutes: number | null = null,
) => addItem(db, "recipe_steps", recipeId, text, durationMinutes);

export async function updateIngredient(db: LocalDb, id: string, text: string): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE recipe_ingredients SET text = ?, updated_at = ? WHERE id = ?",
      params: [text, iso(db), id],
    },
  ]);
}

/// `update_step`: a field that is not given stays as it was; `durationMinutes: null` clears it.
export async function updateStep(
  db: LocalDb,
  id: string,
  patch: { text?: string; durationMinutes?: number | null },
): Promise<void> {
  const now = iso(db);
  await write(db, [
    ...(patch.text === undefined
      ? []
      : [
          {
            sql: "UPDATE recipe_steps SET text = ?, updated_at = ? WHERE id = ?",
            params: [patch.text, now, id],
          },
        ]),
    ...(patch.durationMinutes === undefined
      ? []
      : [
          {
            sql: "UPDATE recipe_steps SET duration_minutes = ?, updated_at = ? WHERE id = ?",
            params: [patch.durationMinutes, now, id],
          },
        ]),
  ]);
}

/// `move_ingredient` and `move_step`: to `position` (0 based, clamped) among the visible
/// ones, the positions rewritten 0..n.
async function moveItem(
  db: LocalDb,
  table: ListTable,
  id: string,
  position: number,
): Promise<void> {
  const item = await first(db, `SELECT recipe_entity_id FROM ${table} WHERE id = ?`, id);
  if (!item) throw new Error("This isn't here anymore.");
  const ids = (
    await rows(
      db,
      `SELECT id FROM ${table} WHERE recipe_entity_id = ? AND deleted_at IS NULL ORDER BY position`,
      str(item.recipe_entity_id),
    )
  ).map((r) => str(r.id));
  const from = ids.indexOf(id);
  if (from < 0) throw new Error("A deleted item can't be moved.");
  ids.splice(from, 1);
  ids.splice(Math.min(Math.max(0, position), ids.length), 0, id);
  const now = iso(db);
  await write(
    db,
    ids.map((itemId, index) => ({
      sql: `UPDATE ${table} SET position = ?, updated_at = ? WHERE id = ? AND position != ?`,
      params: [index, now, itemId, index],
    })),
  );
}

export const moveIngredient = (db: LocalDb, id: string, position: number) =>
  moveItem(db, "recipe_ingredients", id, position);
export const moveStep = (db: LocalDb, id: string, position: number) =>
  moveItem(db, "recipe_steps", id, position);

async function trashItem(db: LocalDb, table: ListTable, id: string): Promise<void> {
  await write(db, [
    { sql: `UPDATE ${table} SET deleted_at = ? WHERE id = ?`, params: [iso(db), id] },
  ]);
}

/// Ingredients and steps go to the trash of their recipe, not away.
export const deleteIngredient = (db: LocalDb, id: string) =>
  trashItem(db, "recipe_ingredients", id);
export const deleteStep = (db: LocalDb, id: string) => trashItem(db, "recipe_steps", id);

/// `restore_ingredient` and `restore_step`: back in its old place when nothing took it,
/// else at the end.
async function restoreItem(db: LocalDb, table: ListTable, id: string): Promise<void> {
  const item = await first(db, `SELECT recipe_entity_id FROM ${table} WHERE id = ?`, id);
  if (!item) throw new Error("This isn't here anymore.");
  await write(db, [
    {
      sql: `UPDATE ${table} SET deleted_at = NULL,
            position = CASE WHEN EXISTS (SELECT 1 FROM ${table} o WHERE o.recipe_entity_id = ? AND o.deleted_at IS NULL AND o.id != ? AND o.position = ${table}.position)
              THEN (SELECT COALESCE(MAX(position), -1) + 1 FROM ${table} WHERE recipe_entity_id = ? AND deleted_at IS NULL AND id != ?)
              ELSE position END
            WHERE id = ?`,
      params: [str(item.recipe_entity_id), id, str(item.recipe_entity_id), id, id],
    },
  ]);
}

export const restoreIngredient = (db: LocalDb, id: string) =>
  restoreItem(db, "recipe_ingredients", id);
export const restoreStep = (db: LocalDb, id: string) => restoreItem(db, "recipe_steps", id);
