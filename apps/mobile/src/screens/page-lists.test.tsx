import {
  createSpace,
  createPage,
  refineJot,
  addBlock,
  updateBlock,
  getEntity,
  attachLabel,
  createLabel,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { RecordingMenu } from "../test/menu.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { IconFeather } from "@tabler/icons-react-native";
import { choose, openRow } from "../test/sheet.ts";
import { JotList, NoteList } from "./PageLists.tsx";

type Node = { parent: Node | null; props: { className?: unknown } };

/// Whether anything around `node` is the boxed card the lists used to sit in.
function inCard(node: Node | null): boolean {
  for (let at = node; at; at = at.parent) {
    if (String(at.props.className ?? "").includes("rounded-xl")) return true;
  }
  return false;
}

describe("a Space's Notes", () => {
  // The rows sat in one big rounded box under a row of filled chips; Tasks and Assignments
  // are flat, with the desktop's quiet controls. The order is in Display, as theirs (D65).
  it("lies flat and orders from Display", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    await createPage(data.db, space, "note", "Banana");
    await createPage(data.db, space, "note", "Apple");
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    const row = await screen.findByRole("button", { name: "Apple" });
    expect(inCard(row)).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await choose(screen, "Ordering", "Title");
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("button", { name: /^(Apple|Banana)$/ })
          .map((b) => b.props.accessibilityLabel),
      ).toEqual(["Apple", "Banana"]),
    );
  });

  // The desktop's filters: its labels, and when it was last edited.
  it("narrows to a label from Filter", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const a = await createPage(data.db, space, "note", "Tagged");
    await createPage(data.db, space, "note", "Plain");
    await attachLabel(data.db, a, await createLabel(data.db, space, "Ideas"));
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Plain" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Labels");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Ideas" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Plain" })).toBeNull());
    expect(screen.getByRole("button", { name: "Tagged" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Ideas ×" })).toBeTruthy();
  });

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

  // The preview showed the stored markdown, stars and all, where the desktop shows text.
  it("previews the text without its markdown, as the desktop does", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const a = await createPage(data.db, space, "note", "Networks");
    await updateBlock(
      data.db,
      await addBlock(data.db, a, "paragraph", ""),
      "**Networks** is about [links](https://x.org)",
    );
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    expect(await screen.findByText("Networks is about links")).toBeTruthy();
  });

  it("offers the item's menu, the desktop's right click, on a long press", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const id = await createPage(data.db, space, "note", "Plan");
    const menu = new RecordingMenu();
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data, "/", {
      menu,
    });
    await fireEvent(await screen.findByRole("button", { name: "Plan" }), "longPress");
    expect(menu.labels()).toEqual([
      "Open",
      "Duplicate",
      "Pin",
      "Relate to…",
      "Move to Space",
      "Change Icon",
      "Labels",
      "Copy Link",
      "Copy ID",
      "Save as Nookly Page",
      "Move to Trash",
    ]);
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
    // The presets are the desktop's quiet tabs, not filled chips.
    expect(screen.getByRole("tab", { name: "Unrefined 1" }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole("tab", { name: "All 2" })).toBeTruthy();
    expect(inCard(await screen.findByRole("button", { name: "Call the bank" }))).toBe(false);
    await fireEvent.press(screen.getByRole("tab", { name: "Refined 1" }));
    expect(await screen.findByRole("button", { name: "Idea" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Refined into Idea note" })).toBeTruthy();
  });

  it("says when nothing was captured", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const screen = await renderScreens({ index: () => <JotList spaceId={space} /> }, data);
    expect(await screen.findByText("Nothing captured yet")).toBeTruthy();
    // Its feather was drawn black, unreadable in dark mode.
    expect(screen.UNSAFE_getByType(IconFeather).props.color).toBeTruthy();
  });
});
