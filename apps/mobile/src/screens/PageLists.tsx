import { type PageSummary, setPinned, trashEntity } from "@nookly/shared/data";
import { IconFeather, IconLink } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { usePageSummaries } from "../data/queries.ts";
import { Badge } from "../ui/Badge.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { FilterField, ListTitle, Presets } from "../ui/ListBar.tsx";
import { useMenu } from "../ui/menu.tsx";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { cn } from "../ui/classes.ts";
import { ROW_DIVIDER } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { ago, localDay, addDays } from "./dates.ts";

/// A page's row in a list, as the desktop's table gives it: the key, the title, the start of
/// its text and its labels, with when it was last edited at the right. Long press for pin
/// and trash.
function PageRow({ page, jot }: { page: PageSummary; jot: boolean }) {
  const router = useRouter();
  const present = useMenu();
  const { entity } = page;
  const pin = useLocalWrite((db, next: boolean) => setPinned(db, entity.id, next));
  const trash = useLocalWrite((db) => trashEntity(db, entity.id));
  const title = entity.title.trim();
  const empty = jot && !title && !page.preview;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title || page.preview || (jot ? "Nothing written yet" : "Untitled")}
      onPress={() => router.push(`/entity/${entity.id}`)}
      onLongPress={() =>
        present.show(title || entity.key, [
          { label: entity.pinned ? "Unpin" : "Pin", onPress: () => pin.mutate(!entity.pinned) },
          { label: "Move to Trash", destructive: true, onPress: () => trash.mutate(undefined) },
        ])
      }
      className={cn("gap-1 px-4 py-3 active:bg-accent/40", ROW_DIVIDER)}
    >
      <View className="flex-row items-center gap-3">
        <EntityIcon type={entity.type} icon={entity.icon} />
        <Text
          numberOfLines={1}
          className={cn("flex-1 font-medium", empty && "font-normal italic text-muted-foreground")}
        >
          {title || page.preview.split("\n")[0] || (jot ? "Nothing written yet" : "Untitled")}
        </Text>
        <Text variant="small" tone="muted">
          {ago(entity.updatedAt)}
        </Text>
      </View>
      {page.preview && title ? (
        <Text variant="small" tone="muted" numberOfLines={1} className="pl-8">
          {page.preview}
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
            className="flex-row items-center gap-1"
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

/// A Space's Notes: a table of its pages with a filter and the order of your choice.
export function NoteList({ spaceId }: { spaceId: string }) {
  const { data: pages = [] } = usePageSummaries(spaceId, "note");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<NoteOrder>("edited");
  const shown = pages.filter((p) => matches(p, query)).sort(compare(order));
  return (
    <View className="gap-3">
      <ListTitle title="Notes" count={pages.length} />
      <FilterField label="Filter notes" value={query} onChange={setQuery} />
      <ChipGroup label="Order" scroll>
        {ORDERS.map((o) => (
          <Chip
            key={o.id}
            label={o.label}
            selected={order === o.id}
            onPress={() => setOrder(o.id)}
          />
        ))}
      </ChipGroup>
      <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden")}>
        <View className="-mb-px">
          {shown.length === 0 ? (
            <Text tone="muted" className="p-4">
              {pages.length === 0 ? "No notes yet. Tap + to write one." : "No notes match."}
            </Text>
          ) : null}
          {shown.map((page) => (
            <View key={page.entity.id}>
              <PageRow page={page} jot={false} />
            </View>
          ))}
        </View>
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
  const { data: jots = [] } = usePageSummaries(spaceId, "jot");
  const [preset, setPreset] = useState<JotPreset>("unrefined");
  const [query, setQuery] = useState("");
  const weekAgo = addDays(localDay(), -7);
  const inPreset = {
    unrefined: (j) => j.refinedInto === null,
    refined: (j) => j.refinedInto !== null,
    week: (j) => j.entity.createdAt.slice(0, 10) >= weekAgo,
    all: () => true,
  } satisfies Record<JotPreset, (j: PageSummary) => boolean>;
  const count = (id: JotPreset) => jots.filter(inPreset[id]).length;
  const shown = jots.filter((j) => inPreset[preset](j) && matches(j, query));
  return (
    <View className="gap-3">
      <ListTitle title="Jots" count={jots.length} />
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
          <IconFeather size={28} />
          <Text className="font-medium">Nothing captured yet</Text>
          <Text tone="muted" className="text-center">
            Tap + to jot something down. Refine it into a note when you are ready.
          </Text>
        </View>
      ) : (
        <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden")}>
          <View className="-mb-px">
            {shown.length === 0 ? (
              <Text tone="muted" className="p-4">
                No jots here.
              </Text>
            ) : null}
            {shown.map((jot) => (
              <View key={jot.entity.id}>
                <PageRow page={jot} jot />
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
