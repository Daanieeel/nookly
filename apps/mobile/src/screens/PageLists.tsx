import type { PageSummary } from "@nookly/shared/data";
import { notePreviewText } from "@nookly/frontend/lib/note-preview";
import { IconClock, IconFeather, IconLink, IconTag } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { usePageSummaries } from "../data/queries.ts";
import { Badge } from "../ui/Badge.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { ListGroup, ListItem } from "../ui/ListMotion.tsx";
import { FilterField, ListHeader, type ListPanel, Presets } from "../ui/ListBar.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { DisplayGroup, FilterField as LinearFilter, SelectRow } from "../ui/sheet/DisplayParts.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { useTheme } from "../ui/theme.ts";
import { usePreference } from "../data/preferences.ts";
import { z } from "zod";
import { labelOption } from "./option-badges.tsx";
import { cn } from "../ui/classes.ts";
import { ROW_DIVIDER } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { ago, localDay, addDays } from "./dates.ts";
import { useEntityMenu } from "./entity-actions.tsx";

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title || preview || (jot ? "Nothing written yet" : "Untitled")}
      onPress={() => router.push(`/entity/${entity.id}`)}
      onLongPress={() => entityMenu(entity)}
      className={cn("gap-1 px-1 py-3 active:bg-accent/40", ROW_DIVIDER)}
    >
      <View className="flex-row items-center gap-3">
        <EntityIcon type={entity.type} icon={entity.icon} />
        <Text
          numberOfLines={1}
          className={cn("flex-1 font-medium", empty && "font-normal italic text-muted-foreground")}
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
    </Pressable>
  );
}

type NoteOrder = "edited" | "title" | "id";
const ORDERS: { id: NoteOrder; label: string }[] = [
  { id: "edited", label: "Last edited" },
  { id: "title", label: "Title" },
  { id: "id", label: "ID" },
];

/// The desktop's Last edited filter: rolling windows back from now.
const EDITED: { id: "today" | "week" | "month"; label: string; days: number }[] = [
  { id: "today", label: "Past day", days: 1 },
  { id: "week", label: "Past 7 days", days: 7 },
  { id: "month", label: "Past 30 days", days: 30 },
];

const listSchema = z.object({
  ordering: z.enum(["edited", "title", "id"]),
  /// Labels and Last edited windows the list is narrowed to; empty means all.
  labels: z.array(z.string()),
  edited: z.array(z.enum(["today", "week", "month"])),
});
type ListDisplay = z.infer<typeof listSchema>;
const LIST_DEFAULT: ListDisplay = { ordering: "edited", labels: [], edited: [] };

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

/// Whether a page passes the filters picked: any of its labels, edited within any window.
function passes(page: PageSummary, display: ListDisplay, now = Date.now()): boolean {
  return (
    (display.labels.length === 0 || page.labels.some((l) => display.labels.includes(l.id))) &&
    (display.edited.length === 0 ||
      display.edited.some((id) => {
        const days = EDITED.find((e) => e.id === id)?.days ?? 0;
        return now - Date.parse(page.entity.updatedAt) < days * 86_400_000;
      }))
  );
}

