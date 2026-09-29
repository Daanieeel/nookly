import {
  IconBan,
  IconCalendarEvent,
  IconCircleDot,
  IconClockEdit,
  IconClockPlus,
  IconLetterCase,
  IconSchool,
  IconStar,
  IconWand,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import {
  addWeeks,
  differenceInCalendarDays,
  endOfWeek,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
  subWeeks,
} from "date-fns";
import type { Assignment, TaskStatus } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import type { StatusKind } from "#/features/tasks/task-model.ts";

/// Pure view logic for the Assignments page: statuses, date buckets, ordering and
/// the remembered display options. Nothing here touches the backend.

// Statuses

/// The fixed Assignment statuses, shaped like Task statuses so they draw with the
/// same Linear style glyphs and picker.
export const ASSIGNMENT_STATUSES: TaskStatus[] = [
  { id: "not_started", name: "Not started", color: "#64748b", doneness: 0, position: 0 },
  { id: "in_progress", name: "In progress", color: "#3b82f6", doneness: 50, position: 1 },
  { id: "submitted", name: "Submitted", color: "#a855f7", doneness: 75, position: 2 },
  { id: "graded", name: "Graded", color: "#22c55e", doneness: 100, position: 3 },
];

export function assignmentStatus(id: string): TaskStatus {
  return ASSIGNMENT_STATUSES.find((s) => s.id === id) ?? ASSIGNMENT_STATUSES[0];
}

export function statusKindOf(id: string): StatusKind {
  if (id === "graded") return "completed";
  if (id === "in_progress" || id === "submitted") return "started";
  return "unstarted";
}

export function isDone(assignment: Assignment): boolean {
  return assignment.status === "submitted" || assignment.status === "graded";
}

// Date buckets

export type Tone = "destructive" | "caution" | "positive" | "muted";

export interface BucketDef {
  id: string;
  label: string;
  tone: Tone;
  collapsed?: boolean;
}

export const DEADLINE_BUCKETS: BucketDef[] = [
  { id: "overdue", label: "Overdue", tone: "destructive" },
  { id: "today", label: "Today", tone: "caution" },
  { id: "week", label: "This Week", tone: "muted" },
  { id: "next", label: "Next Week", tone: "muted" },
  { id: "later", label: "Later", tone: "muted" },
  { id: "none", label: "No Due Date", tone: "muted" },
  // Past due but handed in: kept out of Overdue so that bucket only holds real misses.
  { id: "done", label: "Done", tone: "positive", collapsed: true },
];

export const CREATED_BUCKETS: BucketDef[] = [
  { id: "today", label: "Added Today", tone: "muted" },
  { id: "week", label: "Added This Week", tone: "muted" },
  { id: "last", label: "Added Last Week", tone: "muted" },
  { id: "earlier", label: "Earlier", tone: "muted" },
];

const WEEK = { weekStartsOn: 1 } as const;

export function deadlineBucket(a: Assignment, now = new Date()): string {
  const today = startOfDay(now);
  if (!a.dueDate) return "none";
  const due = parseISO(a.dueDate);
  if (isBefore(due, today)) return isDone(a) ? "done" : "overdue";
  if (isSameDay(due, today)) return "today";
  const weekEnd = endOfWeek(today, WEEK);
  if (!isBefore(weekEnd, due)) return "week";
  if (!isBefore(addWeeks(weekEnd, 1), due)) return "next";
  return "later";
}

/// Where a timestamp falls relative to this week, shared by every "created" and
/// "updated" bucket and filter.
export function ageBucket(iso: string, now = new Date()): string {
  const today = startOfDay(now);
  const day = startOfDay(parseISO(iso));
  if (isSameDay(day, today)) return "today";
  const weekStart = startOfWeek(today, WEEK);
  if (!isBefore(day, weekStart)) return "week";
  if (!isBefore(day, subWeeks(weekStart, 1))) return "last";
  return "earlier";
}

export const AGE_BUCKETS: { id: string; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "last", label: "Last week" },
  { id: "earlier", label: "Earlier" },
];

export function createdBucket(a: Assignment, now = new Date()): string {
  return ageBucket(a.entity.createdAt, now);
}

export const GRADE_FILTER: { id: string; label: string }[] = [
  { id: "graded", label: "Has a grade" },
  { id: "none", label: "No grade" },
];

// Display options

export type Layout = "list" | "board";
export type Grouping =
  | "deadline"
  | "created"
  | "updated"
  | "status"
  | "grade"
  | "course"
  | "none";
/// "auto" keeps the order that fits the grouping.
export type Ordering = "auto" | "due" | "created" | "updated" | "title" | "status" | "grade";

export const GROUPINGS: { id: Grouping; label: string; icon: TablerIcon }[] = [
  { id: "deadline", label: "Deadline", icon: IconCalendarEvent },
  { id: "created", label: "Created", icon: IconClockPlus },
  { id: "updated", label: "Updated", icon: IconClockEdit },
  { id: "status", label: "Status", icon: IconCircleDot },
  { id: "grade", label: "Grade", icon: IconStar },
  { id: "course", label: "Course", icon: IconSchool },
  { id: "none", label: "No grouping", icon: IconBan },
];

