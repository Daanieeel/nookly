import { describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { STATUSES, makeLabel, makeTask } from "#/test/fixtures.ts";
import { freezeTime, setDateTimeSettings } from "#/test/time.ts";
import {
  DEFAULT_DISPLAY,
  type DisplayOptions,
  OVERVIEW_DISPLAY,
  TASK_VIEW_PRESETS,
  dayBucket,
  daysUntil,
  describeDisplay,
  dueBucket,
  dueTone,
  filterValues,
  formatDay,
  groupTasks,
  normalizeDisplay,
  orderTasks,
  parseDay,
  passesFilters,
  readDisplay,
  readOverviewDisplay,
  sortStatuses,
  statusKind,
  toDay,
  writeDisplay,
} from "./task-model.ts";

const NOW = new Date("2026-03-11T15:30:00");
const ids = (tasks: { entity: { id: string } }[]) => tasks.map((t) => t.entity.id);

function fromDisk(json: string): Partial<DisplayOptions> {
  return JSON.parse(json);
}

describe("statusKind", () => {
  const kind = (id: string, statuses = STATUSES) =>
    statusKind(statuses.find((s) => s.id === id) ?? statuses[0], statuses);

  it("reads the default statuses like Linear", () => {
    expect(STATUSES.map((s) => kind(s.id))).toEqual([
      "backlog",
      "unstarted",
      "started",
      "completed",
      "canceled",
    ]);
  });

  it("has no backlog with a single unstarted status", () => {
    const statuses = STATUSES.filter((s) => s.id !== "backlog");
    expect(kind("todo", statuses)).toBe("unstarted");
  });

  it("calls a lone finished status completed", () => {
    const statuses = STATUSES.filter((s) => s.id !== "cancelled");
    expect(kind("done", statuses)).toBe("completed");
  });
});

describe("sortStatuses", () => {
  it("orders by position without changing the input", () => {
    const shuffled = [STATUSES[3], STATUSES[0], STATUSES[2]];
    expect(sortStatuses(shuffled).map((s) => s.id)).toEqual(["backlog", "doing", "done"]);
    expect(shuffled[0].id).toBe("done");
  });
});

describe("days", () => {
  it("reads a day as local midnight and writes it back", () => {
    const date = parseDay("2026-03-09");
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 2, 9, 0,
    ]);
    expect(toDay(date)).toBe("2026-03-09");
  });

  it("pads months and days", () => {
    expect(toDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("counts whole days from today", () => {
    expect(daysUntil("2026-03-11", NOW)).toBe(0);
    expect(daysUntil("2026-03-12", NOW)).toBe(1);
    expect(daysUntil("2026-03-01", NOW)).toBe(-10);
  });

  it.each([
    [null, "none"],
    ["2026-03-10", "overdue"],
    ["2026-03-11", "today"],
    ["2026-03-12", "week"],
    ["2026-03-18", "week"],
    ["2026-03-19", "later"],
  ])("puts %s in the %s bucket", (day, bucket) => {
    expect(dayBucket(day, NOW)).toBe(bucket);
    expect(dueBucket(day, NOW)).toBe(bucket);
  });
});

describe("formatDay", () => {
  it("leaves out this year's year", () => {
    setDateTimeSettings({ dateFormat: "american" });
    expect(formatDay("2026-09-24", NOW)).toBe("Sep 24");
  });

  it("shows another year", () => {
    setDateTimeSettings({ dateFormat: "american" });
    expect(formatDay("2025-09-24", NOW)).toBe("Sep 24, 2025");
  });

  it("puts the day first in the European format", () => {
    setDateTimeSettings({ dateFormat: "european" });
    // en-GB writes "Sep" or "Sept" depending on the ICU version.
    expect(formatDay("2026-09-24", NOW)).toMatch(/^24 Sept?$/);
  });
});

describe("dueTone", () => {
  it("flags open tasks that are overdue or due soon", () => {
    freezeTime("2026-03-11T10:00:00");
    expect(dueTone(makeTask({ dueDate: "2026-03-10" }), "started")).toBe("overdue");
    expect(dueTone(makeTask({ dueDate: "2026-03-11" }), "unstarted")).toBe("soon");
    expect(dueTone(makeTask({ dueDate: "2026-03-12" }), "unstarted")).toBe("soon");
    expect(dueTone(makeTask({ dueDate: "2026-03-13" }), "unstarted")).toBeNull();
  });

  it("never flags finished or undated tasks", () => {
    freezeTime("2026-03-11T10:00:00");
    expect(dueTone(makeTask({ dueDate: "2026-03-01" }), "completed")).toBeNull();
    expect(dueTone(makeTask({ dueDate: "2026-03-01" }), "canceled")).toBeNull();
    expect(dueTone(makeTask(), "unstarted")).toBeNull();
  });
});

describe("display options", () => {
  it("reads the defaults when nothing is saved", () => {
    expect(readDisplay()).toEqual(DEFAULT_DISPLAY);
  });

  it("reads back what was written", () => {
    const display: DisplayOptions = {
      ...DEFAULT_DISPLAY,
      layout: "list",
      grouping: "label",
      subGrouping: "status",
      ordering: "title",
      properties: ["key", "due"],
    };
    writeDisplay(display);
    expect(readDisplay()).toEqual(display);
  });

  it("falls back to the defaults for an unreadable value", () => {
    preferences.set(STORAGE_KEYS.tasksDisplay, "][");
    expect(readDisplay()).toEqual(DEFAULT_DISPLAY);
  });

  it("keeps known properties in their canonical order", () => {
    expect(normalizeDisplay(fromDisk('{"properties":["due","bogus","key"]}')).properties).toEqual([
      "key",
      "due",
    ]);
  });

  it("keeps an empty property list", () => {
    expect(normalizeDisplay({ properties: [] }).properties).toEqual([]);
  });

  it("uses the default properties when they aren't a list", () => {
    expect(normalizeDisplay(fromDisk('{"properties":"key"}')).properties).toEqual(
      DEFAULT_DISPLAY.properties,
    );
  });

  it("drops an invalid sub-grouping", () => {
    expect(normalizeDisplay({ grouping: "due", subGrouping: "due" }).subGrouping).toBe("none");
    expect(normalizeDisplay(fromDisk('{"subGrouping":"priority"}')).subGrouping).toBe("none");
  });

  it("opens the overview as a list by due date without labels", () => {
    expect(readOverviewDisplay()).toEqual(OVERVIEW_DISPLAY);
    expect(OVERVIEW_DISPLAY).toMatchObject({ layout: "list", grouping: "due" });
    expect(OVERVIEW_DISPLAY.properties).not.toContain("labels");
  });

  it("remembers the overview apart from a Space's page", () => {
    writeDisplay({ ...DEFAULT_DISPLAY, ordering: "title" });
    expect(readOverviewDisplay().ordering).toBe("due");
  });

  it("describes a display for a View card", () => {
    expect(describeDisplay(DEFAULT_DISPLAY)).toEqual({
      layout: "board",
      grouping: "Status",
      ordering: "Due date",
    });
    expect(describeDisplay({ ...DEFAULT_DISPLAY, grouping: "none" }).grouping).toBeNull();
  });

  it("builds presets that are already valid displays", () => {
    for (const preset of TASK_VIEW_PRESETS) {
      expect(normalizeDisplay(preset.display)).toEqual(preset.display);
    }
    expect(TASK_VIEW_PRESETS.map((p) => p.name)).toContain("Current");
  });
});

describe("groupTasks", () => {
  const labels = [makeLabel({ id: "l1", name: "Home" }), makeLabel({ id: "l2", name: "Work" })];
  const tasks = [
    makeTask({ statusId: "todo", labelIds: ["l1", "l2"] }, { id: "both" }),
    makeTask({ statusId: "done", labelIds: [] }, { id: "none" }),
    makeTask({ statusId: "todo", labelIds: ["l2"] }, { id: "work" }),
  ];

  it("makes one group per status, empty ones included", () => {
    const groups = groupTasks(tasks, "status", STATUSES, labels);
    expect(groups.map((g) => [g.id, ids(g.tasks)])).toEqual([
      ["backlog", []],
      ["todo", ["both", "work"]],
      ["doing", []],
      ["done", ["none"]],
      ["cancelled", []],
    ]);
    expect(groups[1].status?.name).toBe("Todo");
  });

  it("puts a task with two labels under both, and unlabelled ones last", () => {
    const groups = groupTasks(tasks, "label", STATUSES, labels);
    expect(groups.map((g) => [g.id, ids(g.tasks)])).toEqual([
      ["l1", ["both"]],
      ["l2", ["both", "work"]],
      ["no-label", ["none"]],
    ]);
  });

  it("keeps one group without a grouping", () => {
    const groups = groupTasks(tasks, "none", STATUSES, labels);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(3);
  });

  it("buckets by due and start date", () => {
    freezeTime("2026-03-11T10:00:00");
    const dated = [
      makeTask({ dueDate: "2026-03-01", startDate: "2026-03-11" }, { id: "late" }),
      makeTask({}, { id: "undated" }),
    ];
    const due = groupTasks(dated, "due", STATUSES, labels);
    expect(due.find((g) => g.id === "overdue")?.tasks.map((t) => t.entity.id)).toEqual(["late"]);
    expect(due.find((g) => g.id === "none")?.tasks.map((t) => t.entity.id)).toEqual(["undated"]);
    const start = groupTasks(dated, "start", STATUSES, labels);
    expect(start.find((g) => g.id === "today")?.name).toBe("Starts today");
    expect(start.find((g) => g.id === "today")?.tasks.map((t) => t.entity.id)).toEqual(["late"]);
  });

  it("buckets by when tasks were created", () => {
    freezeTime("2026-03-11T10:00:00");
    const aged = [
      makeTask({}, { id: "new", createdAt: "2026-03-11T08:00:00Z" }),
      makeTask({}, { id: "old", createdAt: "2025-01-01T08:00:00Z" }),
    ];
    const groups = groupTasks(aged, "created", STATUSES, labels);
    expect(groups.map((g) => [g.id, ids(g.tasks)])).toEqual([
      ["today", ["new"]],
      ["week", []],
      ["last", []],
      ["earlier", ["old"]],
    ]);
  });
});

describe("orderTasks", () => {
  const a = makeTask(
    { dueDate: "2026-03-20", startDate: null, statusId: "done" },
    {
      id: "a",
      title: "banana",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-05T00:00:00Z",
    },
  );
  const b = makeTask(
    { dueDate: null, startDate: "2026-03-01", statusId: "todo" },
    {
      id: "b",
      title: "Apple",
      createdAt: "2026-01-03T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    },
  );
  const c = makeTask(
    { dueDate: "2026-03-20", startDate: "2026-03-05", statusId: "backlog" },
    { id: "c", title: "", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-09T00:00:00Z" },
  );
  const tasks = [a, b, c];

  it("orders by due date, undated last, newest first on a tie", () => {
    expect(ids(orderTasks(tasks, "due", STATUSES))).toEqual(["c", "a", "b"]);
  });

  it("orders by start date, undated last", () => {
    expect(ids(orderTasks(tasks, "start", STATUSES))).toEqual(["b", "c", "a"]);
  });

  it("orders by created and updated, newest first", () => {
    expect(ids(orderTasks(tasks, "created", STATUSES))).toEqual(["b", "c", "a"]);
    expect(ids(orderTasks(tasks, "updated", STATUSES))).toEqual(["c", "a", "b"]);
  });

  it("orders by title ignoring case, with untitled tasks by their placeholder", () => {
    expect(ids(orderTasks(tasks, "title", STATUSES))).toEqual(["b", "a", "c"]);
  });

  it("orders by status position", () => {
    expect(ids(orderTasks(tasks, "status", STATUSES))).toEqual(["c", "b", "a"]);
  });

  it("never reorders the input", () => {
    orderTasks(tasks, "title", STATUSES);
    expect(ids(tasks)).toEqual(["a", "b", "c"]);
  });
});

describe("filters", () => {
  it("reads a task's value per filter field", () => {
    freezeTime("2026-03-11T10:00:00");
    const task = makeTask(
      {
        statusId: "done",
        labelIds: ["l1", "l2"],
        dueDate: "2026-03-11",
        startDate: null,
        completedAt: "2026-03-11T09:00:00Z",
        effort: 3,
        courseIds: ["c1"],
        semesterIds: ["sem1"],
      },
      { spaceId: "s9", createdAt: "2020-01-01T00:00:00Z", updatedAt: "2026-03-11T09:00:00Z" },
    );
    expect(filterValues(task, "status")).toEqual(["done"]);
    expect(filterValues(task, "space")).toEqual(["s9"]);
    expect(filterValues(task, "labels")).toEqual(["l1", "l2"]);
    expect(filterValues(task, "due")).toEqual(["today"]);
    expect(filterValues(task, "start")).toEqual(["none"]);
    expect(filterValues(task, "created")).toEqual(["earlier"]);
    expect(filterValues(task, "updated")).toEqual(["today"]);
    expect(filterValues(task, "completed")).toEqual(["today"]);
    expect(filterValues(task, "course")).toEqual(["c1"]);
    expect(filterValues(task, "semester")).toEqual(["sem1"]);
    expect(filterValues(task, "effort")).toEqual(["3"]);
    expect(filterValues(task, "unknown")).toEqual([]);
  });

  it("reads open and unestimated tasks as none", () => {
    expect(filterValues(makeTask(), "completed")).toEqual(["none"]);
    expect(filterValues(makeTask(), "effort")).toEqual(["none"]);
  });

  it("keeps a task matching any value of an is filter", () => {
    const task = makeTask({ statusId: "todo" });
    expect(
      passesFilters(task, [{ fieldId: "status", operator: "is", values: ["todo", "done"] }]),
    ).toBe(true);
    expect(passesFilters(task, [{ fieldId: "status", operator: "is", values: ["done"] }])).toBe(
      false,
    );
  });

  it("drops a task matching any value of an is not filter", () => {
    const task = makeTask({ labelIds: ["l1", "l2"] });
    expect(passesFilters(task, [{ fieldId: "labels", operator: "isNot", values: ["l2"] }])).toBe(
      false,
    );
    expect(passesFilters(task, [{ fieldId: "labels", operator: "isNot", values: ["l3"] }])).toBe(
      true,
    );
  });

  it("needs every filter to pass", () => {
    const task = makeTask({ statusId: "todo", effort: 5 });
    expect(
      passesFilters(task, [
        { fieldId: "status", operator: "is", values: ["todo"] },
        { fieldId: "effort", operator: "is", values: ["8"] },
      ]),
    ).toBe(false);
  });

  it("keeps every task without filters", () => {
    expect(passesFilters(makeTask(), [])).toBe(true);
  });
});
