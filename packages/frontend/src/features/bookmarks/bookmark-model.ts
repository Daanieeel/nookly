import { labelColorFor } from "#/components/label-manager.tsx";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { GroupDef } from "#/components/grouped-view/grouping.ts";
import { captureBookmarkScreenshot } from "#/lib/api/bookmarks.ts";
import { attachLabel, createLabel, detachLabel, listLabels } from "#/lib/api/labels.ts";
import type { Bookmark, Label } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

/// "example.com" for `https://www.example.com/a/b`, the raw text if it isn't a URL.
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type Layout = "grid" | "list";
export type Grouping = "none" | "site" | "label" | "added";
export type Ordering = "newest" | "oldest" | "title";

export interface DisplayOptions {
  layout: Layout;
  grouping: Grouping;
  ordering: Ordering;
  /// Grid cards show the page's preview image.
  showPreviews: boolean;
  showDescriptions: boolean;
}

export const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "none", label: "No grouping" },
  { id: "site", label: "Site" },
  { id: "label", label: "Label" },
  { id: "added", label: "Date added" },
];

export const ORDERINGS: { id: Ordering; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "title", label: "Title" },
];

const DEFAULT_DISPLAY: DisplayOptions = {
  layout: "grid",
  grouping: "none",
  ordering: "newest",
  showPreviews: true,
  showDescriptions: true,
};

export function readDisplay(): DisplayOptions {
  try {
    const raw = preferences.get(STORAGE_KEYS.bookmarksDisplay);
    // SAFETY: only ever written by `writeDisplay`; unknown or missing fields fall
    // back to the defaults below.
    const stored = raw ? (JSON.parse(raw) as Partial<DisplayOptions>) : {};
    return {
      layout: stored.layout === "list" ? "list" : "grid",
      grouping: GROUPINGS.find((g) => g.id === stored.grouping)?.id ?? DEFAULT_DISPLAY.grouping,
      ordering: ORDERINGS.find((o) => o.id === stored.ordering)?.id ?? DEFAULT_DISPLAY.ordering,
      showPreviews: stored.showPreviews ?? DEFAULT_DISPLAY.showPreviews,
      showDescriptions: stored.showDescriptions ?? DEFAULT_DISPLAY.showDescriptions,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function writeDisplay(display: DisplayOptions) {
  preferences.set(STORAGE_KEYS.bookmarksDisplay, JSON.stringify(display));
}

/// What a card calls the bookmark: the title typed or fetched, else the page's own.
export function bookmarkTitle(bookmark: Bookmark): string {
  const title = displayTitle(bookmark.entity);
  return title === bookmark.url && bookmark.fetchedTitle ? bookmark.fetchedTitle : title;
}

export function orderBookmarks(bookmarks: Bookmark[], ordering: Ordering): Bookmark[] {
  const sorted = [...bookmarks];
  if (ordering === "title") {
    return sorted.sort((a, b) => bookmarkTitle(a).localeCompare(bookmarkTitle(b)));
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

function addedBucket(bookmark: Bookmark, now: Date): string {
  const days = differenceInCalendarDays(now, parseISO(bookmark.entity.createdAt));
  return ADDED_BUCKETS.find((b) => days <= b.within)?.id ?? "earlier";
}

/// Groups for `grouping`, or null without grouping. Site groups are the hosts
/// present, in order of first appearance.
export function bookmarkGroupDefs(
  grouping: Grouping,
  bookmarks: Bookmark[],
  labels: Label[],
): GroupDef<Bookmark>[] | null {
  if (grouping === "none") return null;
  if (grouping === "site") {
    const hosts = [...new Set(bookmarks.map((b) => hostOf(b.url)))];
    return hosts.map((host) => ({
      id: host,
      name: host,
      match: (b) => hostOf(b.url) === host,
    }));
  }
  if (grouping === "label") {
    return [
      ...labels.map((label) => ({
        id: label.id,
        name: label.name,
        match: (b: Bookmark) => b.labelIds.includes(label.id),
      })),
      { id: "no-label", name: "No label", match: (b) => b.labelIds.length === 0 },
    ];
  }
  const now = new Date();
  return ADDED_BUCKETS.map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    match: (b) => addedBucket(b, now) === bucket.id,
  }));
}

export function useSpaceLabels(spaceId: string): Label[] {
  const { data = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
  });
  return data;
}

/// Toggling and creating one bookmark's labels, refreshing the lists that show them.
export function useBookmarkLabels(bookmark: Bookmark) {
  const queryClient = useQueryClient();
  const { entity } = bookmark;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bookmark", entity.id] }),
      queryClient.invalidateQueries({ queryKey: ["bookmarks", entity.spaceId] }),
      queryClient.invalidateQueries({ queryKey: ["labels", entity.spaceId] }),
    ]);
  const toggle = useMutation({
    mutationFn: async (labelId: string) => {
      if (bookmark.labelIds.includes(labelId)) await detachLabel(entity.id, labelId);
      else await attachLabel(entity.id, labelId);
    },
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: async (name: string) => {
      const label = await createLabel(entity.spaceId, name, labelColorFor(name));
      await attachLabel(entity.id, label.id);
    },
    onSuccess: refresh,
  });
  return { toggle, create };
}

const CAPTURE_KEY = ["bookmark-screenshot"];

/// Captures a page snapshot, refreshing the lists that show the bookmark. Runs
/// quietly: a failed capture leaves the `og:image` in place.
export function useCaptureScreenshot(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CAPTURE_KEY,
    mutationFn: (entityId: string) => captureBookmarkScreenshot(entityId),
    onSettled: (_, __, entityId) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bookmark", entityId] }),
        queryClient.invalidateQueries({ queryKey: ["bookmarks", spaceId] }),
      ]),
  });
}

/// True while this bookmark's page is being captured, wherever it was started.
export function useCapturing(entityId: string): boolean {
  return (
    useIsMutating({
      mutationKey: CAPTURE_KEY,
      predicate: (m) => m.state.variables === entityId,
    }) > 0
  );
}
