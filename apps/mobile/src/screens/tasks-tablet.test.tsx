import { createAssignment, createCourse, createSpace, createTask } from "@nookly/shared/data";
import { AssignmentsScreen } from "./AssignmentsScreen.tsx";
import { addDays, localDay } from "./dates.ts";
import { fireEvent } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { TasksScreen } from "./TasksScreen.tsx";

// The tablet's Tasks overview is the desktop's (4.3): each group under a header with its
// count that folds it away.
describe("Tasks on a tablet", () => {
  it("heads each group with its count and folds it on a tap", async () => {
    const data = testData();
    const work = await createSpace(data.db, "Work", "#3b82f6");
    await createTask(data.db, work, "Write report");
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data, "/", {
      width: 1032,
    });
    const header = await screen.findByRole("button", { name: "No due date, 1" });
    expect(header.props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByRole("button", { name: /^Write report/ })).toBeTruthy();
    await fireEvent.press(header);
    expect(screen.queryByRole("button", { name: /^Write report/ })).toBeNull();
  });
});

describe("Assignments on a tablet", () => {
  it("heads each group with its count and folds it on a tap (4.4)", async () => {
    const data = testData();
    const uni = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, uni, "Algorithms");
    await createAssignment(data.db, uni, "Sheet 1", course, addDays(localDay(), 30));
    const screen = await renderScreens({ index: () => <AssignmentsScreen /> }, data, "/", {
      width: 1032,
    });
    const header = await screen.findByRole("button", { name: "Later, 1" });
    await fireEvent.press(header);
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
  });
});
