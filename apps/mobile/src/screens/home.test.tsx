import {
  createAssignment,
  createCalendarEntry,
  createCourse,
  createDeck,
  createPage,
  createSpace,
  createTask,
} from "@nookly/shared/data";
import { fireEvent, within } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { DashboardHeaderTitle } from "./DashboardBriefing.tsx";
import { DashboardScreen } from "./DashboardScreen.tsx";
import { addDays, localDay } from "./dates.ts";

const PHONE = 390;
const home = (
  data: ReturnType<typeof testData>,
  routes: Parameters<typeof renderScreens>[0] = {},
) => renderScreens({ index: () => <DashboardScreen />, ...routes }, data, "/", { width: PHONE });

// The phone's Home: what is on now, tiles counting what waits, the calendar and the
// deadlines coming up, then the desktop's tabbed lists of tasks, assignments, cards and jots.
describe("the phone's Home", () => {
  it("has no row of things to create", async () => {
    const screen = await home(testData());
    expect(await screen.findByRole("header", { name: "At a glance" })).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Create" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New Task" })).toBeNull();
  });

  it("counts what waits, each tile opening its list", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createTask(data.db, space, "Send report", localDay());
    await createTask(data.db, space, "Pay rent", addDays(localDay(), -2));
    await createPage(data.db, space, "jot", "Idea for the app");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet 3", course, addDays(localDay(), 3));
    const screen = await home(data, { tasks: () => <Text>All tasks</Text> });
    expect(await screen.findByRole("button", { name: "Tasks, 2, 1 overdue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jots, 1, To be refined" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Assignments, 1/ })).toBeTruthy();
    // No decks yet, so no tile for them.
    expect(screen.queryByRole("button", { name: /^Cards,/ })).toBeNull();
    // Three tiles would leave a hole: the calendar's fills it.
    expect(screen.getByRole("button", { name: "Calendar, 0, Nothing today" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Tasks, 2, 1 overdue" }));
    expect(await screen.findByText("All tasks")).toBeTruthy();
  });

  it("counts the cards to learn once there are decks", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createDeck(data.db, space, "Graph terms");
    const screen = await home(data);
    expect(await screen.findByRole("button", { name: /^Cards, 0, All caught up/ })).toBeTruthy();
    // Tasks, Cards and Jots, and the calendar's to make four.
    expect(screen.getByRole("button", { name: /^Calendar,/ })).toBeTruthy();
  });

  it("orders its sections from a glance down to the jots", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet 3", course, addDays(localDay(), 3));
    const screen = await home(data);
    await screen.findByText("Assignment, in 3 days");
    const order = ["At a glance", "Today", "Coming up", "Tasks", "Assignments", "Cards", "Jots"];
    const headers = screen
      .getAllByRole("header")
      .map((h) => h.props.accessibilityLabel)
      .filter((name) => order.includes(name));
    expect(headers).toEqual(order);
  });

  it("lists tasks under the desktop's tabs", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createTask(data.db, space, "Send report", localDay());
    await createTask(data.db, space, "Some day", null);
    const screen = await home(data);
    expect(await screen.findByRole("button", { name: "Send report" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Some day" })).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "No date 1" }));
    expect(await screen.findByRole("button", { name: "Some day" })).toBeTruthy();
    for (const tabs of ["Tasks tabs", "Assignments tabs", "Cards tabs", "Jots tabs"]) {
      expect(screen.getByLabelText(tabs)).toBeTruthy();
    }
  });

  it("leads with what is on the calendar now", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Home", "#3b82f6");
    await createCalendarEntry(data.db, space, {
      title: "All day long",
      date: localDay(),
      startTime: "00:00",
      endTime: "23:59",
      allDay: false,
      location: "Main Street",
    });
    const screen = await home(data);
    expect(
      await screen.findByRole("button", { name: /^Now: All day long, 00:00 to 23:59/ }),
    ).toBeTruthy();
  });

  it("keeps the mascot greeting the day, inside the sentence about it", async () => {
    const screen = await home(testData());
    const briefing = await screen.findByTestId("briefing");
    expect(within(briefing).getByTestId("mascot", { includeHiddenElements: true })).toBeTruthy();
  });

  it("says the date and that it is online in the page header, not Dashboard", async () => {
    const data = testData();
    data.sync.store.setState((state) => ({ status: { ...state.status, state: "idle" } }));
    const screen = await renderScreens({ index: () => <DashboardHeaderTitle /> }, data);
    const date = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    expect(await screen.findByText(date)).toBeTruthy();
    expect(screen.getByLabelText("Online")).toBeTruthy();
    expect(screen.queryByText("Offline")).toBeNull();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("says Offline in the page header while offline", async () => {
    const data = testData();
    data.sync.store.setState((state) => ({ status: { ...state.status, state: "offline" } }));
    const screen = await renderScreens({ index: () => <DashboardHeaderTitle /> }, data);
    expect(await screen.findByText("Offline")).toBeTruthy();
    expect(screen.queryByLabelText("Online")).toBeNull();
  });
});
