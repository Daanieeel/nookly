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
  getTask,
  listBlocks,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { choose, openRow } from "../test/sheet.ts";
import { labelSummary } from "./ComposeForm.tsx";
import { addDays, localDay } from "./dates.ts";
import { EntityScreen } from "./EntityScreen.tsx";
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

  it("shows tasks on the board as cards, moved to another column like a drag", async () => {
    const { data, space, soon } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Display" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Board" }));
    const card = await screen.findByLabelText("Call Ana, card, drag to move");
    await fireEvent(card, "accessibilityAction", { nativeEvent: { actionName: "move-done" } });
    await waitFor(async () => expect((await getTask(data.db, soon))?.statusId).toBe("done"));
  });
});

describe("a new task", () => {
  // D65: made in Linear's compose sheet, the properties as pills along the bottom.
  it("starts in the status chosen, with labels of its Space, a link to an item found by search and a description", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const label = await createLabel(data.db, space, "Urgent");
    const page = await createPage(data.db, space, "note", "Meeting notes");
    const screen = await renderScreens({ index: () => <NewTaskScreen spaceId={space} /> }, data);
    await fireEvent.changeText(await screen.findByLabelText("Task title"), "Prepare agenda");
    await fireEvent.changeText(screen.getByLabelText("Description…"), "Three points");
    await choose(screen, "Status", "In Progress");
    await openRow(screen, "Labels");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Urgent" }));
    await openRow(screen, "Link to");
    await fireEvent.changeText(await screen.findByLabelText("Search Items"), "Meeting");
    await fireEvent.press(await screen.findByRole("radio", { name: "Meeting notes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Create Task" }));
    await waitFor(async () => {
      const [task] = await listTasks(data.db, space);
      expect(task).toMatchObject({ statusId: "in_progress" });
      expect(task.entity.title).toBe("Prepare agenda");
      expect((await entityLabels(data.db, task.entity.id)).map((l) => l.id)).toEqual([label]);
      expect((await relatedItems(data.db, task.entity.id)).map((r) => r.entity.id)).toEqual([page]);
      expect((await listBlocks(data.db, task.entity.id)).map((b) => b.content)).toEqual([
        "Three points",
      ]);
    });
  });

  it("shows picked labels as their names, two then how many more", () => {
    expect(labelSummary([])).toBeNull();
    expect(labelSummary(["Urgent", "Home"])).toBe("Urgent  Home");
    expect(labelSummary(["Urgent", "Home", "Work", "Later"])).toBe("Urgent  Home  +2");
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
    await fireEvent.press(await screen.findByRole("tab", { name: "All" }));
    expect((await screen.findAllByRole("button", { name: "Backlog" })).length).toBeGreaterThan(0);
    await fireEvent.press(await screen.findByRole("tab", { name: "Todo only" }));
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
    await fireEvent.press(await screen.findByRole("tab", { name: "Overdue board" }));
    expect(await screen.findByText(/also uses due/)).toBeTruthy();
    expect(await screen.findByLabelText("Backlog column")).toBeTruthy();
  });
});

describe("a task's status circle", () => {
  it("opens the statuses to pick from, as the desktop's row does", async () => {
    const { data, space, late } = await seeded();
    const screen = await renderScreens({ index: () => <TasksScreen spaceId={space} /> }, data);
    const circles = await screen.findAllByRole("button", { name: "Status of Overdue report" });
    // The list draws a row twice while it settles; the last is the one on screen.
    const circle = circles[circles.length - 1];
    await fireEvent.press(circle);
    await fireEvent.press(await screen.findByRole("radio", { name: "Done" }));
    await waitFor(async () => expect((await getTask(data.db, late))?.statusId).toBe("done"));
  });
});

describe("a task's repeat", () => {
  // The desktop's choices: daily, weekly, monthly, every few days, or not at all.
  it("repeats every few days, as on the desktop", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Home", "#3b82f6");
    const id = await createTask(data.db, space, "Water the plants", null);
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={id} /> },
      data,
      `/entity/${id}`,
    );
    await openRow(screen, "Repeat");
    expect(await screen.findByRole("radio", { name: "Does not repeat" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Increase Days" }));
    await fireEvent.press(screen.getByRole("button", { name: "Repeat every 3 days" }));
    await waitFor(async () =>
      expect((await getTask(data.db, id))?.repeat).toEqual({ every: 3, unit: "day" }),
    );
    // At a glance and in the details.
    expect(
      (await screen.findAllByRole("button", { name: "Repeat, Every 3 days" })).length,
    ).toBeGreaterThan(0);
  });
});
