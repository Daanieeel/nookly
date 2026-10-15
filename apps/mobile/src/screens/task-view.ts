import type { LabelRecord, TaskRecord, TaskStatus } from "@nookly/shared/data";
import { z } from "zod";
import { addDays, localDay } from "./dates.ts";

/// How the Tasks list is shown: laid out as a list or a board, grouped, ordered and
/// filtered. Nothing here touches the data; it works on what a screen has loaded.

export const GROUPINGS = [
  { id: "status", label: "Status" },
  { id: "due", label: "Due date" },
  { id: "label", label: "Label" },
  { id: "space", label: "Space" },
  { id: "none", label: "No grouping" },
] as const;
export type Grouping = (typeof GROUPINGS)[number]["id"];

export const ORDERINGS = [
  { id: "due", label: "Due date" },
  { id: "created", label: "Created" },
  { id: "title", label: "Title" },
  { id: "status", label: "Status" },
] as const;
export type Ordering = (typeof ORDERINGS)[number]["id"];

export const displaySchema = z.object({
  layout: z.enum(["list", "board"]),
  grouping: z.enum(["status", "due", "label", "space", "none"]),
  ordering: z.enum(["due", "created", "title", "status"]),
  /// Statuses and labels a person narrowed the list to; empty means all.
  statuses: z.array(z.string()),
  labels: z.array(z.string()),
  /// Finished work hidden unless asked for.
  showFinished: z.boolean(),
});
export type TaskDisplay = z.infer<typeof displaySchema>;

export const DEFAULT_DISPLAY: TaskDisplay = {
  layout: "list",
  grouping: "status",
  ordering: "due",
  statuses: [],
  labels: [],
  showFinished: true,
};

export interface TaskGroup {
  id: string;
  title: string;
  tasks: TaskRecord[];
}

interface Context {
  statuses: TaskStatus[];
  labels: LabelRecord[];
  labelIdsOf: (taskId: string) => string[];
  spaces: { id: string; name: string }[];
  today?: string;
}

const finished = (task: TaskRecord, statuses: TaskStatus[]) =>
  (statuses.find((s) => s.id === task.statusId)?.doneness ?? 0) >= 100;

/// The tasks that pass the display's filters.
export function filterTasks(tasks: TaskRecord[], display: TaskDisplay, ctx: Context): TaskRecord[] {
  return tasks.filter((task) => {
    if (!display.showFinished && finished(task, ctx.statuses)) return false;
    if (display.statuses.length > 0 && !display.statuses.includes(task.statusId)) return false;
    if (display.labels.length > 0) {
      const mine = ctx.labelIdsOf(task.entity.id);
      if (!display.labels.some((l) => mine.includes(l))) return false;
    }
    return true;
  });
}

const statusOrder = (statuses: TaskStatus[]) => {
  const rank = new Map(
    [...statuses]
      .sort(
        (a, b) =>
          (a.doneness >= 100 ? 1 : 0) - (b.doneness >= 100 ? 1 : 0) || a.position - b.position,
      )
      .map((s, index) => [s.id, index]),
  );
  return (task: TaskRecord) => rank.get(task.statusId) ?? rank.size;
};

/// Sorted by the ordering; a task without a due date goes last, equal ones keep their order.
export function orderTasks(
  tasks: TaskRecord[],
  ordering: Ordering,
  statuses: TaskStatus[],
): TaskRecord[] {
  const rank = statusOrder(statuses);
  const compare = (a: TaskRecord, b: TaskRecord): number => {
    if (ordering === "title") return a.entity.title.localeCompare(b.entity.title);
    if (ordering === "created") return b.entity.createdAt.localeCompare(a.entity.createdAt);
    if (ordering === "status") return rank(a) - rank(b);
    if (a.dueDate === b.dueDate) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  };
  return [...tasks].sort(compare);
}

export const DUE_BUCKETS = [
  { id: "overdue", title: "Overdue" },
  { id: "today", title: "Due today" },
  { id: "week", title: "Next 7 days" },
  { id: "later", title: "Later" },
  { id: "none", title: "No due date" },
  // Finished past their date: kept out of Overdue so that bucket only holds real misses.
  { id: "done", title: "Done" },
] as const;

/// Where a due date falls, counted from today.
export function dueBucket(dueDate: string | null, done: boolean, today = localDay()) {
  if (!dueDate) return done ? "done" : "none";
  if (dueDate < today) return done ? "done" : "overdue";
  if (dueDate === today) return "today";
  return dueDate <= addDays(today, 7) ? "week" : "later";
}

