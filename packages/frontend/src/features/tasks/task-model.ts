import {
  IconBan,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCircleDot,
  IconClockEdit,
  IconClockPlus,
  IconLetterCase,
  IconTag,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import type { Label, Task, TaskStatus } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { preferences } from "#/lib/preferences.ts";
import { AGE_BUCKETS, ageBucket } from "#/features/assignments/assignment-model.ts";

/// Pure view logic for the Tasks page: status kinds, due buckets, grouping, ordering,
/// filtering and the remembered display options. Nothing here touches the backend.

export type StatusKind = "backlog" | "unstarted" | "started" | "completed" | "canceled";

export function sortStatuses(statuses: TaskStatus[]): TaskStatus[] {
  return [...statuses].sort((a, b) => a.position - b.position);
}

/// How a status reads, derived from its doneness and position like Linear's status
/// types. With several statuses at zero doneness the first is the backlog, and with
/// several at full doneness every one after the first counts as canceled, matching
/// the default "Backlog, Todo, ..., Done, Cancelled" order.
export function statusKind(status: TaskStatus, sorted: TaskStatus[]): StatusKind {
  if (status.doneness >= 100) {
    const finished = sorted.filter((s) => s.doneness >= 100);
    return finished[0]?.id === status.id ? "completed" : "canceled";
  }
  if (status.doneness > 0) return "started";
  const unstarted = sorted.filter((s) => s.doneness <= 0);
  return unstarted.length > 1 && unstarted[0].id === status.id ? "backlog" : "unstarted";
}

// Due dates

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export const DUE_BUCKETS: { id: DueBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "week", label: "Next 7 days" },
  { id: "later", label: "Later" },
  { id: "none", label: "No due date" },
];

