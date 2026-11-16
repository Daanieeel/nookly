import { type Column, DataTable } from "../ui/DataTable.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { FixedTop } from "../ui/fixed-top.tsx";
import { SaveBar } from "../ui/SaveBar.tsx";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { ListEmpty } from "../ui/ListEmpty.tsx";
import { EmptyState } from "../ui/kit/States.tsx";
import type { PageSummary } from "@nookly/shared/data";
import { RowDivider, useRowEdge } from "../ui/row-edge.tsx";
import { useStaged } from "../ui/staged.ts";
import { DATE_WINDOW_OPTIONS, withinWindows } from "../ui/filter-windows.ts";
import { notePreviewText } from "@nookly/frontend/lib/note-preview";
import { IconClock, IconLink, IconSchool, IconTag } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { usePageSummaries } from "../data/queries.ts";
import { Badge } from "../ui/Badge.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { ListGroup, ListItem } from "../ui/ListMotion.tsx";
import { FilterField, Presets } from "../ui/ListBar.tsx";
import { ListControls } from "../ui/ListControls.tsx";
import {
  ENTITY_FILTERS_NONE,
  ENTITY_FILTER_PICKS,
  useEntityFilters,
} from "../ui/entity-filters.tsx";
import { DisplayGroup, SelectRow } from "../ui/sheet/DisplayParts.tsx";
import { useDraftPreference } from "../data/preferences.ts";
import { z } from "zod";
import { labelOption } from "./option-badges.tsx";
import { cn } from "../ui/classes.ts";
import { Text } from "../ui/Text.tsx";
import { ago, localDay, addDays } from "./dates.ts";
import { useEntityMenu } from "./entity-actions.tsx";
import { EntitySwipe } from "./EntitySwipe.tsx";

