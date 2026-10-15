import type { TaskRecord, TaskStatus } from "@nookly/shared/data";
import {
  DEFAULT_DISPLAY,
  displayFromView,
  dueBucket,
  filterTasks,
  groupTasks,
  orderTasks,
  viewConfigFromDisplay,
  type TaskDisplay,
} from "./task-view.ts";

const statuses: TaskStatus[] = [
  { id: "backlog", name: "Backlog", color: "#000", doneness: 0, position: 0 },
  { id: "todo", name: "Todo", color: "#000", doneness: 0, position: 1 },
  { id: "doing", name: "In Progress", color: "#000", doneness: 50, position: 2 },
  { id: "done", name: "Done", color: "#000", doneness: 100, position: 3 },
];

let n = 0;
const task = (
  patch: Partial<TaskRecord> & { title?: string; space?: string; created?: string },
): TaskRecord => ({
  entity: {
    id: `t${++n}`,
    spaceId: patch.space ?? "s1",
    type: "task",
    title: patch.title ?? `Task ${n}`,
    icon: null,
    pinned: false,
    createdAt: patch.created ?? `2026-10-0${n % 9}T00:00:00Z`,
    updatedAt: "",
    deletedAt: null,
    key: `TSK-${n}`,
    lastOpenedAt: null,
  },
  statusId: "backlog",
  startDate: null,
  dueDate: null,
  completedAt: null,
  effort: null,
  repeat: null,
  ...patch,
});

const labels = [
  { id: "l1", spaceId: "s1", name: "Urgent", color: "#f00" },
  { id: "l2", spaceId: "s1", name: "Later", color: "#0f0" },
];
const ctx = (labelMap: Record<string, string[]> = {}) => ({
  statuses,
  labels,
  labelIdsOf: (id: string) => labelMap[id] ?? [],
  spaces: [
    { id: "s1", name: "Work" },
    { id: "s2", name: "Home" },
  ],
  today: "2026-10-15",
});
const display = (patch: Partial<TaskDisplay>): TaskDisplay => ({ ...DEFAULT_DISPLAY, ...patch });

describe("which due bucket a date is in", () => {
  it("counts from today and keeps finished work out of overdue", () => {
    expect(dueBucket("2026-10-14", false, "2026-10-15")).toBe("overdue");
    expect(dueBucket("2026-10-14", true, "2026-10-15")).toBe("done");
    expect(dueBucket("2026-10-15", false, "2026-10-15")).toBe("today");
    expect(dueBucket("2026-10-22", false, "2026-10-15")).toBe("week");
    expect(dueBucket("2026-10-23", false, "2026-10-15")).toBe("later");
    expect(dueBucket(null, false, "2026-10-15")).toBe("none");
    expect(dueBucket(null, true, "2026-10-15")).toBe("done");
  });
});

