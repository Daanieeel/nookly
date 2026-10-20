import type { AssignmentRecord, TaskRecord, TaskStatus } from "@nookly/shared/data";
import { assignmentsFor, dueText, sessionDay, tasksFor } from "./dashboard-model.ts";

const statuses: TaskStatus[] = [
  { id: "todo", name: "Todo", color: "", doneness: 0, position: 1 },
  { id: "doing", name: "In Progress", color: "", doneness: 50, position: 2 },
  { id: "done", name: "Done", color: "", doneness: 100, position: 3 },
];
// SAFETY: a fixture with only the fields the function under test reads.
const task = (id: string, statusId: string, dueDate: string | null, created = "2026-01-01") =>
  ({
    entity: { id, type: "task", deletedAt: null, createdAt: created },
    statusId,
    dueDate,
  }) as TaskRecord;
// SAFETY: a fixture with only the fields the function under test reads.
const assignment = (id: string, over: Partial<AssignmentRecord>) =>
  ({
    entity: { id, deletedAt: null, createdAt: "2026-01-01" },
    status: "not_started",
    dueDate: null,
    dueSessionOffsetDays: null,
    ...over,
  }) as AssignmentRecord;
const TODAY = "2026-10-21";

describe("the Dashboard's task tabs", () => {
  const all = [
    task("late", "todo", "2026-10-18"),
    task("today", "todo", "2026-10-21"),
    task("soon", "todo", "2026-10-25"),
    task("far", "todo", "2026-12-01"),
    task("undated", "todo", null),
    task("doing", "doing", null),
    task("finished", "done", "2026-10-20"),
  ];
  const ids = (tab: Parameters<typeof tasksFor>[0]) =>
    tasksFor(tab, all, statuses, TODAY).map((t) => t.entity.id);

  it("puts overdue and today's first, skipping what is finished", () => {
    expect(ids("today")).toEqual(["late", "today"]);
  });

  it("holds what is in progress, the next 7 days and the undated", () => {
    expect(ids("inProgress")).toEqual(["doing"]);
    expect(ids("upcoming")).toEqual(["soon"]);
    expect(ids("noDate")).toEqual(["undated", "doing"]);
  });
});

describe("the Dashboard's assignment tabs", () => {
  const all = [
    assignment("a", { dueDate: "2026-10-21" }),
    assignment("b", { dueDate: "2026-10-24" }),
    assignment("c", { dueDate: "2026-10-21", status: "submitted" }),
    assignment("d", { dueDate: "2026-10-20", dueSessionOffsetDays: 1, status: "graded" }),
  ];
  const ids = (tab: Parameters<typeof assignmentsFor>[0]) =>
    assignmentsFor(tab, all, TODAY).map((a) => a.entity.id);

  it("shows those due today and in the next week that are still open", () => {
    expect(ids("dueToday")).toEqual(["a"]);
    expect(ids("week")).toEqual(["b"]);
  });

  it("keeps those tied to a session today, handed in or not", () => {
    expect(sessionDay(all[3])).toBe("2026-10-21");
    expect(ids("today")).toEqual(["d"]);
  });
});

describe("a due day in words", () => {
  it("says how far off or late it is", () => {
    expect(dueText("2026-10-18", TODAY)).toEqual({ text: "3d overdue", overdue: true });
    expect(dueText(TODAY, TODAY).text).toBe("Today");
    expect(dueText("2026-10-22", TODAY).text).toBe("Tomorrow");
    expect(dueText("2026-10-26", TODAY).text).toBe("in 5 days");
  });
});
