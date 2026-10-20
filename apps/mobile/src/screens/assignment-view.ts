import { ASSIGNMENT_STATUSES } from "@nookly/shared/colors";
import type { AssignmentRecord } from "@nookly/shared/data";
import { addDays } from "./dates.ts";

/// How the Assignments list is shown: grouped by when they are due (as the desktop's
/// overview does), or by course, status or Space; nothing here touches the data.

export const ASSIGNMENT_GROUPINGS = [
  { id: "due", label: "Deadline" },
  { id: "course", label: "Course" },
  { id: "status", label: "Status" },
  { id: "space", label: "Space" },
] as const;
export type AssignmentGrouping = (typeof ASSIGNMENT_GROUPINGS)[number]["id"];

export type Tone = "destructive" | "caution" | "positive" | "muted";

export const DEADLINE_BUCKETS = [
  { id: "overdue", title: "Overdue", tone: "destructive" },
  { id: "today", title: "Today", tone: "caution" },
  { id: "week", title: "This Week", tone: "muted" },
  { id: "next", title: "Next Week", tone: "muted" },
  { id: "later", title: "Later", tone: "muted" },
  { id: "none", title: "No Due Date", tone: "muted" },
  { id: "done", title: "Done", tone: "positive" },
] as const satisfies readonly { id: string; title: string; tone: Tone }[];
export type DeadlineBucket = (typeof DEADLINE_BUCKETS)[number]["id"];

export const isHandedIn = (a: AssignmentRecord) =>
  a.status === "submitted" || a.status === "graded";

/// The Monday of the week a day is in.
function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return addDays(day, -((weekday + 6) % 7));
}

/// Where an assignment's due day falls, counted from today: finished ones are Done whenever
/// they were due, so Overdue only holds real misses.
export function deadlineBucket(a: AssignmentRecord, today: string): DeadlineBucket {
  if (isHandedIn(a)) return "done";
  const due = a.dueDate?.slice(0, 10);
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  const thisWeekEnd = addDays(weekStart(today), 6);
  if (due <= thisWeekEnd) return "week";
  if (due <= addDays(thisWeekEnd, 7)) return "next";
  return "later";
}

export interface AssignmentGroup {
  id: string;
  title: string;
  tone: Tone;
  items: AssignmentRecord[];
}

interface Context {
  today: string;
  courseName: (id: string | null) => string | undefined;
  spaceName: (id: string) => string | undefined;
}

const byDue = (a: AssignmentRecord, b: AssignmentRecord) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
  a.entity.createdAt.localeCompare(b.entity.createdAt);

/// The groups of the list, in a stable order, empty ones left out, each by due day.
export function groupAssignments(
  list: AssignmentRecord[],
  grouping: AssignmentGrouping,
  ctx: Context,
): AssignmentGroup[] {
  const sorted = [...list].sort(byDue);
  const build = (key: (a: AssignmentRecord) => string, title: (id: string) => string) => {
    const ids = [...new Set(sorted.map(key))].sort((a, b) => title(a).localeCompare(title(b)));
    return ids.map((id) => ({
      id,
      title: title(id),
      tone: "muted" as const,
      items: sorted.filter((a) => key(a) === id),
    }));
  };
  if (grouping === "course") {
    return build(
      (a) => a.courseId ?? "none",
      (id) => (id === "none" ? "No course" : (ctx.courseName(id) ?? "Course")),
    );
  }
  if (grouping === "space") {
    return build(
      (a) => a.entity.spaceId,
      (id) => ctx.spaceName(id) ?? "Space",
    );
  }
  if (grouping === "status") {
    return ASSIGNMENT_STATUSES.map((s) => ({
      id: s.id,
      title: s.name,
      tone: "muted" as const,
      items: sorted.filter((a) => a.status === s.id),
    })).filter((g) => g.items.length > 0);
  }
  return DEADLINE_BUCKETS.map((bucket) => ({
    id: bucket.id,
    title: bucket.title,
    tone: bucket.tone,
    items: sorted.filter((a) => deadlineBucket(a, ctx.today) === bucket.id),
  })).filter((g) => g.items.length > 0);
}
