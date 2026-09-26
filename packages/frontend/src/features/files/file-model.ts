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
import { useDateTimeSettings } from "#/lib/datetime.ts";
import type { FileEntity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { FILE_KINDS, fileKind } from "./file-kind";

export type Layout = "grid" | "list";
export type Grouping = "none" | "kind" | "added";
export type Ordering = "newest" | "oldest" | "name";

export interface DisplayOptions {
  layout: Layout;
  grouping: Grouping;
  ordering: Ordering;
}

export const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "none", label: "No grouping" },
  { id: "kind", label: "Kind" },
  { id: "added", label: "Date added" },
];

export const ORDERINGS: { id: Ordering; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "Name" },
];

const DEFAULT_DISPLAY: DisplayOptions = { layout: "grid", grouping: "none", ordering: "newest" };

export function readDisplay(): DisplayOptions {
  try {
    const raw = preferences.get(STORAGE_KEYS.filesDisplay);
    // SAFETY: only ever written by `writeDisplay`; unknown or missing fields fall
    // back to the defaults below.
    const stored = raw ? (JSON.parse(raw) as Partial<DisplayOptions>) : {};
    return {
      layout: stored.layout === "list" ? "list" : "grid",
      grouping: GROUPINGS.find((g) => g.id === stored.grouping)?.id ?? DEFAULT_DISPLAY.grouping,
      ordering: ORDERINGS.find((o) => o.id === stored.ordering)?.id ?? DEFAULT_DISPLAY.ordering,
    };
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
  const weekStartsOn = useDateTimeSettings.getState().dateFormat === "american" ? 0 : 1;
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
export function fileGroupDefs(grouping: Grouping): GroupDef<FileEntity>[] | null {
  if (grouping === "none") return null;
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
