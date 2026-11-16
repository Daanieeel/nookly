import { createSpace, createTask, getEntity, trashEntity } from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { TrashScreen } from "./TrashScreen.tsx";

async function setup() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#3b82f6");
  const task = await createTask(data.db, space, "Old report");
  await trashEntity(data.db, task);
  const screen = await renderScreens({ index: () => <TrashScreen /> }, data, "/", { width: 1032 });
  return { data, task, screen };
}

// A tablet's Trash is the desktop's table (4.7): name, type, Space and when, with Restore
// and Delete Forever on each row.
describe("Trash on a tablet", () => {
  it("lists what was deleted as a table, the newest first", async () => {
    const { screen } = await setup();
    expect(await screen.findByRole("button", { name: /^Old report/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deleted, sorted descending" })).toBeTruthy();
    expect(screen.getByText("Type")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
  });

  it("restores a row from its own button", async () => {
    const { data, task, screen } = await setup();
    await fireEvent.press(await screen.findByRole("button", { name: "Restore Old report" }));
    await waitFor(async () => expect((await getEntity(data.db, task))?.deletedAt).toBeNull());
  });

  it("asks before deleting a row forever", async () => {
    const { screen } = await setup();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Delete Old report Forever" }),
    );
    expect(await screen.findByText('Delete "Old report" forever?')).toBeTruthy();
  });
});
