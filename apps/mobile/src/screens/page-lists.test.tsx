import {
  createSpace,
  createPage,
  refineJot,
  addBlock,
  updateBlock,
  getEntity,
  attachLabel,
  createLabel,
  createCourse,
  createOneOffSession,
  createSessionPage,
  setPinned,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { RecordingMenu } from "../test/menu.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { IconFeather } from "@tabler/icons-react-native";
import { choose, openRow } from "../test/sheet.ts";
import { StyleSheet } from "react-native";
import { semantic } from "../ui/tokens.ts";
import { JotList, NoteList } from "./PageLists.tsx";

type Node = { parent: Node | null; props: { className?: unknown } };

/// Whether anything around `node` is the boxed card the lists used to sit in.
function inCard(node: Node | null): boolean {
  for (let at = node; at; at = at.parent) {
    if (String(at.props.className ?? "").includes("rounded-xl")) return true;
  }
  return false;
}

// A tablet's Notes and Jots are the desktop's tables (5.2, 5.3): the title, its labels and
// when it changed, the headings sorting it.
describe("Notes and Jots on a tablet", () => {
  it("lists notes as a table with their labels, once Display asks for it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const a = await createPage(data.db, space, "note", "Apple");
    await attachLabel(data.db, a, await createLabel(data.db, space, "Ideas"));
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data, "/", {
      width: 1032,
    });
    expect(await screen.findByRole("button", { name: "Apple" })).toBeTruthy();
    // Notes open as cards, like the desktop's; the table is a layout of Display's.
    expect(screen.queryByRole("button", { name: /^Edited/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Table" }));
    expect(await screen.findByRole("button", { name: /^Edited/ })).toBeTruthy();
    expect(screen.getByText("Ideas")).toBeTruthy();
  });

  it("lists jots as a table", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    await createPage(data.db, space, "jot", "Call the bank");
    const screen = await renderScreens({ index: () => <JotList spaceId={space} /> }, data, "/", {
      width: 1032,
    });
    expect(await screen.findByRole("button", { name: "Call the bank" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Edited/ })).toBeTruthy();
  });
});

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
    expect(screen.getByRole("button", { name: "Labels: Ideas" })).toBeTruthy();
  });

  // Every list filters on what its items have (D73): the desktop's Course, Pinned and Created.
  it("narrows to a course, to pinned ones and to when they were created", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    const session = await createOneOffSession(data.db, space, {
      title: "Lecture",
      courseId: course,
      date: "2026-11-18",
      startTime: "10:00",
      endTime: "12:00",
    });
    const lecture = await createSessionPage(data.db, session, "note");
    const pinnedOne = await createPage(data.db, space, "note", "Pinned plan");
    await setPinned(data.db, pinnedOne, true);
    await createPage(data.db, space, "note", "Groceries");
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Groceries" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const name of ["Course", "Labels", "Pinned", "Last edited", "Created"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${name}, `) })).toBeTruthy();
    }
    await openRow(screen, "Course");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Algorithms" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Groceries" })).toBeNull());
    expect((await getEntity(data.db, lecture))?.title).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pinned plan" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Remove Course Filter" }));
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Pinned");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Pinned" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Groceries" })).toBeNull());
    expect(screen.getByRole("button", { name: "Pinned plan" })).toBeTruthy();
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