/// `YYYY-MM-DD` as a local midnight, so "today" never shifts with the timezone.
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDay(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/// Whole days from today until `day`; negative when it lies in the past.
export function daysUntil(day: string, now = new Date()): number {
  return Math.round((parseDay(day).getTime() - startOfToday(now).getTime()) / 86_400_000);
}

export function dueBucket(dueDate: string | null, now = new Date()): DueBucket {
  return dayBucket(dueDate, now);
}

/// Start dates split the same way as due dates, with labels that read as a start.
export const START_BUCKETS: { id: DueBucket; label: string }[] = [
  { id: "overdue", label: "Started" },
  { id: "today", label: "Starts today" },
  { id: "week", label: "Next 7 days" },
  { id: "later", label: "Later" },
  { id: "none", label: "No start date" },
];

/// Which of the shared date buckets `day` falls in, counted from today.
export function dayBucket(day: string | null, now = new Date()): DueBucket {
  if (!day) return "none";
  const days = daysUntil(day, now);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

/// Short date in the Linear style, `Sep 24`, with the year only when it isn't this one.
export function formatDay(day: string, now = new Date()): string {
  return formatShortDate(day, now);
}

export function formatTimestamp(iso: string, now = new Date()): string {
  return formatShortDate(iso, now);
}

/// Due date urgency, only for tasks that are still open.
export function dueTone(task: Task, kind: StatusKind): "overdue" | "soon" | null {
  if (!task.dueDate || kind === "completed" || kind === "canceled") return null;
  const days = daysUntil(task.dueDate);
  if (days < 0) return "overdue";
  if (days <= 1) return "soon";
  return null;
}

// Display options

export type Layout = "list" | "board";
export type Grouping = "status" | "label" | "start" | "due" | "created" | "updated" | "none";
export type Ordering = "due" | "start" | "created" | "updated" | "title" | "status";
export type DisplayProperty = "key" | "status" | "labels" | "due" | "effort" | "created";

export const GROUPINGS: { id: Grouping; label: string; icon: TablerIcon }[] = [
  { id: "status", label: "Status", icon: IconCircleDot },
  { id: "label", label: "Label", icon: IconTag },
  { id: "start", label: "Start date", icon: IconCalendarPlus },
  { id: "due", label: "Due date", icon: IconCalendarEvent },
  { id: "created", label: "Created", icon: IconClockPlus },
  { id: "updated", label: "Updated", icon: IconClockEdit },
  { id: "none", label: "No grouping", icon: IconBan },
];

export const ORDERINGS: { id: Ordering; label: string; icon: TablerIcon }[] = [
  { id: "due", label: "Due date", icon: IconCalendarEvent },
  { id: "start", label: "Start date", icon: IconCalendarPlus },
  { id: "created", label: "Created", icon: IconClockPlus },
  { id: "updated", label: "Updated", icon: IconClockEdit },
  { id: "title", label: "Title", icon: IconLetterCase },
  { id: "status", label: "Status", icon: IconCircleDot },
];

export const DISPLAY_PROPERTIES: { id: DisplayProperty; label: string }[] = [
  { id: "key", label: "ID" },
  { id: "status", label: "Status" },
  { id: "labels", label: "Labels" },
  { id: "due", label: "Due date" },
  { id: "effort", label: "Effort" },
  { id: "created", label: "Created" },
];

export interface DisplayOptions {
  layout: Layout;
  grouping: Grouping;
  /// Splits each group again: nested headers in a list, swimlanes on a board.
  /// Always `"none"` without a grouping, and never the grouping itself.
  subGrouping: Grouping;
  ordering: Ordering;
  /// Remembered per layout: a board shows every column, a list hides empty groups.
  showEmpty: Record<Layout, boolean>;
  /// Board columns (group ids) the user hid. Only the board honors it.
  hiddenColumns: string[];
  properties: DisplayProperty[];
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  layout: "board",
  grouping: "status",
  subGrouping: "none",
  ordering: "due",
  showEmpty: { board: true, list: false },
  hiddenColumns: [],
  properties: ["key", "status", "labels", "due", "effort", "created"],
};

function pick<T extends string>(value: string | undefined, allowed: { id: T }[], fallback: T): T {
  return allowed.find((a) => a.id === value)?.id ?? fallback;
}

const LAYOUTS: { id: Layout }[] = [{ id: "list" }, { id: "board" }];

/// Every field is checked again, so an outdated or hand edited value falls back to
/// its default instead of breaking the page.
export function readDisplay(): DisplayOptions {
  try {
    const raw = preferences.get(STORAGE_KEYS.tasksDisplay);
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
    const properties = Array.isArray(stored.properties) ? stored.properties : null;
    return {
      layout,
      grouping,
      subGrouping: validSubGrouping(
        grouping,
        pick(stored.subGrouping, GROUPINGS, DEFAULT_DISPLAY.subGrouping),
      ),
      ordering: pick(stored.ordering, ORDERINGS, DEFAULT_DISPLAY.ordering),
      showEmpty: {
        board: stored.showEmpty?.board !== false,
        list: stored.showEmpty?.list === true,
      },
      hiddenColumns: Array.isArray(stored.hiddenColumns)
        ? stored.hiddenColumns.filter((id): id is string => typeof id === "string")
        : [],
      properties: properties
        ? DISPLAY_PROPERTIES.filter((p) => properties.includes(p.id)).map((p) => p.id)
        : DEFAULT_DISPLAY.properties,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

/// Drops a sub-grouping that no longer makes sense for `grouping`.
export function validSubGrouping(grouping: Grouping, subGrouping: Grouping): Grouping {
  return grouping === "none" || subGrouping === grouping ? "none" : subGrouping;
}

export function writeDisplay(display: DisplayOptions) {
  preferences.set(STORAGE_KEYS.tasksDisplay, JSON.stringify(display));
}

// Grouping and ordering

/// One list section or board column. At most one of `status`, `label` and `bucket`
/// is set, matching the grouping, so headers and new tasks can use it.
export interface TaskGroup {
  id: string;
  name: string;
  status?: TaskStatus;
  label?: Label;
  bucket?: DueBucket;
  tasks: Task[];
}

export function groupTasks(
  tasks: Task[],
  grouping: Grouping,
  statuses: TaskStatus[],
  labels: Label[],
): TaskGroup[] {
  switch (grouping) {
    case "status":
      return statuses.map((status) => ({
        id: status.id,
        name: status.name,
        status,
        tasks: tasks.filter((t) => t.statusId === status.id),
      }));
    case "label": {
      // A task with two labels shows up under both, as in Linear.
      const groups: TaskGroup[] = labels.map((label) => ({
        id: label.id,
        name: label.name,
        label,
        tasks: tasks.filter((t) => t.labelIds.includes(label.id)),
      }));
      groups.push({
        id: "no-label",
        name: "No label",
        tasks: tasks.filter((t) => t.labelIds.length === 0),
      });
      return groups;
    }
    case "start":
      return START_BUCKETS.map((b) => ({
        id: b.id,
        name: b.label,
        bucket: b.id,
        tasks: tasks.filter((t) => dayBucket(t.startDate) === b.id),
      }));
    case "due":
      return DUE_BUCKETS.map((b) => ({
        id: b.id,
        name: b.label,
        bucket: b.id,
        tasks: tasks.filter((t) => dueBucket(t.dueDate) === b.id),
      }));
    case "created":
      return AGE_BUCKETS.map((b) => ({
        id: b.id,
        name: b.label,
        tasks: tasks.filter((t) => ageBucket(t.entity.createdAt) === b.id),
      }));
    case "updated":
      return AGE_BUCKETS.map((b) => ({
        id: b.id,
        name: b.label,
        tasks: tasks.filter((t) => ageBucket(t.entity.updatedAt) === b.id),
      }));
    case "none":
      return [{ id: "all", name: "All tasks", tasks }];
  }
}

export function orderTasks(tasks: Task[], ordering: Ordering, statuses: TaskStatus[]): Task[] {
  const position = new Map(statuses.map((s) => [s.id, s.position]));
  const byCreated = (a: Task, b: Task) => b.entity.createdAt.localeCompare(a.entity.createdAt);
  const compare = {
    // Undated tasks sink to the bottom.
    due: (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byCreated(a, b),
    // Undated tasks sink to the bottom.
    start: (a, b) =>
      (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || byCreated(a, b),
    created: byCreated,
    updated: (a, b) => b.entity.updatedAt.localeCompare(a.entity.updatedAt),
    title: (a, b) =>
      displayTitle(a.entity).localeCompare(displayTitle(b.entity), undefined, {
        sensitivity: "base",
      }),
    status: (a, b) =>
      (position.get(a.statusId) ?? 0) - (position.get(b.statusId) ?? 0) || byCreated(a, b),
  } satisfies Record<Ordering, (a: Task, b: Task) => number>;
  return [...tasks].sort(compare[ordering]);
}

// Filters

/// Completed filter: when the task finished, or not at all.
export const COMPLETED_BUCKETS: { id: string; label: string }[] = [
  ...AGE_BUCKETS,
  { id: "none", label: "Not completed" },
];

export const NO_EFFORT = "none";

export function filterValues(task: Task, fieldId: string): string[] {
  if (fieldId === "status") return [task.statusId];
  if (fieldId === "labels") return task.labelIds;
  if (fieldId === "due") return [dueBucket(task.dueDate)];
  if (fieldId === "start") return [dayBucket(task.startDate)];
  if (fieldId === "created") return [ageBucket(task.entity.createdAt)];
  if (fieldId === "updated") return [ageBucket(task.entity.updatedAt)];
  if (fieldId === "completed") return [task.completedAt ? ageBucket(task.completedAt) : "none"];
  if (fieldId === "course") return task.courseIds;
  if (fieldId === "semester") return task.semesterIds;
  if (fieldId === "effort") return [task.effort == null ? NO_EFFORT : String(task.effort)];
  return [];
}

/// "is" keeps a task matching any chosen value, "is not" one matching none of them.
export function passesFilters(task: Task, filters: ActiveFilter[]): boolean {
  return filters.every((f) => {
    const hit = filterValues(task, f.fieldId).some((v) => f.values.includes(v));
    return f.operator === "is" ? hit : !hit;
  });
}
