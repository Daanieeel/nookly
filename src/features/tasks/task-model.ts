import type { ActiveFilter } from "@/components/filter-menu";
import type { Label, Task, TaskStatus } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { formatShortDate } from "@/lib/datetime";

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
  if (!dueDate) return "none";
  const days = daysUntil(dueDate, now);
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

// View tabs

export type TaskTab = "all" | "active" | "backlog";

export function statusInTab(
  statusId: string,
  tab: TaskTab,
  kindOf: (statusId: string) => StatusKind,
): boolean {
  const kind = kindOf(statusId);
  if (tab === "active") return kind === "unstarted" || kind === "started";
  if (tab === "backlog") return kind === "backlog";
  return true;
}

// Display options

export type Layout = "list" | "board";
export type Grouping = "status" | "label" | "due" | "none";
export type Ordering = "due" | "created" | "updated" | "title" | "status";
export type DisplayProperty = "key" | "status" | "labels" | "due" | "created";

export const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "label", label: "Label" },
  { id: "due", label: "Due date" },
  { id: "none", label: "No grouping" },
];

export const ORDERINGS: { id: Ordering; label: string }[] = [
  { id: "due", label: "Due date" },
  { id: "created", label: "Created" },
  { id: "updated", label: "Updated" },
  { id: "title", label: "Title" },
  { id: "status", label: "Status" },
];

export const DISPLAY_PROPERTIES: { id: DisplayProperty; label: string }[] = [
  { id: "key", label: "ID" },
  { id: "status", label: "Status" },
  { id: "labels", label: "Labels" },
  { id: "due", label: "Due date" },
  { id: "created", label: "Created" },
];

export interface DisplayOptions {
  tab: TaskTab;
  layout: Layout;
  grouping: Grouping;
  ordering: Ordering;
  /// Remembered per layout: a board shows every column, a list hides empty groups.
  showEmpty: Record<Layout, boolean>;
  properties: DisplayProperty[];
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  tab: "all",
  layout: "board",
  grouping: "status",
  ordering: "due",
  showEmpty: { board: true, list: false },
  properties: ["key", "status", "labels", "due", "created"],
};

function pick<T extends string>(value: string | undefined, allowed: { id: T }[], fallback: T): T {
  return allowed.find((a) => a.id === value)?.id ?? fallback;
}

const LAYOUTS: { id: Layout }[] = [{ id: "list" }, { id: "board" }];
const TABS: { id: TaskTab }[] = [{ id: "all" }, { id: "active" }, { id: "backlog" }];

/// Every field is checked again, so an outdated or hand edited value falls back to
/// its default instead of breaking the page.
export function readDisplay(): DisplayOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tasksDisplay);
    if (!raw) return DEFAULT_DISPLAY;
    // SAFETY: this key is only ever written by `writeDisplay` below, and every field
    // is validated before use, so a stale shape only loses that field.
    const stored = JSON.parse(raw) as Partial<DisplayOptions>;
    const layout = pick(stored.layout, LAYOUTS, DEFAULT_DISPLAY.layout);
    const grouping = pick(stored.grouping, GROUPINGS, DEFAULT_DISPLAY.grouping);
    const properties = Array.isArray(stored.properties) ? stored.properties : null;
    return {
      tab: pick(stored.tab, TABS, DEFAULT_DISPLAY.tab),
      layout,
      // A board always needs columns to group by.
      grouping: layout === "board" && grouping === "none" ? "status" : grouping,
      ordering: pick(stored.ordering, ORDERINGS, DEFAULT_DISPLAY.ordering),
      showEmpty: {
        board: stored.showEmpty?.board !== false,
        list: stored.showEmpty?.list === true,
      },
      properties: properties
        ? DISPLAY_PROPERTIES.filter((p) => properties.includes(p.id)).map((p) => p.id)
        : DEFAULT_DISPLAY.properties,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function writeDisplay(display: DisplayOptions) {
  try {
    localStorage.setItem(STORAGE_KEYS.tasksDisplay, JSON.stringify(display));
  } catch {
    // Preference only; the page still works without it.
  }
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
    case "due":
      return DUE_BUCKETS.map((b) => ({
        id: b.id,
        name: b.label,
        bucket: b.id,
        tasks: tasks.filter((t) => dueBucket(t.dueDate) === b.id),
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

export function filterValues(task: Task, fieldId: string): string[] {
  if (fieldId === "status") return [task.statusId];
  if (fieldId === "labels") return task.labelIds;
  if (fieldId === "due") return [dueBucket(task.dueDate)];
  return [];
}

/// "is" keeps a task matching any chosen value, "is not" one matching none of them.
export function passesFilters(task: Task, filters: ActiveFilter[]): boolean {
  return filters.every((f) => {
    const hit = filterValues(task, f.fieldId).some((v) => f.values.includes(v));
    return f.operator === "is" ? hit : !hit;
  });
}
