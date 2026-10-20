import type { AssignmentRecord, TaskRecord, TaskStatus } from "@nookly/shared/data";
import { addDays } from "./dates.ts";

/// The Dashboard's lists, as the desktop orders and sorts them (`dashboard-model.ts`): the
/// closer a due day, or the more overdue, the higher it sits.

export type AssignmentTab = "today" | "dueToday" | "week";
export type TaskTab = "today" | "inProgress" | "upcoming" | "noDate";

/// Days the "Next 7 days" tabs look ahead, counting from tomorrow.
const WEEK_DAYS = 7;

const dayOf = (iso: string | null) => iso?.slice(0, 10) ?? null;
const inNextWeek = (day: string | null, today: string) =>
  day !== null && day > today && day <= addDays(today, WEEK_DAYS);
const byDue = <T extends { entity: { createdAt: string } }>(due: (t: T) => string | null) => {
  return (a: T, b: T) =>
    (due(a) ?? "9999").localeCompare(due(b) ?? "9999") ||
    a.entity.createdAt.localeCompare(b.entity.createdAt);
};

/// The day of the session an assignment's due date follows, when it follows one: the
/// resolved due day plus the days it is due before the session.
export function sessionDay(a: AssignmentRecord): string | null {
  const due = dayOf(a.dueDate);
  return due === null || a.dueSessionOffsetDays === null
    ? null
    : addDays(due, a.dueSessionOffsetDays);
}

const handedIn = (a: AssignmentRecord) => a.status === "submitted" || a.status === "graded";

/// Most important first. "For today" is the assignments tied to a session that is today,
/// handed in or not (they get presented in the lecture, and they stay even when overdue);
/// the other tabs hold open assignments by due day.
export function assignmentsFor(
  tab: AssignmentTab,
  all: AssignmentRecord[],
  today: string,
): AssignmentRecord[] {
  const live = all.filter((a) => a.entity.deletedAt === null);
  const sorter = byDue<AssignmentRecord>((a) => dayOf(a.dueDate));
  if (tab === "today") return live.filter((a) => sessionDay(a) === today).sort(sorter);
  const keep =
    tab === "dueToday"
      ? (a: AssignmentRecord) => dayOf(a.dueDate) === today
      : (a: AssignmentRecord) => inNextWeek(dayOf(a.dueDate), today);
  return live.filter((a) => !handedIn(a) && keep(a)).sort(sorter);
}

/// Tasks that still need doing, soonest due first and undated ones last.
export function tasksFor(
  tab: TaskTab,
  all: TaskRecord[],
  statuses: TaskStatus[],
  today: string,
): TaskRecord[] {
  const doneness = (t: TaskRecord) => statuses.find((s) => s.id === t.statusId)?.doneness ?? 0;
  const open = all.filter(
    (t) => t.entity.deletedAt === null && t.entity.type === "task" && doneness(t) < 100,
  );
  const keep = {
    today: (t: TaskRecord) => dayOf(t.dueDate) !== null && (dayOf(t.dueDate) ?? "") <= today,
    inProgress: (t: TaskRecord) => doneness(t) === 50,
    upcoming: (t: TaskRecord) => inNextWeek(dayOf(t.dueDate), today),
    noDate: (t: TaskRecord) => t.dueDate === null,
  }[tab];
  return open.filter(keep).sort(byDue<TaskRecord>((t) => dayOf(t.dueDate)));
}

/// "3d overdue", "Today", "Tomorrow", "in 5 days" for a due day.
export function dueText(day: string, today: string): { text: string; overdue: boolean } {
  const days = Math.round(
    (new Date(`${day}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
  );
  if (days < 0) return { text: `${-days}d overdue`, overdue: true };
  if (days === 0) return { text: "Today", overdue: false };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  return { text: `in ${days} days`, overdue: false };
}
