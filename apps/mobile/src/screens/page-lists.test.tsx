import {
  createSpace,
  createPage,
  refineJot,
  addBlock,
  updateBlock,
  getEntity,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { RecordingMenu } from "../test/menu.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { JotList, NoteList } from "./PageLists.tsx";

describe("a Space's Notes", () => {
  it("lists them with a preview and narrows them as you type", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const a = await createPage(data.db, space, "note", "Graph theory");
    await updateBlock(data.db, await addBlock(data.db, a, "paragraph", ""), "Vertices and edges");
    await createPage(data.db, space, "note", "Groceries");
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Graph theory" })).toBeTruthy();
    expect(screen.getByText("Vertices and edges")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Filter notes"), "grocer");
    expect(screen.queryByRole("button", { name: "Graph theory" })).toBeNull();
    expect(screen.getByRole("button", { name: "Groceries" })).toBeTruthy();
  });

  it("offers pin and trash on a long press", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const id = await createPage(data.db, space, "note", "Plan");
    const menu = new RecordingMenu();
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data, "/", {
      menu,
    });
    await fireEvent(await screen.findByRole("button", { name: "Plan" }), "longPress");
    expect(menu.labels()).toEqual(["Pin", "Move to Trash"]);
    menu.choose("Pin");
    await waitFor(async () => expect((await getEntity(data.db, id))?.pinned).toBe(true));
  });
});

describe("a Space's Jots", () => {
  it("starts on the unrefined ones, with counts on the presets", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    await createPage(data.db, space, "jot", "Call the bank");
    const done = await createPage(data.db, space, "jot", "Idea");
    await refineJot(data.db, done, "Idea note");
    const screen = await renderScreens({ index: () => <JotList spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Call the bank" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Idea" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Unrefined 1" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "All 2" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Refined 1" }));
    expect(await screen.findByRole("button", { name: "Idea" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Refined into Idea note" })).toBeTruthy();
  });

  it("says when nothing was captured", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const screen = await renderScreens({ index: () => <JotList spaceId={space} /> }, data);
    expect(await screen.findByText("Nothing captured yet")).toBeTruthy();
  });
});
