import {
  createAssignment,
  createCalendarEntry,
  createCourse,
  createDeck,
  createPage,
  createSpace,
  createTask,
} from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { DashboardScreen } from "./DashboardScreen.tsx";
import { addDays, localDay } from "./dates.ts";

const PHONE = 390;
const home = (
  data: ReturnType<typeof testData>,
  routes: Parameters<typeof renderScreens>[0] = {},
) => renderScreens({ index: () => <DashboardScreen />, ...routes }, data, "/", { width: PHONE });

// The desktop's panels did not fit a phone. Its Home is a page of shortcuts: what is on
// now, one tap to make something, tiles counting what waits, today's tasks and the
// calendar, the deadlines coming up and every Space.
describe("the phone's Home", () => {
  it("makes a task, a jot, an entry or a bookmark in one tap", async () => {
    const screen = await home(testData(), { "new/task": () => <Text>New task form</Text> });
    for (const name of ["Quick Jot", "New Calendar Entry", "New Bookmark"]) {
      expect(await screen.findByRole("button", { name })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole("button", { name: "New Task" }));
    expect(await screen.findByText("New task form")).toBeTruthy();
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

  it("lists today's tasks to tick off and the deadlines coming up", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createTask(data.db, space, "Send report", localDay());
    await createTask(data.db, space, "Some day", null);
    const course = await createCourse(data.db, space, "Algorithms");
    await createAssignment(data.db, space, "Sheet 3", course, addDays(localDay(), 3));
    const screen = await home(data);
    expect(await screen.findByRole("header", { name: "Tasks for today" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /^Send report,/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Some day,/ })).toBeNull();
    expect(screen.getByRole("header", { name: "Coming up" })).toBeTruthy();
    expect(screen.getByText("Assignment, in 3 days")).toBeTruthy();
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

  it("opens a Space from the row of Spaces", async () => {
    const data = testData();
    await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await home(data, { "space/[id]": () => <Text>The Space</Text> });
    await fireEvent.press(await screen.findByRole("button", { name: "Uni" }));
    expect(await screen.findByText("The Space")).toBeTruthy();
  });

  it("keeps the mascot greeting the day", async () => {
    const screen = await home(testData());
    expect(await screen.findByTestId("mascot", { includeHiddenElements: true })).toBeTruthy();
  });
});
