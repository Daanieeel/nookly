import {
  IconAlertCircle,
  IconCalendarDot,
  IconCalendarMonth,
  IconCalendarOff,
  IconCalendarWeek,
  IconCircleCheck,
  IconClockPlus,
  IconHistory,
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
import type { Assignment } from "@/lib/api/types";
import { STORAGE_KEYS } from "@/lib/storage-keys";

export const ASSIGNMENT_STATUSES = [
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "submitted", label: "Submitted" },
  { id: "graded", label: "Graded" },
] as const;

const DONE_STATUSES = new Set(["submitted", "graded"]);

export function isDone(assignment: Assignment): boolean {
  return DONE_STATUSES.has(assignment.status);
}

export function statusLabel(status: string): string {
  return ASSIGNMENT_STATUSES.find((s) => s.id === status)?.label ?? status;
}

export type Grouping = "deadline" | "created";

export function readGrouping(): Grouping {
  try {
    return localStorage.getItem(STORAGE_KEYS.assignmentsGrouping) === "created"
      ? "created"
      : "deadline";
  } catch {
    return "deadline";
  }
}

export function writeGrouping(grouping: Grouping) {
  try {
    localStorage.setItem(STORAGE_KEYS.assignmentsGrouping, grouping);
  } catch {
    // Storage unavailable; the choice just isn't remembered.
  }
}

export type Tone = "destructive" | "caution" | "positive" | "muted";

export interface Bucket {
  id: string;
  label: string;
  icon: TablerIcon;
  tone: Tone;
  /// Starts collapsed, for buckets that only hold finished work.
  collapsed?: boolean;
  items: Assignment[];
}

type BucketDef = Omit<Bucket, "items">;

const DEADLINE_BUCKETS: BucketDef[] = [
  { id: "overdue", label: "Overdue", icon: IconAlertCircle, tone: "destructive" },
  { id: "today", label: "Today", icon: IconCalendarDot, tone: "caution" },
  { id: "week", label: "This Week", icon: IconCalendarWeek, tone: "muted" },
  { id: "next", label: "Next Week", icon: IconCalendarWeek, tone: "muted" },
  { id: "later", label: "Later", icon: IconCalendarMonth, tone: "muted" },
  { id: "none", label: "No Due Date", icon: IconCalendarOff, tone: "muted" },
  // Past due but handed in: kept out of Overdue so that bucket only holds real misses.
  { id: "done", label: "Done", icon: IconCircleCheck, tone: "positive", collapsed: true },
];

const CREATED_BUCKETS: BucketDef[] = [
  { id: "today", label: "Added Today", icon: IconClockPlus, tone: "muted" },
  { id: "week", label: "Added This Week", icon: IconClockPlus, tone: "muted" },
  { id: "last", label: "Added Last Week", icon: IconHistory, tone: "muted" },
  { id: "earlier", label: "Earlier", icon: IconHistory, tone: "muted" },
];

const WEEK = { weekStartsOn: 1 } as const;

function deadlineBucket(a: Assignment, today: Date): string {
  if (!a.dueDate) return "none";
  const due = parseISO(a.dueDate);
  if (isBefore(due, today)) return isDone(a) ? "done" : "overdue";
  if (isSameDay(due, today)) return "today";
  const weekEnd = endOfWeek(today, WEEK);
  if (!isBefore(weekEnd, due)) return "week";
  if (!isBefore(addWeeks(weekEnd, 1), due)) return "next";
  return "later";
}

function createdBucket(a: Assignment, today: Date): string {
  const created = startOfDay(parseISO(a.entity.createdAt));
  if (isSameDay(created, today)) return "today";
  const weekStart = startOfWeek(today, WEEK);
  if (!isBefore(created, weekStart)) return "week";
  if (!isBefore(created, subWeeks(weekStart, 1))) return "last";
  return "earlier";
}

/// Buckets by date proximity, nearest to today first inside each bucket. Empty
/// buckets are dropped.
export function bucketAssignments(
  assignments: Assignment[],
  grouping: Grouping,
  now = new Date(),
): Bucket[] {
  const today = startOfDay(now);
  const defs = grouping === "deadline" ? DEADLINE_BUCKETS : CREATED_BUCKETS;
  const bucketOf = grouping === "deadline" ? deadlineBucket : createdBucket;
  const dateOf = (a: Assignment) =>
    grouping === "deadline" ? (a.dueDate ?? a.entity.createdAt) : a.entity.createdAt;
  const distance = (a: Assignment) =>
    Math.abs(differenceInCalendarDays(parseISO(dateOf(a)), today));

  return defs
    .map((def) => ({
      ...def,
      items: assignments
        .filter((a) => bucketOf(a, today) === def.id)
        .sort((a, b) => distance(a) - distance(b) || dateOf(b).localeCompare(dateOf(a))),
    }))
    .filter((b) => b.items.length > 0);
}