describe("a Space's Notes, as the desktop browses them", () => {
  async function uniNotes() {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    const session = await createOneOffSession(data.db, space, {
      title: "Lecture",
      courseId: course,
      date: "2026-11-18",
      startTime: "10:00",
      endTime: "12:00",
    });
    await createSessionPage(data.db, session, "note");
    const pinned = await createPage(data.db, space, "note", "Exam plan");
    await setPinned(data.db, pinned, true);
    const groceries = await createPage(data.db, space, "note", "Groceries");
    return { data, space, groceries };
  }

  it("groups them under Pinned, each course and no course", async () => {
    const { data, space } = await uniNotes();
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Groceries" })).toBeTruthy();
    for (const group of ["Pinned", "Algorithms", "No course"]) {
      expect(screen.getByRole("button", { name: group })).toBeTruthy();
    }
    // A group folds away on its header.
    await fireEvent.press(screen.getByRole("button", { name: "No course" }));
    expect(screen.queryByRole("button", { name: "Groceries" })).toBeNull();
  });

  it("groups by label from Display, and remembers it", async () => {
    const { data, space, groceries } = await uniNotes();
    await attachLabel(data.db, groceries, await createLabel(data.db, space, "Ideas"));
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    await screen.findByRole("button", { name: "Groceries" });
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await choose(screen, "Group by", "Label");
    // The group's header, and the label on the note's card.
    expect((await screen.findAllByRole("button", { name: "Ideas" })).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "No label" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Algorithms" })).toBeNull();
  });

  // Long labels wrapped the card's last line; the ones that do not fit give way to "...".
  it("shows a ... badge in place of the labels that do not fit beside the date", async () => {
    const { data, space, groceries } = await uniNotes();
    for (const name of ["Ideas", "Exam", "Draft"]) {
      await attachLabel(data.db, groceries, await createLabel(data.db, space, name));
    }
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    await screen.findByRole("button", { name: "Groceries" });
    const widths = async (room: number) => {
      // Every badge is 60 wide, the row has `room` for them.
      for (const badge of screen.queryAllByTestId(/^label-measure-/, { hidden: true })) {
        await fireEvent(badge, "layout", { nativeEvent: { layout: { width: 60 } } });
      }
      await fireEvent(screen.getByTestId("label-room"), "layout", {
        nativeEvent: { layout: { width: room } },
      });
    };
    await widths(300);
    expect(screen.queryByTestId("label-more")).toBeNull();
    await widths(150);
    expect(screen.getAllByTestId("label-more")).toHaveLength(1);
    // Two labels stay; the third gave way.
    expect(screen.getByTestId("label-room")).toBeTruthy();
  });

  it("hides the Continue category from Display", async () => {
    const { data, space } = await uniNotes();
    for (const title of ["A", "B", "C"]) await createPage(data.db, space, "note", title);
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    expect(await screen.findByRole("header", { name: "Continue" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent(
      screen.getByRole("switch", { name: 'Show category "Continue"' }),
      "valueChange",
      false,
    );
    await waitFor(() => expect(screen.queryByRole("header", { name: "Continue" })).toBeNull());
  });

  it("offers Continue only above four notes", async () => {
    const { data, space } = await uniNotes();
    const few = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    await few.findByRole("button", { name: "Groceries" });
    expect(few.queryByRole("header", { name: "Continue" })).toBeNull();
    few.unmount();
    for (const title of ["A", "B", "C"]) await createPage(data.db, space, "note", title);
    const many = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    expect(await many.findByRole("header", { name: "Continue" })).toBeTruthy();
  });

  // The cards were the page's own colour in light mode: no card at all, and a black pin.
  it("draws a note as a card a step off the page, with a muted pin", async () => {
    const { data, space } = await uniNotes();
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    await screen.findByRole("button", { name: "Groceries" });
    const [card] = screen.getAllByTestId("note-card");
    const { backgroundColor } = StyleSheet.flatten(card.props.style);
    expect(backgroundColor).toEqual(semantic("pageCard", "light"));
  });

  it("switches between cards and a list from Display", async () => {
    const { data, space } = await uniNotes();
    const screen = await renderScreens({ index: () => <NoteList spaceId={space} /> }, data);
    await screen.findByRole("button", { name: "Groceries" });
    expect(screen.getAllByTestId("note-card").length).toBe(3);
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent.press(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => expect(screen.queryAllByTestId("note-card").length).toBe(0));
    expect(screen.getByRole("button", { name: "Groceries" })).toBeTruthy();
  });
});

describe("a Space's Jots", () => {
  it("starts on the unrefined ones, and Show refined adds the refined under them", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    await createPage(data.db, space, "jot", "Call the bank");
    const done = await createPage(data.db, space, "jot", "Idea");
    await refineJot(data.db, done, "Idea note");
    const screen = await renderScreens({ index: () => <JotList spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Call the bank" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Idea" })).toBeNull();
    // The inbox is the page; there is no strip of presets, only a quiet toggle.
    expect(screen.queryByRole("tab")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show refined 1" });
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(inCard(await screen.findByRole("button", { name: "Call the bank" }))).toBe(false);
    await fireEvent.press(toggle);
    expect(await screen.findByRole("button", { name: "Hide refined 1" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Idea" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Refined into Idea note" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Refined" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Call the bank" })).toBeTruthy();
  });

  it("says when nothing was captured", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const screen = await renderScreens({ index: () => <JotList spaceId={space} /> }, data);
    expect(await screen.findByText("Nothing Captured Yet")).toBeTruthy();
    // Its feather was drawn black, unreadable in dark mode.
    expect(screen.UNSAFE_getByType(IconFeather).props.color).toBeTruthy();
  });
});