describe("ordering", () => {
  it("puts the soonest due first and undated last, keeping the order of equal ones", () => {
    const a = task({ title: "a", dueDate: "2026-10-20" });
    const b = task({ title: "b" });
    const c = task({ title: "c", dueDate: "2026-10-16" });
    const d = task({ title: "d", dueDate: "2026-10-16" });
    expect(orderTasks([a, b, c, d], "due", statuses).map((t) => t.entity.title)).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
    expect(orderTasks([a, b, c, d], "title", statuses).map((t) => t.entity.title)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("orders by status the way the board does, finished last", () => {
    const done = task({ title: "done", statusId: "done" });
    const doing = task({ title: "doing", statusId: "doing" });
    const backlog = task({ title: "backlog" });
    expect(
      orderTasks([done, doing, backlog], "status", statuses).map((t) => t.entity.title),
    ).toEqual(["backlog", "doing", "done"]);
  });
});

describe("filtering", () => {
  it("narrows to statuses or labels, and hides finished work on request", () => {
    const a = task({ statusId: "todo" });
    const b = task({ statusId: "done" });
    const c = task({ statusId: "doing" });
    const map = { [a.entity.id]: ["l1"], [c.entity.id]: ["l2"] };
    expect(filterTasks([a, b, c], display({ statuses: ["todo", "doing"] }), ctx(map))).toEqual([
      a,
      c,
    ]);
    expect(filterTasks([a, b, c], display({ labels: ["l2"] }), ctx(map))).toEqual([c]);
    expect(filterTasks([a, b, c], display({ showFinished: false }), ctx(map))).toEqual([a, c]);
  });
});

describe("grouping", () => {
  it("groups by status in status order, leaving empty ones out", () => {
    const a = task({ statusId: "done" });
    const b = task({ statusId: "todo" });
    const groups = groupTasks([a, b], display({ grouping: "status" }), ctx());
    expect(groups.map((g) => [g.title, g.tasks.length])).toEqual([
      ["Todo", 1],
      ["Done", 1],
    ]);
  });

  it("groups by due date, by space, by label with the unlabelled ones last, or not at all", () => {
    const overdue = task({ dueDate: "2026-10-01", space: "s2" });
    const today = task({ dueDate: "2026-10-15" });
    const none = task({});
    const map = { [overdue.entity.id]: ["l1", "l2"] };
    expect(
      groupTasks([overdue, today, none], display({ grouping: "due" }), ctx()).map((g) => g.title),
    ).toEqual(["Overdue", "Due today", "No due date"]);
    expect(
      groupTasks([overdue, today, none], display({ grouping: "space" }), ctx()).map((g) => [
        g.title,
        g.tasks.length,
      ]),
    ).toEqual([
      ["Work", 2],
      ["Home", 1],
    ]);
    const byLabel = groupTasks([overdue, today, none], display({ grouping: "label" }), ctx(map));
    expect(byLabel.map((g) => [g.title, g.tasks.length])).toEqual([
      ["Urgent", 1],
      ["Later", 1],
      ["No label", 2],
    ]);
    expect(groupTasks([overdue, today], display({ grouping: "none" }), ctx())).toHaveLength(1);
    expect(groupTasks([], display({ grouping: "none" }), ctx())).toEqual([]);
  });
});

describe("saved views", () => {
  const all = { statusIds: ["backlog", "todo", "doing", "done"], labelIds: ["l1", "l2"] };

  it("reads a View saved on the computer as far as the phone can show it", () => {
    const raw = JSON.stringify({
      filters: [
        { fieldId: "status", operator: "isNot", values: ["done"] },
        { fieldId: "label", operator: "is", values: ["l2"] },
        { fieldId: "due", operator: "is", values: ["overdue"] },
      ],
      display: {
        layout: "board",
        grouping: "start",
        ordering: "title",
        showEmpty: { board: true },
      },
    });
    const { display, ignored } = displayFromView(raw, all);
    expect(display).toMatchObject({
      layout: "board",
      statuses: ["backlog", "todo", "doing"],
      labels: ["l2"],
      grouping: "status",
      ordering: "title",
    });
    expect(ignored).toEqual(["due", "grouping by start"]);
  });

  it("opens an unreadable or empty View as the defaults", () => {
    expect(displayFromView("nope", all)).toEqual({ display: DEFAULT_DISPLAY, ignored: [] });
    expect(displayFromView("{}", all).display).toEqual(DEFAULT_DISPLAY);
    expect(displayFromView('{"filters":"x","display":3}', all).display).toEqual(DEFAULT_DISPLAY);
  });

  it("writes what the phone shows in the form the desktop reads, and reads it back", () => {
    const display = {
      ...DEFAULT_DISPLAY,
      layout: "board" as const,
      grouping: "due" as const,
      statuses: ["todo"],
      labels: ["l1"],
    };
    const config = JSON.parse(viewConfigFromDisplay(display));
    expect(config.filters).toEqual([
      { fieldId: "status", operator: "is", values: ["todo"] },
      { fieldId: "label", operator: "is", values: ["l1"] },
    ]);
    expect(config.display).toEqual({ layout: "board", grouping: "due", ordering: "due" });
    expect(displayFromView(viewConfigFromDisplay(display), all).display).toMatchObject(display);
  });
});
