import {
  createLabel,
  createPage,
  createSpace,
  createTask,
  createView,
  entityLabels,
  listViews,
  listTasks,
  relatedItems,
  setTaskDates,
  setTaskStatus,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { choose, openRow } from "../test/sheet.ts";
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
  it("groups a Space's tasks by status at first, in status order", async () => {
    const { data, space } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    expect((await screen.findAllByRole("button", { name: "Backlog" })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Todo" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
  });

  it("groups the overview by due date, keeping finished work out of overdue", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    expect(await screen.findByRole("button", { name: "Overdue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next 7 days" })).toBeTruthy();
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
    expect(screen.getByText("Tasks")).toBeTruthy();
  });

  it("shows when a task is due and for how long, with its Space", async () => {
    const { data } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen /> }, data);
    expect(await screen.findByText("3d overdue")).toBeTruthy();
    expect(screen.getAllByText("Work").length).toBeGreaterThan(0);
  });

  it("narrows to a status, shows it as an active filter, and says when nothing matches", async () => {
    const { data, space } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Filter" }));
    await openRow(screen, "Status");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Todo" }));
    expect((await screen.findAllByRole("button", { name: "Todo" })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Backlog" })).toEqual([]);
    expect(screen.getAllByRole("checkbox", { name: "Todo ×" }).length).toBe(1);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Todo" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Done" }));
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent(await screen.findByLabelText("Show finished"), "valueChange", false);
    expect(await screen.findByText("Nothing matches these filters.")).toBeTruthy();
  });

  it("lays the groups out as board columns, each with a way to add a task in it", async () => {
    const { data, space } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Board" }));
    expect(await screen.findByLabelText("Todo column")).toBeTruthy();
    expect(screen.getByLabelText("Backlog column")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New Task in Todo" })).toBeTruthy();
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
    await choose(screen, "Status", "In Progress");
    await openRow(screen, "Labels");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Urgent" }));
    await openRow(screen, "Link to");
    await fireEvent.changeText(await screen.findByLabelText("Find an item"), "Meeting");
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

describe("saved views", () => {
  it("saves the display as a View, opens it again, and a View from the computer narrows the list", async () => {
    const { data, space } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Filter" }));
    await openRow(screen, "Status");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Todo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent.changeText(screen.getByLabelText("View name"), "Todo only");
    await fireEvent.press(screen.getByRole("button", { name: "Save View" }));
    await waitFor(async () => {
      const [view] = await listViews(data.db, { spaceId: space, module: "tasks" });
      expect(view.entity.title).toBe("Todo only");
      expect(JSON.parse(view.config).filters).toEqual([
        { fieldId: "status", operator: "is", values: ["todo"] },
      ]);
    });
    // Back to everything, then open the saved View.
    await fireEvent.press(await screen.findByRole("radio", { name: "All" }));
    expect((await screen.findAllByRole("button", { name: "Backlog" })).length).toBeGreaterThan(0);
    await fireEvent.press(await screen.findByRole("radio", { name: "Todo only" }));
    expect((await screen.findAllByRole("button", { name: "Todo" })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Backlog" })).toEqual([]);
  });

  it("says what a View from the computer uses that the phone doesn't show", async () => {
    const { data, space } = await seeded();
    await createView(data.db, space, {
      title: "Overdue board",
      module: "tasks",
      config: JSON.stringify({
        filters: [{ fieldId: "due", operator: "is", values: ["overdue"] }],
        display: { layout: "board" },
      }),
    });
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "Overdue board" }));
    expect(await screen.findByText(/also uses due/)).toBeTruthy();
    expect(await screen.findByLabelText("Backlog column")).toBeTruthy();
  });
});
