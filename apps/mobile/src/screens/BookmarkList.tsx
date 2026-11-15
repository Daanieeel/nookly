import { useRowEdge } from "../ui/row-edge.tsx";
import {
  type BookmarkRecord,
  type LabelRecord,
  createBookmark,
  setBookmarkMetadata,
} from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { CARD_CLASSES } from "@nookly/ui/classes";
import {
  IconBookmark,
  IconInfoCircle,
  IconLayoutGrid,
  IconLink,
  IconList,
  IconTag,
  IconWorld,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { z } from "zod";
import { fetchPageMetadata } from "../data/bookmark-fetch.ts";
import { useLocalWrite } from "../data/context.tsx";
import { useBookmarks, useLabels } from "../data/queries.ts";
import { usePreference } from "../data/preferences.ts";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { ListControls } from "../ui/ListControls.tsx";
import type { Option } from "../ui/sheet/OptionList.tsx";
import {
  ENTITY_FILTERS_NONE,
  ENTITY_FILTER_PICKS,
  useEntityFilters,
} from "../ui/entity-filters.tsx";
import { Empty, Section } from "../ui/Row.tsx";
import { DisplayGroup, LayoutTiles, SelectRow, SwitchRow } from "../ui/sheet/DisplayParts.tsx";
import { FloatingField, PASTE_BAR_ROOM } from "../ui/FloatingField.tsx";
import { localDay } from "./dates.ts";
import { labelOption } from "./option-badges.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

const hostOf = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0];

/// The Site filter's choices: each site with its icon, its address read for what matters
/// ("google.com") after the muted part every address has ("https://www."), searchable.
export function siteOptions(bookmarks: BookmarkRecord[]): Option[] {
  const sites = new Map<string, BookmarkRecord>();
  for (const b of bookmarks) {
    const host = hostOf(b.url);
    if (!sites.get(host)?.faviconUrl) sites.set(host, b);
  }
  return [...sites.entries()]
    .sort(([a], [b]) => a.replace(/^www\./, "").localeCompare(b.replace(/^www\./, "")))
    .map(([host, b]) => {
      const lead = /^(https?:\/\/)?(www\.)?/i.exec(b.url)?.[0] ?? "";
      return {
        id: host,
        prefix: lead || undefined,
        label: host.replace(/^www\./i, ""),
        keywords: [host],
        icon: <SiteIcon host={host} favicon={b.faviconUrl} />,
      };
    });
}

function SiteIcon({ host, favicon }: { host: string; favicon: string | null }) {
  const theme = useTheme();
  if (!favicon) return <IconWorld size={20} color={theme.colors.mutedForeground} />;
  return (
    <Image testID={`site-icon-${host}`} source={{ uri: favicon }} className="size-5 rounded" />
  );
}

/// A bookmark as a rich link card: the page's picture, its icon and title, what it says, its
/// host and when it was added. Tapping it opens the link; the button in the corner opens its
/// details.
function BookmarkCard({
  bookmark,
  preview,
  description,
}: {
  bookmark: BookmarkRecord;
  preview: boolean;
  description: boolean;
}) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const added = new Date(bookmark.entity.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return (
    <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden py-0")}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={bookmark.entity.title}
        onPress={() => void Linking.openURL(bookmark.url)}
        onLongPress={() => entityMenu(bookmark.entity)}
        className="active:opacity-80"
      >
        {preview ? (
          <View className="aspect-[1.91] items-center justify-center bg-muted">
            {bookmark.previewImageUrl ? (
              <Image
                source={{ uri: bookmark.previewImageUrl }}
                resizeMode="cover"
                className="size-full"
              />
            ) : (
              <IconBookmark size={32} color={theme.colors.mutedForeground} />
            )}
          </View>
        ) : null}
        <View className="gap-1 p-3">
          <View className="flex-row items-center gap-2 pr-8">
            {bookmark.faviconUrl ? (
              <Image source={{ uri: bookmark.faviconUrl }} className="size-4 rounded" />
            ) : null}
            <Text numberOfLines={1} className="flex-1 font-medium">
              {bookmark.entity.title}
            </Text>
          </View>
          {description && bookmark.description ? (
            <Text variant="small" tone="muted" numberOfLines={2}>
              {bookmark.description}
            </Text>
          ) : null}
          <Text variant="small" tone="muted" numberOfLines={1}>
            {`${hostOf(bookmark.url)} · ${added}`}
          </Text>
        </View>
      </Pressable>
      <View className="absolute right-1 top-1">
        <IconButton
          label={`Details of ${bookmark.entity.title}`}
          icon={<IconInfoCircle size={20} color={theme.colors.mutedForeground} />}
          onPress={() => router.push(`/entity/${bookmark.entity.id}`)}
        />
      </View>
    </View>
  );
}

