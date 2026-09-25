import { differenceInCalendarDays, parseISO } from "date-fns";
import type { GroupDef } from "#/components/grouped-view/grouping.ts";
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

const ADDED_BUCKETS: { id: string; name: string; within: number }[] = [
  { id: "today", name: "Today", within: 0 },
  { id: "week", name: "This week", within: 6 },
  { id: "month", name: "This month", within: 30 },
  { id: "earlier", name: "Earlier", within: Infinity },
];

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
  const now = new Date();
  const bucketOf = (f: FileEntity) => {
    const days = differenceInCalendarDays(now, parseISO(f.entity.createdAt));
    return ADDED_BUCKETS.find((b) => days <= b.within)?.id ?? "earlier";
  };
  return ADDED_BUCKETS.map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    match: (f) => bucketOf(f) === bucket.id,
  }));
}
