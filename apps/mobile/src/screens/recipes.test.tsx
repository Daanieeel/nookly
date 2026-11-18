import {
  createRecipe,
  createSpace,
  getRecipe,
  listIngredients,
  listSteps,
  listRecipeTags,
  setRecipeTags,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { choose, openRow } from "../test/sheet.ts";
import { EntityScreen } from "./EntityScreen.tsx";
import { RecipeRows } from "./RecipeScreens.tsx";
import type { PhotoPicker, PhotoSource } from "../ui/photo-picker.tsx";

async function open(photoPicker?: PhotoPicker) {
  const data = testData();
  const space = await createSpace(data.db, "Kitchen", "#22c55e");
  const recipe = await createRecipe(data.db, space, "Pancakes");
  const screen = await renderScreens(
    { "entity/[id]": () => <EntityScreen id={recipe} /> },
    data,
    `/entity/${recipe}`,
    { photoPicker },
  );
  return { data, space, recipe, screen };
}

// A tablet's recipe has its ingredients beside its steps where the page is wide, as the
// desktop's, and stacked where it is narrow (6.9).
describe("a recipe on a tablet", () => {
  it("puts its ingredients beside its steps in a wide page", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Kitchen", "#22c55e");
    const recipe = await createRecipe(data.db, space, "Pancakes");
    const wide = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={recipe} /> },
      data,
      `/entity/${recipe}`,
      { width: 1376, height: 1032 },
    );
    expect(await wide.findByTestId("recipe-columns")).toBeTruthy();
    wide.unmount();
    const narrow = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={recipe} /> },
      data,
      `/entity/${recipe}`,
      { width: 744, height: 1133 },
    );
    expect(await narrow.findByText("INGREDIENTS")).toBeTruthy();
    expect(narrow.queryByTestId("recipe-columns")).toBeNull();
  });
});

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

  // The desktop's filters (D73): kind, tags, time and the fields every item has.
  it("narrows by kind, tags and time", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Kitchen", "#22c55e");
    const oats = await createRecipe(data.db, space, "Overnight oats");
    await createRecipe(data.db, space, "Lasagne");
    data.driver.exec(
      "UPDATE recipes SET kind = 'breakfast', duration_minutes = 10 WHERE entity_id = ?",
      oats,
    );
    const screen = await renderScreens({ index: () => <RecipeRows spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Lasagne" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const name of ["Kind", "Tags", "Time", "Pinned", "Created", "Updated"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${name}, `) })).toBeTruthy();
    }
    await openRow(screen, "Time");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "15 minutes or less" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Lasagne" })).toBeNull());
    expect(screen.getByRole("button", { name: "Overnight oats" })).toBeTruthy();
  });

  // Its tags were plain grey badges; on the desktop each is tinted with its colour.
  it("shows its tags in their colours", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Kitchen", "#22c55e");
    const recipe = await createRecipe(data.db, space, "Pancakes");
    const [tag] = await listRecipeTags(data.db);
    await setRecipeTags(data.db, recipe, [tag.id]);
    const screen = await renderScreens({ index: () => <RecipeRows spaceId={space} /> }, data);
    const chip = await screen.findByLabelText(`Tag ${tag.name}`);
    expect(chip.props.style).toMatchObject({ backgroundColor: `${tag.color}24` });
  });

  it("changes its kind and its time", async () => {
    const { data, recipe, screen } = await open();
    await choose(screen, "Kind", "Dessert");
    await waitFor(async () => expect((await getRecipe(data.db, recipe))?.kind).toBe("dessert"));
    const minutes = screen.getAllByLabelText("Time")[0];
    await fireEvent.changeText(minutes, "40");
    await fireEvent(minutes, "endEditing");
    await waitFor(async () => expect((await getRecipe(data.db, recipe))?.durationMinutes).toBe(40));
  });

  // As on the desktop: an empty banner is a quiet placeholder with a small camera button.
  it("shows a placeholder banner with a small button to add one", async () => {
    const { screen } = await open();
    expect(await screen.findByLabelText("No banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Banner Image" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose Banner" })).toBeNull();
  });

  // The camera button went straight to the file picker. As iOS apps do, it asks first where
  // the picture comes from: the photo library, the camera or a file.
  it("asks where the banner comes from, and takes one from the photo library", async () => {
    const asked: PhotoSource[] = [];
    const { data, recipe, screen } = await open({
      pick: async (source) => {
        asked.push(source);
        return "file:///picked/pancakes.jpg";
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Add Banner Image" }));
    expect(await screen.findByRole("menuitem", { name: "Take Photo" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Choose File" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("menuitem", { name: "Photo Library" }));
    await waitFor(async () =>
      expect((await getRecipe(data.db, recipe))?.bannerPath).toBe("file:///picked/pancakes.jpg"),
    );
    expect(asked).toEqual(["library"]);
  });

  it("adds, edits, moves and removes ingredients and steps", async () => {
    const { data, recipe, screen } = await open();
    const newIngredient = await screen.findByLabelText("New ingredient");
    // The add button only shows once there is something to add, so it never squeezes the field.
    expect(screen.queryByRole("button", { name: "Add Ingredient" })).toBeNull();
    await fireEvent.changeText(newIngredient, "2 eggs");
    await fireEvent(newIngredient, "submitEditing");
    await waitFor(async () =>
      expect((await listIngredients(data.db, recipe)).map((i) => i.text)).toEqual(["2 eggs"]),
    );
    const field = await screen.findByLabelText("Ingredient 1");
    await fireEvent.changeText(field, "3 eggs");
    await fireEvent(field, "endEditing");
    await waitFor(async () =>
      expect((await listIngredients(data.db, recipe))[0].text).toBe("3 eggs"),
    );
    await fireEvent.changeText(screen.getByLabelText("New step"), "Whisk");
    await fireEvent.press(await screen.findByRole("button", { name: "Add Step" }));
    await waitFor(async () =>
      expect((await listSteps(data.db, recipe)).map((s) => s.text)).toEqual(["Whisk"]),
    );
    await fireEvent.changeText(screen.getByLabelText("New ingredient"), "1 cup flour");
    await fireEvent(screen.getByLabelText("New ingredient"), "submitEditing");
    await fireEvent.press(await screen.findByRole("button", { name: "More for Ingredient 2" }));
    await fireEvent.press(await screen.findByRole("menuitem", { name: "Move Up" }));
    await waitFor(async () =>
      expect((await listIngredients(data.db, recipe)).map((i) => i.text)).toEqual([
        "1 cup flour",
        "3 eggs",
      ]),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Ingredient 1").props.value).toBe("1 cup flour"),
    );
    await fireEvent.press(screen.getByRole("button", { name: "More for Ingredient 1" }));
    await fireEvent.press(await screen.findByRole("menuitem", { name: "Delete Ingredient" }));
    await waitFor(async () =>
      expect((await listIngredients(data.db, recipe)).map((i) => i.text)).toEqual(["3 eggs"]),
    );
  });
});