const displaySchema = z.object({
  layout: z.enum(["grid", "list"]),
  grouping: z.enum(["none", "site", "label", "added"]),
  ordering: z.enum(["newest", "oldest", "title"]),
  /// Grid cards show the page's picture.
  showPreviews: z.boolean(),
  showDescriptions: z.boolean(),
  /// Labels and sites the list is narrowed to; empty means all.
  labels: z.array(z.string()),
  sites: z.array(z.string()),
  ...ENTITY_FILTER_PICKS,
});
type Display = z.infer<typeof displaySchema>;
const DEFAULT: Display = {
  layout: "grid",
  grouping: "none",
  ordering: "newest",
  showPreviews: true,
  showDescriptions: true,
  labels: [],
  sites: [],
  ...ENTITY_FILTERS_NONE,
};

const GROUPINGS = [
  { id: "none", label: "No grouping" },
  { id: "site", label: "Site" },
  { id: "label", label: "Label" },
  { id: "added", label: "Date added" },
] as const;
const ORDERINGS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "title", label: "Title" },
] as const;

const ADDED = [
  { id: "today", title: "Today", within: 0 },
  { id: "week", title: "This week", within: 6 },
  { id: "month", title: "This month", within: 30 },
  { id: "earlier", title: "Earlier", within: Infinity },
];

/// Which "Date added" group a bookmark falls in, by whole days before `today`.
function addedBucket(b: BookmarkRecord, today: string): string {
  const days = Math.round(
    (Date.parse(today) - Date.parse(localDay(new Date(b.entity.createdAt)))) / 86_400_000,
  );
  return ADDED.find((x) => days <= x.within)?.id ?? "earlier";
}

/// Bookmarks in the order and groups picked, as the desktop's `bookmark-model.ts`.
export function bookmarkGroups(
  bookmarks: BookmarkRecord[],
  display: Pick<Display, "grouping" | "ordering">,
  labels: LabelRecord[],
  today = localDay(),
): { id: string; title: string | null; items: BookmarkRecord[] }[] {
  const ordered = [...bookmarks].sort((a, b) =>
    display.ordering === "title"
      ? a.entity.title.localeCompare(b.entity.title)
      : display.ordering === "oldest"
        ? a.entity.createdAt.localeCompare(b.entity.createdAt)
        : b.entity.createdAt.localeCompare(a.entity.createdAt),
  );
  const groups =
    display.grouping === "site"
      ? [...new Set(ordered.map((b) => hostOf(b.url)))].map((host) => ({
          id: host,
          title: host,
          match: (b: BookmarkRecord) => hostOf(b.url) === host,
        }))
      : display.grouping === "label"
        ? [
            ...labels.map((l) => ({
              id: l.id,
              title: l.name,
              match: (b: BookmarkRecord) => b.labelIds.includes(l.id),
            })),
            {
              id: "none",
              title: "No label",
              match: (b: BookmarkRecord) => b.labelIds.length === 0,
            },
          ]
        : display.grouping === "added"
          ? ADDED.map((bucket) => ({
              id: bucket.id,
              title: bucket.title,
              match: (b: BookmarkRecord) => addedBucket(b, today) === bucket.id,
            }))
          : [{ id: "all", title: null, match: () => true }];
  return groups
    .map((g) => ({ id: g.id, title: g.title, items: ordered.filter(g.match) }))
    .filter((g) => g.items.length > 0);
}

/// A bookmark as a row of the list layout: its icon, title and site.
function BookmarkRow({
  bookmark,
  description,
}: {
  bookmark: BookmarkRecord;
  description: boolean;
}) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const edge = useRowEdge();
  return (
    <View style={edge} className="flex-row items-center gap-3 py-2">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={bookmark.entity.title}
        onPress={() => void Linking.openURL(bookmark.url)}
        onLongPress={() => entityMenu(bookmark.entity)}
        className="min-h-11 flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        {bookmark.faviconUrl ? (
          <Image source={{ uri: bookmark.faviconUrl }} className="size-5 rounded" />
        ) : (
          <IconLink size={20} color={theme.colors.mutedForeground} />
        )}
        <View className="flex-1">
          <Text numberOfLines={1} className="font-medium">
            {bookmark.entity.title}
          </Text>
          {description && bookmark.description ? (
            <Text variant="small" tone="muted" numberOfLines={1}>
              {bookmark.description}
            </Text>
          ) : null}
          <Text variant="small" tone="muted" numberOfLines={1}>
            {hostOf(bookmark.url)}
          </Text>
        </View>
      </Pressable>
      <IconButton
        label={`Details of ${bookmark.entity.title}`}
        icon={<IconInfoCircle size={20} color={theme.colors.mutedForeground} />}
        onPress={() => router.push(`/entity/${bookmark.entity.id}`)}
      />
    </View>
  );
}

