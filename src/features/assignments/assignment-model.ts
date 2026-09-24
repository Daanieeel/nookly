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
import type { Assignment, TaskStatus } from "@/lib/api/types";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { preferences } from "@/lib/preferences";
import type { StatusKind } from "@/features/tasks/task-model";

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

export function createdBucket(a: Assignment, now = new Date()): string {
  const today = startOfDay(now);
  const created = startOfDay(parseISO(a.entity.createdAt));
  if (isSameDay(created, today)) return "today";
  const weekStart = startOfWeek(today, WEEK);
  if (!isBefore(created, weekStart)) return "week";
  if (!isBefore(created, subWeeks(weekStart, 1))) return "last";
  return "earlier";
}

// Display options

export type Layout = "list" | "board";
export type Grouping = "deadline" | "created" | "status" | "course" | "none";

export const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "deadline", label: "Deadline" },
  { id: "created", label: "Created" },
  { id: "status", label: "Status" },
  { id: "course", label: "Course" },
  { id: "none", label: "No grouping" },
];

export interface DisplayOptions {
  layout: Layout;
  grouping: Grouping;
  /// Always `"none"` without a grouping, and never the grouping itself.
  subGrouping: Grouping;
  /// Remembered per layout: a board shows every column, a list hides empty groups.
  showEmpty: Record<Layout, boolean>;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  layout: "list",
  grouping: "deadline",
  subGrouping: "none",
  showEmpty: { board: true, list: false },
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
    const stored = JSON.parse(raw) as Partial<DisplayOptions>;
    const layout = pick(stored.layout, LAYOUTS, DEFAULT_DISPLAY.layout);
    const rawGrouping = pick(stored.grouping, GROUPINGS, DEFAULT_DISPLAY.grouping);
    // A board always needs columns to group by.
    const grouping = layout === "board" && rawGrouping === "none" ? "status" : rawGrouping;
    return {
      layout,
      grouping,
      subGrouping: validSubGrouping(grouping, pick(stored.subGrouping, GROUPINGS, "none")),
      showEmpty: {
        board: stored.showEmpty?.board !== false,
        list: stored.showEmpty?.list === true,
      },
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function writeDisplay(display: DisplayOptions) {
  preferences.set(STORAGE_KEYS.assignmentsDisplay, JSON.stringify(display));
}

// Ordering

/// Deadline buckets list what is closest to today first, Created lists the newest
/// first, and every other grouping goes by due date with undated ones last.
export function orderAssignments(
  assignments: Assignment[],
  grouping: Grouping,
  now = new Date(),
): Assignment[] {
  const today = startOfDay(now);
  const byCreated = (a: Assignment, b: Assignment) =>
    b.entity.createdAt.localeCompare(a.entity.createdAt);
  const distance = (a: Assignment) =>
    Math.abs(differenceInCalendarDays(parseISO(a.dueDate ?? a.entity.createdAt), today));
  const compare =
    grouping === "created"
      ? byCreated
      : grouping === "deadline"
        ? (a: Assignment, b: Assignment) => distance(a) - distance(b) || byCreated(a, b)
        : (a: Assignment, b: Assignment) =>
            (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byCreated(a, b);
  return [...assignments].sort(compare);
}