/// The groups of a list or the columns of a board, in a stable order, empty ones left out.
export function groupTasks(tasks: TaskRecord[], display: TaskDisplay, ctx: Context): TaskGroup[] {
  const ordered = orderTasks(filterTasks(tasks, display, ctx), display.ordering, ctx.statuses);
  const nonEmpty = (groups: TaskGroup[]) => groups.filter((g) => g.tasks.length > 0);
  if (display.grouping === "none") {
    return ordered.length > 0 ? [{ id: "all", title: "Tasks", tasks: ordered }] : [];
  }
  if (display.grouping === "status") {
    return nonEmpty(
      [...ctx.statuses]
        .sort(
          (a, b) =>
            (a.doneness >= 100 ? 1 : 0) - (b.doneness >= 100 ? 1 : 0) || a.position - b.position,
        )
        .map((s) => ({
          id: s.id,
          title: s.name,
          tasks: ordered.filter((t) => t.statusId === s.id),
        })),
    );
  }
  if (display.grouping === "due") {
    return nonEmpty(
      DUE_BUCKETS.map((b) => ({
        id: b.id,
        title: b.title,
        tasks: ordered.filter(
          (t) => dueBucket(t.dueDate, finished(t, ctx.statuses), ctx.today) === b.id,
        ),
      })),
    );
  }
  if (display.grouping === "space") {
    return nonEmpty(
      ctx.spaces.map((s) => ({
        id: s.id,
        title: s.name,
        tasks: ordered.filter((t) => t.entity.spaceId === s.id),
      })),
    );
  }
  const none: TaskGroup = {
    id: "none",
    title: "No label",
    tasks: ordered.filter((t) => ctx.labelIdsOf(t.entity.id).length === 0),
  };
  return nonEmpty([
    ...ctx.labels.map((l) => ({
      id: l.id,
      title: l.name,
      tasks: ordered.filter((t) => ctx.labelIdsOf(t.entity.id).includes(l.id)),
    })),
    none,
  ]);
}

// --- saved views ---------------------------------------------------------------------

const storedView = z.object({
  filters: z
    .array(
      z.object({
        fieldId: z.string(),
        operator: z.string(),
        values: z.array(z.string()),
      }),
    )
    .catch([]),
  display: z
    .object({ layout: z.string(), grouping: z.string(), ordering: z.string() })
    .partial()
    .catch({}),
});

/// A saved View of the Tasks page as this phone's display: the status and label filters, the
/// layout, the grouping and the ordering it can show. What it can't show (a due date filter, a
/// grouping by start date) is named in `ignored`, so a person knows the list is wider than the
/// View on the computer.
export function displayFromView(
  raw: string,
  all: { statusIds: string[]; labelIds: string[] },
): { display: TaskDisplay; ignored: string[] } {
  let json: unknown = {};
  try {
    json = JSON.parse(raw);
  } catch {
    // An unreadable View opens as the defaults.
  }
  const stored = storedView.parse(json);
  const display: TaskDisplay = { ...DEFAULT_DISPLAY };
  const ignored: string[] = [];
  const pick = (all: string[], filter: { operator: string; values: string[] }) =>
    filter.operator === "isNot" ? all.filter((id) => !filter.values.includes(id)) : filter.values;
  for (const filter of stored.filters) {
    if (filter.fieldId === "status") display.statuses = pick(all.statusIds, filter);
    else if (filter.fieldId === "label") display.labels = pick(all.labelIds, filter);
    else ignored.push(filter.fieldId);
  }
  const { layout, grouping, ordering } = stored.display;
  if (layout === "list" || layout === "board") display.layout = layout;
  const g = GROUPINGS.find((x) => x.id === grouping);
  if (g) display.grouping = g.id;
  else if (grouping) ignored.push(`grouping by ${grouping}`);
  const o = ORDERINGS.find((x) => x.id === ordering);
  if (o) display.ordering = o.id;
  else if (ordering) ignored.push(`ordering by ${ordering}`);
  return { display, ignored };
}

/// The settings of a View saved from this phone, in the form the desktop reads.
export function viewConfigFromDisplay(display: TaskDisplay): string {
  return JSON.stringify({
    filters: [
      ...(display.statuses.length > 0
        ? [{ fieldId: "status", operator: "is", values: display.statuses }]
        : []),
      ...(display.labels.length > 0
        ? [{ fieldId: "label", operator: "is", values: display.labels }]
        : []),
    ],
    display: { layout: display.layout, grouping: display.grouping, ordering: display.ordering },
  });
}
