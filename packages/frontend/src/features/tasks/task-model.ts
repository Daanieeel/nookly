import {
  IconBan,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCircleDot,
  IconClockEdit,
  IconFolder,
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
import { normalizeBaseDisplay, readStoredDisplay } from "#/lib/display-options.ts";
import { AGE_BUCKETS, ageBucket } from "#/features/assignments/assignment-model.ts";
import { type DisplaySummary, type ViewPreset, is, isNot } from "#/features/views/view-presets.ts";

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

export { validSubGrouping } from "#/lib/display-options.ts";

export type Layout = "list" | "board";
export type Grouping =
  | "status"
  | "label"
  | "space"
  | "start"
  | "due"
  | "created"
  | "updated"
  | "none";
export type Ordering = "due" | "start" | "created" | "updated" | "title" | "status";
export type DisplayProperty = "key" | "status" | "labels" | "due" | "effort" | "created";

export const GROUPINGS: { id: Grouping; label: string; icon: TablerIcon }[] = [
  { id: "status", label: "Status", icon: IconCircleDot },
  { id: "label", label: "Label", icon: IconTag },
  { id: "space", label: "Space", icon: IconFolder },
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

/// Every field is checked again, so an outdated or hand edited value falls back to
/// its default instead of breaking the page.
export function readDisplay(): DisplayOptions {
  return readStoredDisplay(STORAGE_KEYS.tasksDisplay, normalizeDisplay, DEFAULT_DISPLAY);
}

/// Checks every field of a stored `DisplayOptions` (the remembered page display or a
/// saved View's), falling back to the default for any that is missing or invalid.
export function normalizeDisplay(stored: Partial<DisplayOptions>): DisplayOptions {
  try {
    const properties = Array.isArray(stored.properties) ? stored.properties : null;
    return {
      ...normalizeBaseDisplay(stored, DEFAULT_DISPLAY, GROUPINGS, ORDERINGS),
      properties: properties
        ? DISPLAY_PROPERTIES.filter((p) => properties.includes(p.id)).map((p) => p.id)
        : DEFAULT_DISPLAY.properties,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function writeDisplay(display: DisplayOptions) {
  preferences.set(STORAGE_KEYS.tasksDisplay, JSON.stringify(display));
}

/// The cross-Space overview opens as a list grouped by due date.
export const OVERVIEW_DISPLAY: DisplayOptions = {
  ...DEFAULT_DISPLAY,
  layout: "list",
  grouping: "due",
  properties: DEFAULT_DISPLAY.properties.filter((p) => p !== "labels"),
};

export function readOverviewDisplay(): DisplayOptions {
  return readStoredDisplay(STORAGE_KEYS.tasksOverview, normalizeDisplay, OVERVIEW_DISPLAY);
}

export function writeOverviewDisplay(display: DisplayOptions) {
  preferences.set(STORAGE_KEYS.tasksOverview, JSON.stringify(display));
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
    // Spaces only group on the cross-Space overview, through `taskGroupDefs`.
    case "space":
      return [{ id: "all", name: "All tasks", tasks }];
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
  if (fieldId === "space") return [task.entity.spaceId];
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

// View presets

/// Ready made Views, aimed at keeping Done and Cancelled usable once they pile up.
/// They name the default statuses, so a preset whose status was deleted shows nothing.
export const TASK_VIEW_PRESETS: ViewPreset<DisplayOptions>[] = [
  {
    name: "Current",
    icon: "Target",
    color: "#3b82f6",
    description:
      "What is on this week as a board, without done or cancelled tasks or their columns.",
    filters: [isNot("status", "done", "cancelled"), is("due", "today", "week")],
    display: normalizeDisplay({
      layout: "board",
      grouping: "status",
      hiddenColumns: ["done", "cancelled"],
    }),
  },
  {
    name: "Backlog",
    icon: "Checklist",
    color: "#64748b",
    description: "Backlog and Todo as a board, grouped by due date. Whatever is not up yet.",
    filters: [is("status", "backlog", "todo")],
    display: normalizeDisplay({ layout: "board", grouping: "due" }),
  },
  {
    name: "Recently done",
    icon: "Sparkles",
    color: "#22c55e",
    description: "Done this week, newest change first.",
    filters: [is("status", "done"), is("completed", "today", "week")],
    display: normalizeDisplay({ layout: "list", grouping: "none", ordering: "updated" }),
  },
  {
    name: "Done, older",
    icon: "Trophy",
    color: "#a855f7",
    description: "Done before this week, grouped by when it last changed.",
    filters: [is("status", "done"), is("completed", "last", "earlier")],
    display: normalizeDisplay({ layout: "list", grouping: "updated", ordering: "updated" }),
  },
  {
    name: "Cancelled",
    icon: "Flag",
    color: "#ef4444",
    description: "Only cancelled tasks. Rarely opened, so a view instead of a column.",
    filters: [is("status", "cancelled")],
    display: normalizeDisplay({ layout: "list", grouping: "none" }),
  },
  {
    name: "No due date",
    icon: "CalendarStats",
    color: "#f59e0b",
    description: "Open tasks without a due date, so none slip through.",
    filters: [isNot("status", "done", "cancelled"), is("due", "none")],
    display: normalizeDisplay({ layout: "list", grouping: "none" }),
  },
];

export function describeDisplay(display: DisplayOptions): DisplaySummary {
  return {
    layout: display.layout,
    grouping: display.grouping === "none" ? null : labelOf(GROUPINGS, display.grouping),
    ordering: labelOf(ORDERINGS, display.ordering),
  };
}

function labelOf<T extends string>(items: { id: T; label: string }[], id: T): string {
  return items.find((i) => i.id === id)?.label ?? id;
}
