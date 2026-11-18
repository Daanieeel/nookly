import {
  createBookmark,
  createPage,
  createSpace,
  createTask,
  getEntity,
  getTask,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import type { ReactTestInstance } from "react-test-renderer";
import { renderScreens, testData } from "../test/render.tsx";
import { BookmarkList } from "./BookmarkList.tsx";
import { localDay } from "./dates.ts";
import { JotList, NoteList } from "./PageLists.tsx";
import { TasksScreen } from "./TasksScreen.tsx";

type Node = ReactTestInstance;

/// The row's swipe actions, as a screen reader offers them, in order: the leading side's,
/// then the trailing side's.
function swipeOf(node: Node) {
  let at: Node | null = node;
  while (at && !at.props.onAccessibilityAction) at = at.parent;
  if (!at) throw new Error("no swipe actions");
  return at;
}

const names = (node: Node): string[] =>
  (swipeOf(node).props.accessibilityActions ?? []).map((a: { name: string }) => a.name);

async function act(node: Node, name: string) {
  await fireEvent(swipeOf(node), "accessibilityAction", { nativeEvent: { actionName: name } });
}

// Only tasks and the Trash could be swiped. Every list's rows now swipe, each type with its
// own action first, and right to left always ends in Trash (the user's list, D76).
describe("swiping a row", () => {
  it("schedules a task for today, then tomorrow, instead of only finishing it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#0070f3");
    const id = await createTask(data.db, space, "Write report");
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    const row = await screen.findByLabelText("Write report, TSK-1");
    expect(names(row)).toEqual(["Today", "Pin", "More", "Trash"]);
    await act(row, "Today");
    await waitFor(async () => expect((await getTask(data.db, id))?.dueDate).toBe(localDay()));
    await waitFor(() =>
      expect(names(screen.getByLabelText("Write report, TSK-1"))[0]).toBe("Tomorrow"),
    );
  });

  it("moves a note to Trash, and pins it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#0070f3");
    const id = await createPage(data.db, space, "note", "Plans");
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    const row = await screen.findByRole("button", { name: "Plans" });
    expect(names(row)).toEqual(["Pin", "More", "Trash"]);
    await act(row, "Pin");
    await waitFor(async () => expect((await getEntity(data.db, id))?.pinned).toBe(true));
    await act(await screen.findByRole("button", { name: "Plans" }), "Trash");
    await waitFor(async () => expect((await getEntity(data.db, id))?.deletedAt).not.toBeNull());
  });

  it("refines a jot from its row", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#0070f3");
    await createPage(data.db, space, "jot", "An idea");
    const screen = await renderScreens({ index: () => <JotList spaceId={space} /> }, data);
    const row = await screen.findByRole("button", { name: "An idea" });
    expect(names(row)).toEqual(["Refine", "Pin", "More", "Trash"]);
  });

  it("copies a bookmark's address from its row in the list", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    await createBookmark(data.db, space, "https://example.com/a", "Example");
    const screen = await renderScreens({ index: () => <BookmarkList spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "List" }));
    const row = await screen.findByRole("link", { name: "Example" });
    expect(names(row)).toEqual(["Copy URL", "Pin", "More", "Trash"]);
  });
});
