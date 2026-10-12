import { addDays } from "date-fns";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { ASSIGNMENT_STATUSES, isDone } from "#/features/assignments/assignment-model.ts";
import { parseDay, sortStatuses, statusKind, toDay } from "#/features/tasks/task-model.ts";
import type { Assignment, Task, TaskStatus } from "#/lib/api/types.ts";

/// Pure ordering and bucketing for the Dashboard's Assignments and Tasks lists.
/// Importance comes from the due date: the closer (or the more overdue), the higher.

export type AssignmentTab = "today" | "dueToday" | "week";
export type TaskTab = "today" | "inProgress" | "upcoming" | "noDate";

/// Days the "Next 7 days" tabs look ahead, counting from tomorrow.
const WEEK_DAYS = 7;

/// The day of the session an assignment's due date follows, when it follows one.
function sessionDay(a: Assignment): string | null {
  if (a.dueDate == null || a.dueSessionOffsetDays == null) return null;
  return toDay(addDays(parseDay(a.dueDate.slice(0, 10)), a.dueSessionOffsetDays));
}

const dayOf = (iso: string | null) => iso?.slice(0, 10) ?? null;

function inNextWeek(day: string | null, today: string): boolean {
  if (day == null) return false;
  return day > today && day <= toDay(addDays(parseDay(today), WEEK_DAYS));
}

/// Most important first: an assignment tied to a session that is today outranks any
/// other, then the earliest due date.
export function assignmentsFor(tab: AssignmentTab, all: Assignment[], today: string): Assignment[] {
  const open = all.filter((a) => !isDone(a) && a.entity.deletedAt == null);
  const sessionToday = (a: Assignment) => sessionDay(a) === today;
  const keep = {
    today: (a: Assignment) => sessionToday(a) || (dayOf(a.dueDate) ?? "9999") <= today,
    dueToday: (a: Assignment) => dayOf(a.dueDate) === today,
    week: (a: Assignment) => inNextWeek(dayOf(a.dueDate), today),
  }[tab];
  return open
    .filter(keep)
    .sort(
      (a, b) =>
        Number(sessionToday(b)) - Number(sessionToday(a)) ||
        (dayOf(a.dueDate) ?? "9999").localeCompare(dayOf(b.dueDate) ?? "9999") ||
        a.entity.createdAt.localeCompare(b.entity.createdAt),
    );
}

/// Tasks that still need doing, soonest due first and undated ones last.
export function tasksFor(tab: TaskTab, all: Task[], statuses: TaskStatus[], today: string): Task[] {
  const sorted = sortStatuses(statuses);
  const kindOf = (t: Task) => {
    const status = sorted.find((s) => s.id === t.statusId);
    return status ? statusKind(status, sorted) : "unstarted";
  };
  const open = all.filter((t) => {
    const kind = kindOf(t);
    return t.entity.deletedAt == null && kind !== "completed" && kind !== "canceled";
  });
  const keep = {
    today: (t: Task) => (dayOf(t.dueDate) ?? "9999") <= today,
    inProgress: (t: Task) => kindOf(t) === "started",
    upcoming: (t: Task) => inNextWeek(dayOf(t.dueDate), today),
    noDate: (t: Task) => t.dueDate == null,
  }[tab];
  return open
    .filter(keep)
    .sort(
      (a, b) =>
        (dayOf(a.dueDate) ?? "9999").localeCompare(dayOf(b.dueDate) ?? "9999") ||
        a.entity.createdAt.localeCompare(b.entity.createdAt),
    );
}

const filter = (fieldId: string, ...values: string[]): ActiveFilter => ({
  fieldId,
  operator: "is",
  values,
});

/// The Tasks page filters that show what a Tasks tab counts, for its "Show more".
export function taskFilters(tab: TaskTab, statuses: TaskStatus[]): ActiveFilter[] {
  const sorted = sortStatuses(statuses);
  const ids = (kinds: string[]) =>
    sorted.filter((s) => kinds.includes(statusKind(s, sorted))).map((s) => s.id);
  const open = filter("status", ...ids(["backlog", "unstarted", "started"]));
  return {
    today: [open, filter("due", "overdue", "today")],
    inProgress: [filter("status", ...ids(["started"]))],
    upcoming: [open, filter("due", "week")],
    noDate: [open, filter("due", "none")],
  }[tab];
}

/// The same for Assignments. Their "week" and "next" due buckets stand in for the next
/// 7 days, which the page has no exact filter for.
export function assignmentFilters(tab: AssignmentTab): ActiveFilter[] {
  const notHandedIn = filter(
    "status",
    ...ASSIGNMENT_STATUSES.map((s) => s.id).filter(
      (id) => id === "not_started" || id === "in_progress",
    ),
  );
  return {
    today: [notHandedIn, filter("due", "overdue", "today")],
    dueToday: [notHandedIn, filter("due", "today")],
    week: [notHandedIn, filter("due", "week", "next")],
  }[tab];
}