/// A Space's Bookmarks as rich link cards or a list, filtered, grouped and ordered as on
/// the desktop. The bar to paste a URL floats under the page (`BookmarkPasteBar`).
export function BookmarkList({ spaceId }: { spaceId: string }) {
  const { data: bookmarks = [] } = useBookmarks(spaceId);
  const { data: labels = [] } = useLabels(spaceId);
  const [display, setDisplay] = usePreference<Display>(
    `bookmarks.display.${spaceId}`,
    displaySchema,
    DEFAULT,
  );
  const used = labels.filter((l) => bookmarks.some((b) => b.labelIds.includes(l.id)));
  const own = useEntityFilters(display, (next) => setDisplay({ ...display, ...next }));
  const shown = bookmarks.filter(
    (b) =>
      (display.labels.length === 0 || display.labels.some((id) => b.labelIds.includes(id))) &&
      (display.sites.length === 0 || display.sites.includes(hostOf(b.url))) &&
      own.passes(b.entity),
  );
  const groups = bookmarkGroups(shown, display, labels);
  return (
    <View className="gap-4">
      <ListControls
        title="Bookmarks"
        count={bookmarks.length}
        filters={[
          {
            label: "Labels",
            icon: IconTag,
            values: display.labels,
            options: used.map(labelOption),
            onChange: (next) => setDisplay({ ...display, labels: next }),
          },
          {
            label: "Site",
            icon: IconWorld,
            values: display.sites,
            options: siteOptions(bookmarks),
            search: true,
            onChange: (next) => setDisplay({ ...display, sites: next }),
          },
          ...own.fields,
        ]}
        display={
          <View className="gap-3">
            <LayoutTiles
              tiles={[
                { id: "grid", label: "Grid", icon: IconLayoutGrid },
                { id: "list", label: "List", icon: IconList },
              ]}
              value={display.layout}
              onSelect={(layout) => setDisplay({ ...display, layout })}
            />
            <DisplayGroup>
              <SelectRow
                label="Grouping"
                value={display.grouping}
                options={[...GROUPINGS]}
                onChange={(grouping) => setDisplay({ ...display, grouping })}
              />
              <SelectRow
                label="Ordering"
                value={display.ordering}
                options={[...ORDERINGS]}
                onChange={(ordering) => setDisplay({ ...display, ordering })}
              />
            </DisplayGroup>
            <DisplayGroup>
              {display.layout === "grid" ? (
                <SwitchRow
                  label="Preview images"
                  value={display.showPreviews}
                  onChange={(showPreviews) => setDisplay({ ...display, showPreviews })}
                />
              ) : null}
              <SwitchRow
                label="Descriptions"
                value={display.showDescriptions}
                onChange={(showDescriptions) => setDisplay({ ...display, showDescriptions })}
              />
            </DisplayGroup>
          </View>
        }
      />
      {bookmarks.length === 0 ? (
        <Text tone="muted" className="p-4 text-center">
          No bookmarks yet. Paste a URL below to save one.
        </Text>
      ) : groups.length === 0 ? (
        <Empty text="No bookmarks match these filters." />
      ) : (
        groups.map((group) => (
          <Section key={group.id} title={group.title ?? undefined}>
            {display.layout === "grid" ? (
              <Grid min={280} max={3}>
                {group.items.map((b) => (
                  <BookmarkCard
                    key={b.entity.id}
                    bookmark={b}
                    preview={display.showPreviews}
                    description={display.showDescriptions}
                  />
                ))}
              </Grid>
            ) : (
              group.items.map((b) => (
                <BookmarkRow
                  key={b.entity.id}
                  bookmark={b}
                  description={display.showDescriptions}
                />
              ))
            )}
          </Section>
        ))
      )}
      {/* Room for the paste bar floating over the end of the list. */}
      <View style={{ height: PASTE_BAR_ROOM }} />
    </View>
  );
}

/// The bar to paste a URL, floating at the bottom of the bookmarks like the desktop's, its
/// corners following the phone's. Saving reads the page for its title, icon, picture and
/// description once there is a connection.
export function BookmarkPasteBar({ spaceId }: { spaceId: string }) {
  const [url, setUrl] = useState("");
  const read = useReadBookmarkPage();
  const save = useLocalWrite(async (db, address: string) => {
    const link = bookmarkLink(address);
    return { id: await createBookmark(db, spaceId, link), link };
  });
  const submit = () =>
    url.trim() &&
    save.mutate(url, {
      onSuccess: (made) => {
        setUrl("");
        read.mutate(made);
      },
    });
  return (
    <FloatingField
      label="Paste a URL to save it"
      sendLabel="Save Bookmark"
      value={url}
      onChangeText={setUrl}
      onSubmit={submit}
      error={save.error?.message}
    />
  );
}

/// A typed address as a link: `https://` in front when it has no scheme of its own.
export function bookmarkLink(address: string): string {
  const trimmed = address.trim();
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/// Reads a new bookmark's page after it is saved, for its title, picture and description;
/// offline it is read when the bookmark is opened.
export function useReadBookmarkPage() {
  return useLocalWrite(async (db, input: { id: string; link: string }) =>
    setBookmarkMetadata(db, input.id, await fetchPageMetadata(input.link)),
  );
}