/// A page's row in a list, as the desktop's table gives it: the key, the title, the start of
/// its text and its labels, with when it was last edited at the right. A long press opens
/// the item's menu, the desktop's right click.
function PageRow({ page, jot }: { page: PageSummary; jot: boolean }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const { entity } = page;
  const title = entity.title.trim();
  const preview = notePreviewText(page.preview, title);
  const empty = jot && !title && !preview;
  const edge = useRowEdge({ inSwipeRow: true });
  return (
    <EntitySwipe entity={entity}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title || preview || (jot ? "Nothing written yet" : "Untitled")}
        onPress={() => router.push(`/entity/${entity.id}`)}
        onLongPress={() => entityMenu(entity)}
        style={edge}
        className="gap-1 py-3 active:bg-accent/40"
      >
        <View className="flex-row items-center gap-3">
          <EntityIcon type={entity.type} icon={entity.icon} />
          <Text
            numberOfLines={1}
            className={cn(
              "flex-1 font-medium",
              empty && "font-normal italic text-muted-foreground",
            )}
          >
            {title || preview || (jot ? "Nothing written yet" : "Untitled")}
          </Text>
          <Text variant="small" tone="muted">
            {ago(entity.updatedAt)}
          </Text>
        </View>
        {preview && title ? (
          <Text variant="small" tone="muted" numberOfLines={1} className="pl-8">
            {preview}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-2 pl-8">
          <Text variant="small" tone="muted">
            {entity.key}
          </Text>
          {page.labels.map((label) => (
            <Badge key={label.id} label={label.name} size="sm" />
          ))}
          {page.refinedInto ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Refined into ${page.refinedInto.title}`}
              onPress={() => router.push(`/entity/${page.refinedInto?.id}`)}
              className="flex-row items-center gap-1 active:opacity-60"
            >
              <IconLink size={12} />
              <Text variant="small" tone="muted" numberOfLines={1}>
                {page.refinedInto.title || "Note"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <RowDivider />
      </Pressable>
    </EntitySwipe>
  );
}

/// A tablet's Notes and Jots, the desktop's table (5.2, 5.3): the title with its icon, its
/// labels and when it changed; the swipe actions and the long press menu kept (D76).
function PageTable({ pages, jot }: { pages: readonly PageSummary[]; jot: boolean }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const name = (page: PageSummary) => {
    const title = page.entity.title.trim();
    return (
      title || notePreviewText(page.preview, title) || (jot ? "Nothing written yet" : "Untitled")
    );
  };
  const columns: Column<PageSummary>[] = [
    {
      id: "title",
      label: "Title",
      width: "fill",
      sortValue: name,
      render: (page) => (
        <View className="flex-row items-center gap-2">
          <EntityIcon type={page.entity.type} icon={page.entity.icon} size={16} />
          <Text numberOfLines={1} className="flex-1">
            {name(page)}
          </Text>
        </View>
      ),
    },
    {
      id: "labels",
      label: "Labels",
      width: 180,
      hideBelow: 640,
      render: (page) => (
        <View className="flex-row flex-wrap gap-1">
          {page.labels.map((label) => (
            <Badge key={label.id} label={label.name} size="sm" />
          ))}
        </View>
      ),
    },
    {
      id: "edited",
      label: "Edited",
      width: 110,
      sortValue: (page) => page.entity.updatedAt,
      render: (page) => <Text tone="muted">{ago(page.entity.updatedAt)}</Text>,
    },
  ];
  return (
    <DataTable
      label={jot ? "Jots" : "Notes"}
      rows={pages}
      columns={columns}
      keyOf={(page) => page.entity.id}
      titleOf={name}
      onPress={(page) => router.push(`/entity/${page.entity.id}`)}
      onLongPress={(page) => entityMenu(page.entity)}
      wrapRow={(page, node) => <EntitySwipe entity={page.entity}>{node}</EntitySwipe>}
    />
  );
}

type NoteOrder = "edited" | "title" | "id";
const ORDERS: { id: NoteOrder; label: string }[] = [
  { id: "edited", label: "Last edited" },
  { id: "title", label: "Title" },
  { id: "id", label: "ID" },
];

const listSchema = z.object({
  ordering: z.enum(["edited", "title", "id"]),
  /// Labels and Last edited windows the list is narrowed to; empty means all.
  labels: z.array(z.string()),
  edited: z.array(z.string()),
  /// Courses, and Pinned and Created (D73). Saved displays from before read as all.
  courses: z.array(z.string()).default([]),
  ...ENTITY_FILTER_PICKS,
});
type ListDisplay = z.infer<typeof listSchema>;
const LIST_DEFAULT: ListDisplay = {
  ordering: "edited",
  labels: [],
  edited: [],
  courses: [],
  ...ENTITY_FILTERS_NONE,
};

const matches = (page: PageSummary, query: string) => {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [page.entity.title, page.preview, page.entity.key, ...page.labels.map((l) => l.name)]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
};

/// Whether a page passes the filters picked: any of its labels and courses, edited within
/// any window, and Pinned and Created (`own`).
function passes(
  page: PageSummary,
  display: ListDisplay,
  own: (entity: PageSummary["entity"]) => boolean,
  now = Date.now(),
): boolean {
  return (
    (display.labels.length === 0 || page.labels.some((l) => display.labels.includes(l.id))) &&
    (display.courses.length === 0 || page.courses.some((c) => display.courses.includes(c.id))) &&
    withinWindows(page.entity.updatedAt, display.edited, now) &&
    own(page.entity)
  );
}

interface PageListControls {
  display: ListDisplay;
  controls: React.ReactNode;
  /// Whether a page passes every filter picked.
  keep: (page: PageSummary) => boolean;
  /// Whether any filter is on, and turning them all off.
  filtered: boolean;
  clear: () => void;
  /// The save bar for a change to them, for the end of the page.
  saveBar: React.ReactNode;
}

/// Notes' and Jots' header, filters and display, as Tasks has them (D65): the title with
/// Filter and Display, the filters on as chips, and the desktop's filters (labels, last
/// edited) and order in Linear's sheets. The search field stays under it.
function usePageListControls(key: string, title: string, pages: PageSummary[]): PageListControls {
  const draft = useDraftPreference<ListDisplay>(key, listSchema, LIST_DEFAULT);
  const display = draft.value;
  const setDisplay = draft.set;
  const labels = [...new Map(pages.flatMap((p) => p.labels).map((l) => [l.id, l])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const courses = [...new Map(pages.flatMap((p) => p.courses).map((c) => [c.id, c])).values()].sort(
    (a, b) => a.title.localeCompare(b.title),
  );
  const own = useEntityFilters(display, (next) => setDisplay({ ...display, ...next }));
  // Last edited stands for Updated on a page, as on the desktop.
  const [pinned, created] = own.fields;
  const controls = (
    <ListControls
      title={title}
      count={pages.length}
      filters={[
        {
          label: "Course",
          icon: IconSchool,
          values: display.courses,
          options: courses.map((c) => ({
            id: c.id,
            label: c.title || "Untitled",
            glyph: IconSchool,
          })),
          onChange: (next) => setDisplay({ ...display, courses: next }),
        },
        {
          label: "Labels",
          icon: IconTag,
          values: display.labels,
          options: labels.map(labelOption),
          onChange: (next) => setDisplay({ ...display, labels: next }),
        },
        {
          label: "Last edited",
          icon: IconClock,
          values: display.edited,
          options: DATE_WINDOW_OPTIONS,
          onChange: (next) => setDisplay({ ...display, edited: next }),
        },
        pinned,
        created,
      ]}
      display={
        <DisplayGroup>
          <SelectRow
            label="Ordering"
            value={display.ordering}
            options={ORDERS}
            onChange={(ordering) => setDisplay({ ...display, ordering })}
          />
        </DisplayGroup>
      }
    />
  );
  const filtered =
    display.courses.length + display.labels.length + display.edited.length > 0 ||
    own.fields.some((f) => f.values.length > 0);
  return {
    display,
    controls,
    keep: (page) => passes(page, display, own.passes),
    filtered,
    saveBar: <SaveBar dirty={draft.dirty} onDiscard={draft.discard} onSave={draft.save} />,
    clear: () =>
      setDisplay({ ...display, courses: [], labels: [], edited: [], ...ENTITY_FILTERS_NONE }),
  };
}

/// A Space's Notes: a table of its pages with a filter and the order of your choice.
export function NoteList({ spaceId }: { spaceId: string }) {
  const { data: pages = [] } = usePageSummaries(spaceId, "note");
  const [query, setQuery] = useState("");
  const { display, controls, keep, clear, saveBar } = usePageListControls(
    `notes.display.${spaceId}`,
    "Notes",
    pages,
  );
  const shown = pages.filter((p) => matches(p, query) && keep(p)).sort(compare(display.ordering));
  const staged = useStaged(shown);
  const tablet = useIsTablet();
  return (
    <View className="gap-3">
      {controls}
      <FilterField label="Filter notes" value={query} onChange={setQuery} />
      <View>
        <ListEmpty
          glyph={MODULE_ICONS.notes}
          total={pages.length}
          shown={shown.length}
          nothingYet={{ title: "No Notes", message: "Tap + to write one." }}
          onClear={() => {
            clear();
            setQuery("");
          }}
        />
        {tablet ? (
          <PageTable pages={staged} jot={false} />
        ) : (
          <ListGroup>
            {staged.map((page) => (
              <ListItem key={page.entity.id}>
                <PageRow page={page} jot={false} />
              </ListItem>
            ))}
          </ListGroup>
        )}
      </View>
      {saveBar}
    </View>
  );
}

function compare(order: NoteOrder) {
  return (a: PageSummary, b: PageSummary) =>
    order === "title"
      ? a.entity.title.localeCompare(b.entity.title)
      : order === "id"
        ? a.entity.key.localeCompare(b.entity.key, undefined, { numeric: true })
        : b.entity.updatedAt.localeCompare(a.entity.updatedAt);
}

type JotPreset = "unrefined" | "refined" | "week" | "all";

/// A Space's Jots, quick captures waiting to be refined into notes, with the desktop's
/// presets: unrefined, refined, this week and all.
export function JotList({ spaceId }: { spaceId: string }) {
  const { data: jots = [] } = usePageSummaries(spaceId, "jot");
  const [preset, setPreset] = useState<JotPreset>("unrefined");
  const [query, setQuery] = useState("");
  const { display, controls, keep, filtered, clear, saveBar } = usePageListControls(
    `jots.display.${spaceId}`,
    "Jots",
    jots,
  );
  const weekAgo = addDays(localDay(), -7);
  const inPreset = {
    unrefined: (j) => j.refinedInto === null,
    refined: (j) => j.refinedInto !== null,
    week: (j) => j.entity.createdAt.slice(0, 10) >= weekAgo,
    all: () => true,
  } satisfies Record<JotPreset, (j: PageSummary) => boolean>;
  const count = (id: JotPreset) => jots.filter(inPreset[id]).length;
  const shown = jots
    .filter((j) => inPreset[preset](j) && matches(j, query) && keep(j))
    .sort(compare(display.ordering));
  const staged = useStaged(shown);
  const tablet = useIsTablet();
  return (
    <View className="gap-3">
      {controls}
      <FixedTop>
        <Presets
          label="Show"
          value={preset}
          onChange={setPreset}
          options={[
            { id: "unrefined", label: "Unrefined", count: count("unrefined") },
            { id: "refined", label: "Refined", count: count("refined") },
            { id: "week", label: "This week", count: count("week") },
            { id: "all", label: "All", count: count("all") },
          ]}
        />
      </FixedTop>
      <FilterField label="Filter jots" value={query} onChange={setQuery} />
      {jots.length === 0 ? (
        <EmptyState
          glyph={MODULE_ICONS.jots}
          title="Nothing Captured Yet"
          message="Tap + to jot something down. Refine it into a note when you are ready."
        />
      ) : (
        <View>
          {shown.length === 0 && !filtered && query.trim() === "" ? (
            <EmptyState glyph={MODULE_ICONS.jots} title="No Jots Here" />
          ) : (
            <ListEmpty
              glyph={MODULE_ICONS.jots}
              total={jots.length}
              shown={shown.length}
              nothingYet={{ title: "Nothing Captured Yet" }}
              onClear={() => {
                clear();
                setQuery("");
              }}
            />
          )}
          {tablet ? (
            <PageTable pages={staged} jot />
          ) : (
            <ListGroup>
              {staged.map((jot) => (
                <ListItem key={jot.entity.id}>
                  <PageRow page={jot} jot />
                </ListItem>
              ))}
            </ListGroup>
          )}
        </View>
      )}
      {saveBar}
    </View>
  );
}