/// Notes' and Jots' header, filters and display, as Tasks has them (D65): the title with
/// Filter and Display, the filters on as chips, and the desktop's filters (labels, last
/// edited) and order in Linear's sheets. The search field stays under it.
function usePageListControls(
  key: string,
  title: string,
  pages: PageSummary[],
): { display: ListDisplay; controls: React.ReactNode } {
  const [display, setDisplay] = usePreference<ListDisplay>(key, listSchema, LIST_DEFAULT);
  const [panel, setPanel] = useState<ListPanel>(null);
  const labels = [...new Map(pages.flatMap((p) => p.labels).map((l) => [l.id, l])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const active = [
    ...display.labels.map((id) => ({
      key: `label-${id}`,
      label: labels.find((l) => l.id === id)?.name ?? id,
      remove: () => setDisplay({ ...display, labels: display.labels.filter((x) => x !== id) }),
    })),
    ...display.edited.map((id) => ({
      key: `edited-${id}`,
      label: EDITED.find((e) => e.id === id)?.label ?? id,
      remove: () => setDisplay({ ...display, edited: display.edited.filter((x) => x !== id) }),
    })),
  ];
  const close = (open: boolean) => !open && setPanel(null);
  const controls = (
    <>
      <ListHeader title={title} count={pages.length} panel={panel} onPanel={setPanel} />
      {active.length > 0 ? (
        <ChipGroup label="Active filters" multiple>
          {active.map((f) => (
            <Chip key={f.key} label={`${f.label} ×`} multiple selected onPress={f.remove} />
          ))}
        </ChipGroup>
      ) : null}
      <Sheet open={panel === "filter"} onOpenChange={close} title="Filter">
        <DisplayGroup>
          {labels.length > 0 ? (
            <LinearFilter
              label="Labels"
              icon={IconTag}
              values={display.labels}
              options={labels.map(labelOption)}
              onChange={(next) => setDisplay({ ...display, labels: next })}
            />
          ) : null}
          <LinearFilter
            label="Last edited"
            icon={IconClock}
            values={display.edited}
            options={EDITED.map((e) => ({ id: e.id, label: e.label }))}
            onChange={(next) => setDisplay({ ...display, edited: next })}
          />
        </DisplayGroup>
      </Sheet>
      <Sheet open={panel === "display"} onOpenChange={close} title="Display">
        <DisplayGroup>
          <SelectRow
            label="Ordering"
            value={display.ordering}
            options={ORDERS}
            onChange={(ordering) => setDisplay({ ...display, ordering })}
          />
        </DisplayGroup>
      </Sheet>
    </>
  );
  return { display, controls };
}

/// A Space's Notes: a table of its pages with a filter and the order of your choice.
export function NoteList({ spaceId }: { spaceId: string }) {
  const { data: pages = [] } = usePageSummaries(spaceId, "note");
  const [query, setQuery] = useState("");
  const { display, controls } = usePageListControls(`notes.display.${spaceId}`, "Notes", pages);
  const shown = pages
    .filter((p) => matches(p, query) && passes(p, display))
    .sort(compare(display.ordering));
  return (
    <View className="gap-3">
      {controls}
      <FilterField label="Filter notes" value={query} onChange={setQuery} />
      <View>
        {shown.length === 0 ? (
          <Text tone="muted" className="px-1 py-4">
            {pages.length === 0 ? "No notes yet. Tap + to write one." : "No notes match."}
          </Text>
        ) : null}
        <ListGroup>
          {shown.map((page) => (
            <ListItem key={page.entity.id}>
              <PageRow page={page} jot={false} />
            </ListItem>
          ))}
        </ListGroup>
      </View>
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
  const theme = useTheme();
  const { data: jots = [] } = usePageSummaries(spaceId, "jot");
  const [preset, setPreset] = useState<JotPreset>("unrefined");
  const [query, setQuery] = useState("");
  const { display, controls } = usePageListControls(`jots.display.${spaceId}`, "Jots", jots);
  const weekAgo = addDays(localDay(), -7);
  const inPreset = {
    unrefined: (j) => j.refinedInto === null,
    refined: (j) => j.refinedInto !== null,
    week: (j) => j.entity.createdAt.slice(0, 10) >= weekAgo,
    all: () => true,
  } satisfies Record<JotPreset, (j: PageSummary) => boolean>;
  const count = (id: JotPreset) => jots.filter(inPreset[id]).length;
  const shown = jots
    .filter((j) => inPreset[preset](j) && matches(j, query) && passes(j, display))
    .sort(compare(display.ordering));
  return (
    <View className="gap-3">
      {controls}
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
      <FilterField label="Filter jots" value={query} onChange={setQuery} />
      {jots.length === 0 ? (
        <View className="items-center gap-2 p-8">
          <IconFeather size={28} color={theme.colors.mutedForeground} />
          <Text className="font-medium">Nothing captured yet</Text>
          <Text tone="muted" className="text-center">
            Tap + to jot something down. Refine it into a note when you are ready.
          </Text>
        </View>
      ) : (
        <View>
          {shown.length === 0 ? (
            <Text tone="muted" className="px-1 py-4">
              No jots here.
            </Text>
          ) : null}
          <ListGroup>
            {shown.map((jot) => (
              <ListItem key={jot.entity.id}>
                <PageRow page={jot} jot />
              </ListItem>
            ))}
          </ListGroup>
        </View>
      )}
    </View>
  );
}