export const ORDERINGS: { id: Ordering; label: string; icon: TablerIcon }[] = [
  { id: "auto", label: "Automatic", icon: IconWand },
  { id: "due", label: "Due date", icon: IconCalendarEvent },
  { id: "created", label: "Created", icon: IconClockPlus },
  { id: "updated", label: "Updated", icon: IconClockEdit },
  { id: "title", label: "Title", icon: IconLetterCase },
  { id: "status", label: "Status", icon: IconCircleDot },
  { id: "grade", label: "Grade", icon: IconStar },
];

export interface DisplayOptions {
  layout: Layout;
  grouping: Grouping;
  /// Always `"none"` without a grouping, and never the grouping itself.
  subGrouping: Grouping;
  ordering: Ordering;
  /// Remembered per layout: a board shows every column, a list hides empty groups.
  showEmpty: Record<Layout, boolean>;
  /// Board columns (group ids) the user hid. Only the board honors it.
  hiddenColumns: string[];
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  layout: "list",
  grouping: "deadline",
  subGrouping: "none",
  ordering: "auto",
  showEmpty: { board: true, list: false },
  hiddenColumns: [],
};

const LAYOUTS: { id: Layout }[] = [{ id: "list" }, { id: "board" }];

function pick<T extends string>(value: string | undefined, allowed: { id: T }[], fallback: T): T {
  return allowed.find((a) => a.id === value)?.id ?? fallback;
}

export function validSubGrouping(grouping: Grouping, subGrouping: Grouping): Grouping {
  return grouping === "none" || subGrouping === grouping ? "none" : subGrouping;
}

/// Every field is checked again, so an outdated value falls back to its default.
export function readDisplay(): DisplayOptions {
  try {
    const raw = preferences.get(STORAGE_KEYS.assignmentsDisplay);
    if (!raw) return DEFAULT_DISPLAY;
    // SAFETY: this key is only ever written by `writeDisplay` below, and every field
    // is validated before use, so a stale shape only loses that field.
    return normalizeDisplay(JSON.parse(raw) as Partial<DisplayOptions>);
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/// Checks every field of a stored `DisplayOptions` (the remembered page display or a
/// saved View's), falling back to the default for any that is missing or invalid.
export function normalizeDisplay(stored: Partial<DisplayOptions>): DisplayOptions {
  try {
    const layout = pick(stored.layout, LAYOUTS, DEFAULT_DISPLAY.layout);
    const rawGrouping = pick(stored.grouping, GROUPINGS, DEFAULT_DISPLAY.grouping);
    // A board always needs columns to group by.
    const grouping = layout === "board" && rawGrouping === "none" ? "status" : rawGrouping;
    return {
      layout,
      grouping,
      subGrouping: validSubGrouping(grouping, pick(stored.subGrouping, GROUPINGS, "none")),
      ordering: pick(stored.ordering, ORDERINGS, DEFAULT_DISPLAY.ordering),
      showEmpty: {
        board: stored.showEmpty?.board !== false,
        list: stored.showEmpty?.list === true,
      },
      hiddenColumns: Array.isArray(stored.hiddenColumns)
        ? stored.hiddenColumns.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function writeDisplay(display: DisplayOptions) {
  preferences.set(STORAGE_KEYS.assignmentsDisplay, JSON.stringify(display));
}

// Ordering

/// Automatic ordering: deadline buckets list what is closest to today first, Created
/// lists the newest first, and every other grouping goes by due date with undated
/// ones last. A chosen ordering overrides that.
export function orderAssignments(
  assignments: Assignment[],
  grouping: Grouping,
  ordering: Ordering = "auto",
  now = new Date(),
): Assignment[] {
  const today = startOfDay(now);
  const byCreated = (a: Assignment, b: Assignment) =>
    b.entity.createdAt.localeCompare(a.entity.createdAt);
  const distance = (a: Assignment) =>
    Math.abs(differenceInCalendarDays(parseISO(a.dueDate ?? a.entity.createdAt), today));
  const byDue = (a: Assignment, b: Assignment) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byCreated(a, b);
  const statusPosition = (a: Assignment) => assignmentStatus(a.status).position;
  const compare: Record<Ordering, (a: Assignment, b: Assignment) => number> = {
    auto:
      grouping === "created"
        ? byCreated
        : grouping === "updated"
          ? (a, b) => b.entity.updatedAt.localeCompare(a.entity.updatedAt)
          : grouping === "deadline"
            ? (a, b) => distance(a) - distance(b) || byCreated(a, b)
            : byDue,
    due: byDue,
    created: byCreated,
    updated: (a, b) => b.entity.updatedAt.localeCompare(a.entity.updatedAt),
    title: (a, b) =>
      displayTitle(a.entity).localeCompare(displayTitle(b.entity), undefined, {
        sensitivity: "base",
      }),
    status: (a, b) => statusPosition(a) - statusPosition(b) || byDue(a, b),
    // Highest grade first, ungraded last.
    grade: (a, b) => (b.grade ?? -1) - (a.grade ?? -1) || byDue(a, b),
  };
  return [...assignments].sort(compare[ordering]);
}
