import { describe, expect, it } from "vitest";
import type { Assignment, Task, TaskStatus } from "#/lib/api/types.ts";
import {
  assignmentFilters,
  assignmentsFor,
  overviewFilters,
  taskFilters,
  tasksFor,
} from "./dashboard-model";

const TODAY = "2026-10-12";

/// The model only reads `id`, `createdAt` and `deletedAt` of an entity.
function entity(id: string, createdAt = "2026-09-01T00:00:00Z"): Task["entity"] {
  // SAFETY: the fields the model never reads are left out on purpose.
  return { id, createdAt } as Task["entity"];
}

function assignment(id: string, over: Partial<Assignment> = {}): Assignment {
  return {
    entity: entity(id),
    dueDate: null,
    dueSessionOffsetDays: null,
    dueSessionId: null,
    weight: null,
    status: "not_started",
    grade: null,
    ungraded: false,
    ...over,
  };
}

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    entity: entity(id),
    statusId: "todo",
    startDate: null,
    dueDate: null,
    labelIds: [],
    completedAt: null,
    effort: null,
    repeat: null,
    courseIds: [],
    semesterIds: [],
    ...over,
  };
}

const ids = (items: { entity: { id: string } }[]) => items.map((i) => i.entity.id);

describe("assignmentsFor", () => {
  it("For today holds only those tied to a session that is today, handed in or not", () => {
    const list = [
      // Due the day before a session that is today, so it is overdue as well.
      assignment("session", { dueDate: "2026-10-11", dueSessionOffsetDays: 1 }),
      assignment("graded", { dueDate: "2026-10-12", dueSessionOffsetDays: 0, status: "graded" }),
      assignment("submitted", {
        dueDate: "2026-10-10",
        dueSessionOffsetDays: 2,
        status: "submitted",
      }),
      assignment("overdue", { dueDate: "2026-10-08" }),
      assignment("today", { dueDate: TODAY }),
      assignment("later", { dueDate: "2026-10-20" }),
      // Follows a session that is not today.
      assignment("tomorrow", { dueDate: "2026-10-12", dueSessionOffsetDays: 1 }),
      assignment("none"),
    ];
    expect(ids(assignmentsFor("today", list, TODAY)).toSorted()).toEqual([
      "graded",
      "session",
      "submitted",
    ]);
  });

  it("leaves out handed in assignments from the other tabs", () => {
    const list = [
      assignment("done", { dueDate: TODAY, status: "submitted" }),
      assignment("graded", { dueDate: TODAY, status: "graded" }),
      assignment("open", { dueDate: TODAY }),
    ];
    expect(ids(assignmentsFor("dueToday", list, TODAY))).toEqual(["open"]);
  });

  it("Due today holds only today", () => {
    const list = [
      assignment("overdue", { dueDate: "2026-10-08" }),
      assignment("today", { dueDate: TODAY }),
      assignment("tomorrow", { dueDate: "2026-10-13" }),
    ];
    expect(ids(assignmentsFor("dueToday", list, TODAY))).toEqual(["today"]);
  });

  it("Next 7 days runs from tomorrow to a week out, soonest first", () => {
    const list = [
      assignment("c", { dueDate: "2026-10-19" }),
      assignment("a", { dueDate: "2026-10-13" }),
      assignment("far", { dueDate: "2026-10-20" }),
      assignment("today", { dueDate: TODAY }),
    ];
    expect(ids(assignmentsFor("week", list, TODAY))).toEqual(["a", "c"]);
  });
});

