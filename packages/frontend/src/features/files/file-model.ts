import {
  format,
  getYear,
  isSameMonth,
  isSameWeek,
  isToday,
  isYesterday,
  parseISO,
  subMonths,
} from "date-fns";
import type { GroupDef } from "#/components/grouped-view/grouping.ts";
import { currentWeekStartsOn } from "#/lib/week-start.ts";
import type { ReindexProgress } from "#/lib/api/files.ts";
import type { FileEntity, Label } from "#/lib/api/types.ts";
import { UNLABELLED } from "@nookly/shared/label-shelf";
import { type DisplaySummary, type ViewPreset, is } from "#/features/views/view-presets.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { normalizeCardDisplay } from "#/lib/display-options.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { FILE_KINDS, fileKind } from "./file-kind";

type Layout = "grid" | "list";
export type Grouping = "none" | "kind" | "added" | "label";
export type Ordering = "newest" | "oldest" | "name";

export interface DisplayOptions {
  layout: Layout;
  grouping: Grouping;
  ordering: Ordering;
  /// The labels picked on the shelf (D74), every one on a file, or `UNLABELLED`.
  shelf: string[];
}

export const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "none", label: "No grouping" },
  { id: "kind", label: "Kind" },
  { id: "added", label: "Date added" },
  { id: "label", label: "Label" },
];

export const ORDERINGS: { id: Ordering; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "Name" },
];

const DEFAULT_DISPLAY: DisplayOptions = {
  layout: "grid",
  grouping: "none",
  ordering: "newest",
  shelf: [],
};

/// A stored or saved display, field by field, the defaults for what is missing or unreadable.
export function normalizeDisplay(stored: Partial<DisplayOptions>): DisplayOptions {
  const shelf = Array.isArray(stored.shelf)
    ? stored.shelf.filter((id): id is string => typeof id === "string")
    : [];
  return { ...normalizeCardDisplay(stored, DEFAULT_DISPLAY, GROUPINGS, ORDERINGS), shelf };
}

export function readDisplay(): DisplayOptions {
  try {
    const raw = preferences.get(STORAGE_KEYS.filesDisplay);
    // SAFETY: only ever written by `writeDisplay`; unknown or missing fields fall
    // back to the defaults below.
    const stored = raw ? (JSON.parse(raw) as Partial<DisplayOptions>) : {};
    return normalizeDisplay(stored);
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function writeDisplay(display: DisplayOptions) {
  preferences.set(STORAGE_KEYS.filesDisplay, JSON.stringify(display));
}

export function orderFiles(files: FileEntity[], ordering: Ordering): FileEntity[] {
  const sorted = [...files];
  if (ordering === "name") {
    return sorted.sort((a, b) => displayTitle(a.entity).localeCompare(displayTitle(b.entity)));
  }
  sorted.sort((a, b) => b.entity.createdAt.localeCompare(a.entity.createdAt));
  return ordering === "oldest" ? sorted.reverse() : sorted;
}

/// How many individual prior-year buckets "Date added" shows before
/// collapsing the rest into "Earlier" (e.g. 2025, 2024, 2023, 2022, 2021).
const YEAR_BUCKETS_BACK = 5;

interface AddedBucket {
  id: string;
  name: string;
  match: (date: Date) => boolean;
}

/// Today, Yesterday, This week, This month, Last month, each remaining month
/// of this year, each of the last `YEAR_BUCKETS_BACK` years, then a catch-all
/// Earlier — calendar relative to `now`, so this is generated fresh on every
/// call rather than a static table, since which month or year "this year" and
/// "N years back" mean depends on when it's called.
function addedBuckets(now: Date): AddedBucket[] {
  const weekStartsOn = currentWeekStartsOn();
  const lastMonth = subMonths(now, 1);
  const thisYear = getYear(now);

  const buckets: AddedBucket[] = [
    { id: "today", name: "Today", match: isToday },
    { id: "yesterday", name: "Yesterday", match: isYesterday },
    { id: "week", name: "This week", match: (d) => isSameWeek(d, now, { weekStartsOn }) },
    { id: "month", name: "This month", match: (d) => isSameMonth(d, now) },
    { id: "last-month", name: "Last month", match: (d) => isSameMonth(d, lastMonth) },
  ];

  // Remaining months of this year, most recent first, back to January —
  // "this month" and "last month" above already cover the two most recent.
  for (let month = now.getMonth() - 2; month >= 0; month--) {
    const at = new Date(thisYear, month, 1);
    buckets.push({
      id: `month-${thisYear}-${month}`,
      name: format(at, "MMMM"),
      match: (d) => d.getFullYear() === thisYear && d.getMonth() === month,
    });
  }

  // Each prior year on its own, most recent first.
  for (let back = 1; back <= YEAR_BUCKETS_BACK; back++) {
    const year = thisYear - back;
    buckets.push({
      id: `year-${year}`,
      name: String(year),
      match: (d) => d.getFullYear() === year,
    });
  }

  buckets.push({ id: "earlier", name: "Earlier", match: () => true });
  return buckets;
}

/// Groups for `grouping`, or null without grouping.
export function fileGroupDefs(
  grouping: Grouping,
  labels: Label[] = [],
): GroupDef<FileEntity>[] | null {
  if (grouping === "none") return null;
  if (grouping === "label") {
    return [
      ...labels.map((label) => ({
        id: label.id,
        name: label.name,
        match: (f: FileEntity) => f.labelIds.includes(label.id),
      })),
      { id: UNLABELLED, name: "No label", match: (f: FileEntity) => f.labelIds.length === 0 },
    ];
  }
  if (grouping === "kind") {
    return FILE_KINDS.map((kind) => ({
      id: kind.id,
      name: kind.label,
      match: (f) => fileKind(f).id === kind.id,
    }));
  }
  const buckets = addedBuckets(new Date());
  const bucketOf = (f: FileEntity) => {
    const date = parseISO(f.entity.createdAt);
    return buckets.find((b) => b.match(date))?.id ?? "earlier";
  };
  return buckets.map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    match: (f) => bucketOf(f) === bucket.id,
  }));
}

/// The reindex button's text: how far along it is while running.
export function reindexLabel(progress: ReindexProgress | null): string {
  if (!progress) return "Reindex";
  return progress.total > 0 ? `Reindexing ${progress.done} of ${progress.total}` : "Reindexing";
}

/// Ready made Files Views (D74): the files waiting for a label, and the pinned ones.
export const FILE_VIEW_PRESETS: ViewPreset<DisplayOptions>[] = [
  {
    name: "Unlabelled",
    icon: "Flag",
    color: "#f59e0b",
    description: "Files without a label yet, newest first, so they are easy to sort.",
    filters: [],
    display: { ...DEFAULT_DISPLAY, layout: "list", shelf: [UNLABELLED] },
  },
  {
    name: "Pinned",
    icon: "Star",
    color: "#3b82f6",
    description: "The files you pinned, grouped by label.",
    filters: [is("pinned", "pinned")],
    display: { ...DEFAULT_DISPLAY, grouping: "label" },
  },
];

/// How a Files display reads in a View's summary.
export function describeFileDisplay(display: DisplayOptions): DisplaySummary {
  return {
    layout: display.layout === "grid" ? "board" : "list",
    grouping: display.grouping === "none" ? null : display.grouping,
    ordering: display.ordering,
  };
}
