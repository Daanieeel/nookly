import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace } from "./entities.ts";
import {
  createIngredient,
  createRecipe,
  createStep,
  deleteIngredient,
  deleteStep,
  getRecipe,
  listIngredients,
  listRecipeTags,
  listRecipes,
  listSteps,
  moveIngredient,
  moveStep,
  restoreIngredient,
  setRecipeBanner,
  setRecipeDuration,
  setRecipeKind,
  setRecipeTags,
  updateIngredient,
  updateStep,
} from "./recipes.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
let recipe: string;

beforeEach(async () => {
  db = testDb();
  recipe = await createRecipe(db, await createSpace(db, "Kitchen", "#000000"), "Pancakes");
});

describe("a recipe", () => {
  it("starts as 'other' with nothing else, and takes a kind, a duration and a banner", async () => {
    expect(await getRecipe(db, recipe)).toMatchObject({
      kind: "other",
      durationMinutes: null,
      totalDurationMinutes: null,
      bannerPath: null,
      tags: [],
    });
    await setRecipeKind(db, recipe, "breakfast");
    await setRecipeDuration(db, recipe, 25);
    await setRecipeBanner(db, recipe, "file:///docs/banners/pancakes.jpg");
    expect(await getRecipe(db, recipe)).toMatchObject({
      kind: "breakfast",
      durationMinutes: 25,
      totalDurationMinutes: 25,
      bannerPath: "file:///docs/banners/pancakes.jpg",
    });
    await expect(setRecipeKind(db, recipe, "brunch")).rejects.toThrow("The kind is one of");
    await expect(setRecipeDuration(db, recipe, 1.5)).rejects.toThrow("whole number");
  });

  it("totals its steps' durations when it has none of its own", async () => {
    await createStep(db, recipe, "Mix", 5);
    const bake = await createStep(db, recipe, "Bake", 20);
    await createStep(db, recipe, "Serve");
    expect((await getRecipe(db, recipe))?.totalDurationMinutes).toBe(25);
    await deleteStep(db, bake);
    expect((await getRecipe(db, recipe))?.totalDurationMinutes).toBe(5);
  });

  it("takes tags from the fixed catalog only, listed in the catalog's order", async () => {
    const catalog = await listRecipeTags(db);
    expect(catalog.length).toBeGreaterThan(3);
    await setRecipeTags(db, recipe, [catalog[2].id, catalog[0].id]);
    expect((await getRecipe(db, recipe))?.tags.map((t) => t.id)).toEqual([
      catalog[0].id,
      catalog[2].id,
    ]);
    await expect(setRecipeTags(db, recipe, ["nope"])).rejects.toThrow("isn't in the list");
    await setRecipeTags(db, recipe, []);
    expect((await getRecipe(db, recipe))?.tags).toEqual([]);
  });

  it("is listed with its Space's others", async () => {
    const other = await createRecipe(db, (await listRecipes(db))[0].entity.spaceId, "Waffles");
    expect((await listRecipes(db)).map((r) => r.entity.id)).toEqual([recipe, other]);
  });
});

describe("ingredients and steps", () => {
  it("add in order, edit, move, and go to the trash where they come back", async () => {
    const flour = await createIngredient(db, recipe, "200 g flour");
    const milk = await createIngredient(db, recipe, "300 ml milk");
    const eggs = await createIngredient(db, recipe, "2 eggs");
    await updateIngredient(db, milk, "250 ml milk");
    await moveIngredient(db, eggs, 0);
    expect((await listIngredients(db, recipe)).map((i) => i.text)).toEqual([
      "2 eggs",
      "200 g flour",
      "250 ml milk",
    ]);
    await deleteIngredient(db, flour);
    expect((await listIngredients(db, recipe)).map((i) => i.text)).toEqual([
      "2 eggs",
      "250 ml milk",
    ]);
    await restoreIngredient(db, flour);
    expect((await listIngredients(db, recipe)).map((i) => i.text)).toEqual([
      "2 eggs",
      "200 g flour",
      "250 ml milk",
    ]);
  });

  it("puts a restored one at the end when its place was taken", async () => {
    const a = await createIngredient(db, recipe, "a");
    await createIngredient(db, recipe, "b");
    await deleteIngredient(db, a);
    await createIngredient(db, recipe, "c");
    await moveIngredient(db, (await listIngredients(db, recipe))[0].id, 0);
    await restoreIngredient(db, a);
    const texts = (await listIngredients(db, recipe)).map((i) => i.text);
    expect(texts.at(-1)).toBe("a");
    expect(new Set((await listIngredients(db, recipe)).map((i) => i.position)).size).toBe(3);
  });

  it("changes a step's text and duration separately, and clears the duration", async () => {
    const step = await createStep(db, recipe, "Mix", 5);
    await updateStep(db, step, { text: "Mix well" });
    expect((await listSteps(db, recipe))[0]).toMatchObject({
      text: "Mix well",
      durationMinutes: 5,
    });
    await updateStep(db, step, { durationMinutes: null });
    expect((await listSteps(db, recipe))[0]).toMatchObject({
      text: "Mix well",
      durationMinutes: null,
    });
  });

  it("moves a step and clamps the place", async () => {
    const a = await createStep(db, recipe, "a");
    await createStep(db, recipe, "b");
    await moveStep(db, a, 99);
    expect((await listSteps(db, recipe)).map((s) => s.text)).toEqual(["b", "a"]);
    await expect(moveStep(db, "missing", 0)).rejects.toThrow("isn't here");
  });
});