describe("tasksFor", () => {
  const statuses: TaskStatus[] = [
    { id: "backlog", name: "Backlog", color: "#000", doneness: 0, position: 0 },
    { id: "todo", name: "Todo", color: "#000", doneness: 0, position: 1 },
    { id: "doing", name: "Doing", color: "#000", doneness: 50, position: 2 },
    { id: "done", name: "Done", color: "#000", doneness: 100, position: 3 },
    { id: "cancelled", name: "Cancelled", color: "#000", doneness: 100, position: 4 },
  ];

  it("Today holds open overdue and due today tasks, soonest first", () => {
    const list = [
      task("today", { dueDate: TODAY }),
      task("overdue", { dueDate: "2026-10-01" }),
      task("done", { dueDate: TODAY, statusId: "done" }),
      task("cancelled", { dueDate: TODAY, statusId: "cancelled" }),
      task("tomorrow", { dueDate: "2026-10-13" }),
    ];
    expect(ids(tasksFor("today", list, statuses, TODAY))).toEqual(["overdue", "today"]);
  });

  it("In progress holds started tasks, dated ones first", () => {
    const list = [
      task("undated", { statusId: "doing" }),
      task("dated", { statusId: "doing", dueDate: "2026-11-01" }),
      task("todo", { dueDate: TODAY }),
    ];
    expect(ids(tasksFor("inProgress", list, statuses, TODAY))).toEqual(["dated", "undated"]);
  });

  it("Upcoming holds open tasks due in the next 7 days", () => {
    const list = [
      task("b", { dueDate: "2026-10-18" }),
      task("a", { dueDate: "2026-10-13" }),
      task("far", { dueDate: "2026-10-30" }),
      task("today", { dueDate: TODAY }),
    ];
    expect(ids(tasksFor("upcoming", list, statuses, TODAY))).toEqual(["a", "b"]);
  });

  it("No date holds open tasks without a due date, oldest first", () => {
    const list = [
      task("new", { entity: entity("new", "2026-10-01T00:00:00Z") }),
      task("old"),
      task("dated", { dueDate: TODAY }),
      task("done", { statusId: "done" }),
    ];
    expect(ids(tasksFor("noDate", list, statuses, TODAY))).toEqual(["old", "new"]);
  });
});

describe("Show more filters", () => {
  const statuses: TaskStatus[] = [
    { id: "todo", name: "Todo", color: "#000", doneness: 0, position: 0 },
    { id: "doing", name: "Doing", color: "#000", doneness: 50, position: 1 },
    { id: "done", name: "Done", color: "#000", doneness: 100, position: 2 },
    { id: "cancelled", name: "Cancelled", color: "#000", doneness: 100, position: 3 },
  ];
  const open = { fieldId: "status", operator: "is", values: ["todo", "doing"] };

  it("tasks open the list narrowed like their tab", () => {
    expect(taskFilters("today", statuses)).toEqual([
      open,
      { fieldId: "due", operator: "is", values: ["overdue", "today"] },
    ]);
    expect(taskFilters("inProgress", statuses)).toEqual([
      { fieldId: "status", operator: "is", values: ["doing"] },
    ]);
    expect(taskFilters("upcoming", statuses)).toEqual([
      open,
      { fieldId: "due", operator: "is", values: ["week"] },
    ]);
    expect(taskFilters("noDate", statuses)).toEqual([
      open,
      { fieldId: "due", operator: "is", values: ["none"] },
    ]);
  });

  it("assignments open the list narrowed like their tab", () => {
    const notHandedIn = {
      fieldId: "status",
      operator: "is",
      values: ["not_started", "in_progress"],
    };
    expect(assignmentFilters("today")).toEqual([
      { fieldId: "session", operator: "is", values: ["today"] },
    ]);
    expect(assignmentFilters("dueToday")).toEqual([
      notHandedIn,
      { fieldId: "due", operator: "is", values: ["today"] },
    ]);
    expect(assignmentFilters("week")).toEqual([
      notHandedIn,
      { fieldId: "due", operator: "is", values: ["week", "next"] },
    ]);
  });
});

describe("overviewFilters", () => {
  const statuses: TaskStatus[] = [
    { id: "todo", name: "Todo", color: "#000", doneness: 0, position: 0 },
    { id: "done", name: "Done", color: "#000", doneness: 100, position: 1 },
  ];

  it("opens Tasks on open tasks in the asked due buckets", () => {
    expect(overviewFilters({ view: "tasks", due: ["overdue"] }, statuses)).toEqual([
      { fieldId: "status", operator: "is", values: ["todo"] },
      { fieldId: "due", operator: "is", values: ["overdue"] },
    ]);
  });

  it("opens Assignments on those tied to a session today, handed in or not", () => {
    expect(overviewFilters({ view: "assignments", due: [], session: "today" }, statuses)).toEqual([
      { fieldId: "session", operator: "is", values: ["today"] },
    ]);
  });

  it("opens Assignments on those not handed in", () => {
    expect(overviewFilters({ view: "assignments", due: ["today"] }, statuses)).toEqual([
      { fieldId: "status", operator: "is", values: ["not_started", "in_progress"] },
      { fieldId: "due", operator: "is", values: ["today"] },
    ]);
  });

  it("filters on status alone without due buckets", () => {
    expect(overviewFilters({ view: "tasks", due: [] }, statuses)).toEqual([
      { fieldId: "status", operator: "is", values: ["todo"] },
    ]);
  });
});
