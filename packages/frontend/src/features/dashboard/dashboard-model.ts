import { addDays } from "date-fns";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { isDone, sessionDay } from "#/features/assignments/assignment-model.ts";
import { parseDay, sortStatuses, statusKind, toDay } from "#/features/tasks/task-model.ts";
import type { Assignment, Task, TaskStatus } from "#/lib/api/types.ts";

/// Pure ordering and bucketing for the Dashboard's Assignments and Tasks lists.
/// Importance comes from the due date: the closer (or the more overdue), the higher.

export type AssignmentTab = "today" | "dueToday" | "week";
export type TaskTab = "today" | "inProgress" | "upcoming" | "noDate";

/// Days the "Next 7 days" tabs look ahead, counting from tomorrow.
const WEEK_DAYS = 7;

const dayOf = (iso: string | null) => iso?.slice(0, 10) ?? null;

function inNextWeek(day: string | null, today: string): boolean {
  if (day == null) return false;
  return day > today && day <= toDay(addDays(parseDay(today), WEEK_DAYS));
}

/// Most important first. "For today" is the assignments tied to a session that is
/// today, handed in or not, since those get presented in the lecture, and they stay
/// even when overdue. The other tabs hold open assignments by due date.
export function assignmentsFor(tab: AssignmentTab, all: Assignment[], today: string): Assignment[] {
  const live = all.filter((a) => a.entity.deletedAt == null);
  const byDue = (a: Assignment, b: Assignment) =>
    (dayOf(a.dueDate) ?? "9999").localeCompare(dayOf(b.dueDate) ?? "9999") ||
    a.entity.createdAt.localeCompare(b.entity.createdAt);
  if (tab === "today") return live.filter((a) => sessionDay(a) === today).sort(byDue);
  const keep = {
    dueToday: (a: Assignment) => dayOf(a.dueDate) === today,
    week: (a: Assignment) => inNextWeek(dayOf(a.dueDate), today),
  }[tab];
  return live.filter((a) => !isDone(a) && keep(a)).sort(byDue);
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

/// Where a Dashboard link into the Tasks or Assignments overview lands: open items,
/// narrowed to these due buckets (none for all of them).
export interface OverviewLink {
  view: "tasks" | "assignments";
  due: string[];
  /// Assignments only: those tied to a session that is today, in place of the open and
  /// due filters.
  session?: "today";
}

/// The filters an overview opens with for `link`. Tasks keep the ones still open and
/// Assignments the ones not handed in yet.
export function overviewFilters(link: OverviewLink, statuses: TaskStatus[]): ActiveFilter[] {
  if (link.session) return [filter("session", link.session)];
  const sorted = sortStatuses(statuses);
  const open =
    link.view === "tasks"
      ? filter(
          "status",
          ...sorted
            .filter((s) => ["backlog", "unstarted", "started"].includes(statusKind(s, sorted)))
            .map((s) => s.id),
        )
      : filter("status", "not_started", "in_progress");
  return link.due.length > 0 ? [open, filter("due", ...link.due)] : [open];
}

/// The Tasks page filters that show what a Tasks tab counts, for its "Show more".
export function taskFilters(tab: TaskTab, statuses: TaskStatus[]): ActiveFilter[] {
  const sorted = sortStatuses(statuses);
  const due = (...buckets: string[]) => overviewFilters({ view: "tasks", due: buckets }, statuses);
  return {
    today: due("overdue", "today"),
    inProgress: [
      filter(
        "status",
        ...sorted.filter((s) => statusKind(s, sorted) === "started").map((s) => s.id),
      ),
    ],
    upcoming: due("week"),
    noDate: due("none"),
  }[tab];
}

/// The same for Assignments. Their "week" and "next" due buckets stand in for the next
/// 7 days, which the page has no exact filter for.
export function assignmentFilters(tab: AssignmentTab): ActiveFilter[] {
  const due = (...buckets: string[]) => overviewFilters({ view: "assignments", due: buckets }, []);
  return {
    today: overviewFilters({ view: "assignments", due: [], session: "today" }, []),
    dueToday: due("today"),
    week: due("week", "next"),
  }[tab];
}
