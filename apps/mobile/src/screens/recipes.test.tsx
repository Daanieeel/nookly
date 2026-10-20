import {
  createIngredient,
  createRecipe,
  createSpace,
  getRecipe,
  listIngredients,
  listSteps,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { RecipeRows } from "./RecipeScreens.tsx";

async function open() {
  const data = testData();
  const space = await createSpace(data.db, "Kitchen", "#22c55e");
  const recipe = await createRecipe(data.db, space, "Pancakes");
  const screen = await renderScreens(
    { "entity/[id]": () => <EntityScreen id={recipe} /> },
    data,
    `/entity/${recipe}`,
  );
  return { data, space, recipe, screen };
}

describe("a recipe", () => {
  it("lists a Space's recipes with their kind and time", async () => {
    const { data, space, recipe } = await open();
    await data.driver.rows(
      "UPDATE recipes SET kind = 'breakfast', duration_minutes = 25 WHERE entity_id = ?",
      recipe,
    );
    const screen = await renderScreens({ index: () => <RecipeRows spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Pancakes" })).toBeTruthy();
    expect(screen.getByText("Breakfast")).toBeTruthy();
    expect(screen.getByText("25 min")).toBeTruthy();
  });

  it("changes its kind and its time", async () => {
    const { data, recipe, screen } = await open();
    await fireEvent.press(await screen.findByRole("radio", { name: "Dessert" }));
    await waitFor(async () => expect((await getRecipe(data.db, recipe))?.kind).toBe("dessert"));
    const minutes = screen.getAllByLabelText("Minutes")[0];
    await fireEvent.changeText(minutes, "40");
    await fireEvent(minutes, "endEditing");
    await waitFor(async () => expect((await getRecipe(data.db, recipe))?.durationMinutes).toBe(40));
  });

  it("adds, edits and removes ingredients and steps", async () => {
    const { data, recipe, screen } = await open();
    await fireEvent.changeText(await screen.findByLabelText("Ingredient"), "2 eggs");
    await fireEvent.press(screen.getByRole("button", { name: "Add Ingredient" }));
    await waitFor(async () =>
      expect((await listIngredients(data.db, recipe)).map((i) => i.text)).toEqual(["2 eggs"]),
    );
    const field = await screen.findByLabelText("Text 1");
    await fireEvent.changeText(field, "3 eggs");
    await fireEvent(field, "endEditing");
    await waitFor(async () =>
      expect((await listIngredients(data.db, recipe))[0].text).toBe("3 eggs"),
    );
    await fireEvent.changeText(screen.getByLabelText("Step"), "Whisk");
    await fireEvent.press(screen.getByRole("button", { name: "Add Step" }));
    await waitFor(async () =>
      expect((await listSteps(data.db, recipe)).map((s) => s.text)).toEqual(["Whisk"]),
    );
    await createIngredient(data.db, recipe, "1 cup flour");
    await fireEvent.press(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(async () =>
      expect((await listIngredients(data.db, recipe)).map((i) => i.text)).toEqual(["1 cup flour"]),
    );
  });
});
