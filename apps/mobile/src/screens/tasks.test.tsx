import {
  createLabel,
  createPage,
  createSpace,
  createTask,
  entityLabels,
  listTasks,
  relatedItems,
  setTaskDates,
  setTaskStatus,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { addDays, localDay } from "./dates.ts";
import { NewTaskScreen } from "./NewScreens.tsx";
import { TasksScreen } from "./TasksScreen.tsx";

async function seeded() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#3b82f6");
  const late = await createTask(data.db, space, "Overdue report", addDays(localDay(), -3));
  const soon = await createTask(data.db, space, "Call Ana", addDays(localDay(), 1));
  const done = await createTask(data.db, space, "Old chore");
  await setTaskDates(data.db, done, null, addDays(localDay(), -9));
  await setTaskStatus(data.db, done, "done");
  await setTaskStatus(data.db, soon, "todo");
  return { data, space, late, soon, done };
}

describe("the tasks list", () => {
  it("groups by status at first, in status order", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    expect(await screen.findByText("Backlog · 1")).toBeTruthy();
    expect(screen.getByText("Todo · 1")).toBeTruthy();
    expect(screen.getByText("Done · 1")).toBeTruthy();
  });

  it("regroups by due date, keeping finished work out of overdue", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    // Group by comes before Order by, and both offer the due date.
    await fireEvent.press(screen.getAllByRole("radio", { name: "Due date" })[0]);
    expect(await screen.findByText("Overdue · 1")).toBeTruthy();
    expect(screen.getByText("Next 7 days · 1")).toBeTruthy();
    expect(screen.getByText("Done · 1")).toBeTruthy();
  });

  it("narrows to a status, and says when nothing matches", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Todo" }));
    expect(await screen.findByText("Todo · 1")).toBeTruthy();
    expect(screen.queryByText("Backlog · 1")).toBeNull();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Show finished" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Todo" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Done" }));
    expect(await screen.findByText("Nothing matches these filters.")).toBeTruthy();
  });

  it("lays the groups out as board columns", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Board" }));
    expect(await screen.findByLabelText("Todo column")).toBeTruthy();
    expect(screen.getByLabelText("Backlog column")).toBeTruthy();
  });
});

describe("a new task", () => {
  it("starts in the status chosen, with labels of its Space and a link to an item found by search", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const label = await createLabel(data.db, space, "Urgent");
    const page = await createPage(data.db, space, "note", "Meeting notes");
    const screen = await renderScreens({ index: () => <NewTaskScreen spaceId={space} /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Title"), "Prepare agenda");
    await fireEvent.press(await screen.findByRole("radio", { name: "In Progress" }));
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Urgent" }));
    await fireEvent.changeText(screen.getByLabelText("Link to"), "Meeting");
    await fireEvent.press(await screen.findByRole("radio", { name: "Meeting notes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));
    await waitFor(async () => {
      const [task] = await listTasks(data.db, space);
      expect(task).toMatchObject({ statusId: "in_progress" });
      expect(task.entity.title).toBe("Prepare agenda");
      expect((await entityLabels(data.db, task.entity.id)).map((l) => l.id)).toEqual([label]);
      expect((await relatedItems(data.db, task.entity.id)).map((r) => r.entity.id)).toEqual([page]);
    });
  });
});
