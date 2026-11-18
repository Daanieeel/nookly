import {
  listBlocks,
  createAssignment,
  createCourse,
  createDeck,
  createPage,
  createSpace,
  createTask,
  listUnrefinedJots,
  getAssignment,
  updateAssignment,
} from "@nookly/shared/data";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { barLabels, renderScreens, testData } from "../test/render.tsx";
import { choose, openRow } from "../test/sheet.ts";
import { readPreference, writePreference } from "../data/preferences.ts";
import { AssignmentsScreen } from "./AssignmentsScreen.tsx";
import { DashboardScreen } from "./DashboardScreen.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { QuickJotScreen } from "./QuickJot.tsx";
import { SidebarSettingsScreen } from "./settings/SidebarSettings.tsx";
import { DEFAULT_TOP, topSchema } from "./sidebar-top.ts";
import { addDays, localDay } from "./dates.ts";

/// The desktop's Dashboard, as an iPad shows it (a phone has its Home, `home.test.tsx`).
const IPAD = { width: 1100 };

describe("the dashboard", () => {
  it("says what the day holds and lists jots to refine, which refining takes off", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    await createTask(data.db, space, "Send report", localDay());
    await createTask(data.db, space, "Pay rent", addDays(localDay(), -2));
    const jot = await createPage(data.db, space, "jot", "Idea for the app");
    const screen = await renderScreens(
      { index: () => <DashboardScreen />, "entity/[id]": () => <Text>Opened</Text> },
      data,
      "/",
      IPAD,
    );
    expect(await screen.findByRole("button", { name: "Idea for the app" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "To be refined 1" })).toBeTruthy();
    // The sentence says what the day holds, with the counts as links.
    expect((await screen.findAllByRole("link", { name: /1 overdue/ })).length).toBeGreaterThan(0);
    expect(jot).toBeTruthy();
  });

  it("refines a jot into a note from the jot's details", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const jot = await createPage(data.db, space, "jot", "Idea for the app");
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={jot} /> },
      data,
      `/entity/${jot}`,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Refine into New Note" }));
    await waitFor(async () => expect(await listUnrefinedJots(data.db)).toEqual([]));
  });

  it("lists assignments that are due soon and decks with cards to study", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet 3", course, addDays(localDay(), 3));
    await createDeck(data.db, space, "Graph terms");
    const screen = await renderScreens({ index: () => <DashboardScreen /> }, data, "/", IPAD);
    await fireEvent.press(await screen.findByRole("tab", { name: "Next 7 days 1" }));
    expect(await screen.findByRole("button", { name: "Sheet 3" })).toBeTruthy();
  });

  // A tablet is the desktop made for touch (4.1): its Dashboard in every window, two
  // columns of panels where they fit, one in a narrow one, never the phone's Home.
  it("is the desktop's dashboard on any tablet, its panels in columns where they fit", async () => {
    const mini = await renderScreens({ index: () => <DashboardScreen /> }, testData(), "/", {
      width: 744,
      height: 1133,
    });
    expect(await mini.findByTestId("dashboard-panels")).toBeTruthy();
    expect(mini.queryByText("At a glance")).toBeNull();
    expect(mini.getAllByTestId("dashboard-column")).toHaveLength(1);
    mini.unmount();
    const wide = await renderScreens({ index: () => <DashboardScreen /> }, testData(), "/", {
      width: 1376,
      height: 1032,
    });
    await wide.findByTestId("dashboard-panels");
    expect(wide.getAllByTestId("dashboard-column")).toHaveLength(2);
  });

  // The desktop's Dashboard has the mascot in its top right corner.
  it("greets with the mascot", async () => {
    const screen = await renderScreens({ index: () => <DashboardScreen /> }, testData());
    expect(await screen.findByTestId("mascot", { includeHiddenElements: true })).toBeTruthy();
  });

  // A general page: a + there would only ever make a task, which reads as misleading. The
  // phone's Home makes things from its own tiles instead.
  it("has no New Task button in its bar", async () => {
    const data = testData();
    const screen = await renderScreens({ index: () => <DashboardScreen /> }, data);
    expect(await screen.findByRole("header", { name: "At a glance" })).toBeTruthy();
    expect(barLabels(screen)).not.toContain("New Task");
  });

  it("opens each panel on its first tab that holds something", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet 3", course, addDays(localDay(), 3));
    const screen = await renderScreens({ index: () => <DashboardScreen /> }, data, "/", IPAD);
    // Nothing is due today, so the panel opens on the next week rather than on nothing.
    expect(await screen.findByRole("button", { name: "Sheet 3" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Next 7 days 1" }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});

describe("the assignments overview", () => {
  // Its filters hid in the Filter sheet and an empty result said only "Nothing matches these
  // filters.": the filters that are on show as Tasks' chips, and the empty list offers to
  // clear them.
  it("shows its filters as chips and offers to clear them when they hide everything", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet 3", course, addDays(localDay(), 3));
    writePreference("assignments.display.all", {
      layout: "list",
      grouping: "due",
      ordering: "auto",
      courses: [],
      statuses: ["evaluated"],
      due: [],
      grades: [],
      evaluated: [],
      pinned: [],
      created: [],
      updated: [],
    });
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    expect(await screen.findByTestId("filter-chip")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Status Filter" })).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: "Clear Filters" }));
    expect(await screen.findByRole("button", { name: /^Sheet 3,/ })).toBeTruthy();
    expect(screen.queryByTestId("filter-chip")).toBeNull();
  });

  it("sorts assignments of every Space by when they are due, with handed in ones apart", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Late sheet", course, addDays(localDay(), -4));
    await createAssignment(data.db, space, "Soon sheet", course, addDays(localDay(), 2));
    await createAssignment(data.db, space, "Someday", course);
    const handed = await createAssignment(
      data.db,
      space,
      "Handed in",
      course,
      addDays(localDay(), -10),
    );
    await updateAssignment(data.db, handed, { status: "submitted" });
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    expect(await screen.findByRole("button", { name: "Overdue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No Due Date" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByText("4d overdue")).toBeTruthy();
  });

  it("opens the statuses from its circle, as the desktop does, and sets the one picked", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    const id = await createAssignment(data.db, space, "Sheet", course, addDays(localDay(), 2));
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Status of Sheet" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "In progress" }));
    await waitFor(async () =>
      expect((await getAssignment(data.db, id))?.status).toBe("in_progress"),
    );
  });

  it("regroups by course and lays out as a board by status", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet", course, addDays(localDay(), 2));
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await choose(screen, "Grouping", "Course");
    expect((await screen.findAllByRole("button", { name: "Algorithms" })).length).toBeGreaterThan(
      0,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Board" }));
    expect(await screen.findByLabelText("Not started column")).toBeTruthy();
  });

  it("moves an assignment to another column of the board, like a drag", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    const id = await createAssignment(data.db, space, "Sheet", course, addDays(localDay(), 2));
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Board" }));
    const card = await screen.findByLabelText("Sheet, card, drag to move");
    expect(card.props.accessibilityActions.map((a: { label: string }) => a.label)).toContain(
      "Move to Submitted",
    );
    await fireEvent(card, "accessibilityAction", { nativeEvent: { actionName: "move-submitted" } });
    await waitFor(async () => expect((await getAssignment(data.db, id))?.status).toBe("submitted"));
  });
  // The desktop's other assignment filters (D73).
  it("narrows by due date and the desktop's other filters", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Late sheet", course, addDays(localDay(), -4));
    await createAssignment(data.db, space, "Someday", course);
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    expect(await screen.findByRole("button", { name: "Status of Someday" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const name of [
      "Course",
      "Status",
      "Due date",
      "Grade",
      "Evaluated at",
      "Pinned",
      "Created",
      "Updated",
    ]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${name}, `) })).toBeTruthy();
    }
    await openRow(screen, "Due date");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Overdue" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Status of Someday" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "Status of Late sheet" })).toBeTruthy();
  });

  it("orders the assignments as picked under Display, as the desktop does", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Zeta sheet", course, addDays(localDay(), 2));
    await createAssignment(data.db, space, "Alpha sheet", course, addDays(localDay(), 2));
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await choose(screen, "Ordering", "Title");
    await waitFor(async () =>
      expect(
        (await screen.findAllByRole("button", { name: /^Status of/ })).map(
          (box) => box.props.accessibilityLabel,
        ),
      ).toEqual(["Status of Alpha sheet", "Status of Zeta sheet"]),
    );
  });
});

describe("quick jot", () => {
  it("saves the text as a jot in the Space and goes back", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Home", "#22c55e");
    const screen = await renderScreens(
      { index: () => <Text>Home screen</Text>, "new/jot": () => <QuickJotScreen /> },
      data,
    );
    await act(() => router.push("/new/jot"));
    await fireEvent.changeText(
      await screen.findByLabelText("Jot something down"),
      "Call the plumber\nbefore Friday",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save Jot" }));
    await waitFor(async () => {
      const [jot] = await listUnrefinedJots(data.db, { spaceId: space });
      expect(jot.entity.title).toBe("Call the plumber");
      expect(jot.preview).toBe("Call the plumber before Friday");
      // Only what was written: a stray empty line sat above it.
      expect((await listBlocks(data.db, jot.entity.id)).map((b) => b.content)).toEqual([
        "Call the plumber",
        "before Friday",
      ]);
    });
    expect(await screen.findByText("Home screen")).toBeTruthy();
  });

  // D65: Linear's send button lights up once there is something to send.
  it("can be sent only once something is written", async () => {
    const data = testData();
    await createSpace(data.db, "Home", "#22c55e");
    const screen = await renderScreens(
      { index: () => <Text>Home screen</Text>, "new/jot": () => <QuickJotScreen /> },
      data,
    );
    await act(() => router.push("/new/jot"));
    // The Spaces have to be there before there is a place to save to.
    await screen.findByRole("button", { name: "Space, Home" });
    const send = await screen.findByRole("button", { name: "Save Jot" });
    expect(send.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByLabelText("Jot something down"), "Milk");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save Jot" }).props.accessibilityState,
      ).toMatchObject({ disabled: false }),
    );
  });
});

describe("the sidebar's settings", () => {
  it("moves and hides items, remembered on this phone", async () => {
    const data = testData();
    const screen = await renderScreens({ index: () => <SidebarSettingsScreen /> }, data);
    // Rows are dragged; no arrow buttons. A screen reader moves them with its actions.
    expect(screen.queryByRole("button", { name: "Move Tasks Up" })).toBeNull();
    const tasks = await screen.findByLabelText("Tasks, drag to reorder");
    await fireEvent(tasks, "accessibilityAction", { nativeEvent: { actionName: "moveUp" } });
    expect(readPreference("sidebar.top", topSchema, DEFAULT_TOP).order.slice(0, 3)).toEqual([
      "dashboard",
      "tasks",
      "calendar",
    ]);
    await fireEvent(screen.getByLabelText("Show Calendar"), "valueChange", false);
    expect(readPreference("sidebar.top", topSchema, DEFAULT_TOP).hidden).toEqual(["calendar"]);
  });
});
