import { usePageFilters } from "../ui/page-filters.tsx";
import { ListEmpty } from "../ui/ListEmpty.tsx";
import { deleteForever, emptyTrash, restoreEntity } from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Button, statusOf } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";
import { useLocalWrite } from "../data/context.tsx";
import { useEntities, useSpaces } from "../data/queries.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { FilterField } from "../ui/ListBar.tsx";
import { ListControls } from "../ui/ListControls.tsx";
import { AGE_OPTIONS, ageBucket, useWeekStart } from "../ui/entity-filters.tsx";
import { IconCategory, IconFolder, IconTrash } from "@tabler/icons-react-native";
import { spaceOption } from "./option-badges.tsx";
import { Row, Section } from "../ui/Row.tsx";
import { useMenu } from "../ui/menu.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SwipeRow } from "../ui/SwipeRow.tsx";
import { useStaged } from "../ui/staged.ts";
import { useState } from "react";
import { ago } from "./dates.ts";
import { typeLabel } from "./pinned-groups.ts";

/// What was moved to Trash. Swipe right to restore, left to delete forever; Empty Trash
/// deletes it all. Both ask first, since neither can be undone.
export function TrashScreen() {
  const entityMenu = useEntityMenu();
  const menu = useMenu();
  const router = useRouter();
  const { data: trashed = [] } = useEntities(null, [], true);
  const { data: spaces = [] } = useSpaces();
  const [query, setQuery] = useState("");
  const filters = usePageFilters("trash.filters");
  const types = filters.picked("type");
  const inSpaces = filters.picked("space");
  const deleted = filters.picked("deleted");
  const weekStart = useWeekStart();
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? "";
  const shown = trashed.filter(
    (e) =>
      `${e.title} ${e.key} ${typeLabel(e.type)} ${spaceName(e.spaceId)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (types.length === 0 || types.includes(e.type)) &&
      (inSpaces.length === 0 || inSpaces.includes(e.spaceId)) &&
      (deleted.length === 0 || deleted.includes(ageBucket(e.deletedAt ?? e.updatedAt, weekStart))),
  );
  // As the desktop: a filter shows only when there is more than one thing to pick.
  const presentTypes = [...new Set(trashed.map((e) => e.type))];
  const presentSpaces = spaces.filter((s) => trashed.some((e) => e.spaceId === s.id));
  const restore = useLocalWrite((db, id: string) => restoreEntity(db, id));
  const forever = useLocalWrite((db, id: string) => deleteForever(db, id));
  const empty = useLocalWrite((db) => emptyTrash(db));
  const askForever = (id: string, title: string) =>
    menu.confirm({
      title: `Delete "${title || "Untitled"}" forever?`,
      description: "This can't be undone, on any device.",
      actions: [{ label: "Delete Forever", destructive: true, onPress: () => forever.mutate(id) }],
    });
  const staged = useStaged(shown);
  return (
    <Screen>
      <ListControls
        title="Trash"
        count={trashed.length}
        filters={[
          {
            label: "Type",
            icon: IconCategory,
            values: types,
            options:
              presentTypes.length > 1
                ? presentTypes.map((type) => ({
                    id: type,
                    label: typeLabel(type),
                    icon: <EntityIcon type={type} />,
                  }))
                : [],
            onChange: filters.pick("type"),
          },
          {
            label: "Space",
            icon: IconFolder,
            values: inSpaces,
            options: presentSpaces.length > 1 ? presentSpaces.map(spaceOption) : [],
            onChange: filters.pick("space"),
          },
          {
            label: "Deleted",
            icon: IconTrash,
            values: deleted,
            options: trashed.length > 0 ? AGE_OPTIONS : [],
            onChange: filters.pick("deleted"),
          },
        ]}
      />
      <Text tone="muted">
        Deleted items stay here until you restore them. Nothing is purged automatically.
      </Text>
      {trashed.length > 0 ? (
        <FilterField label="Filter Trash" value={query} onChange={setQuery} />
      ) : null}
      {trashed.length > 0 ? (
        <View className="gap-2">
          <Button
            label="Empty Trash"
            variant="destructive"
            size="lg"
            status={statusOf(empty)}
            successLabel="Emptied"
            errorLabel="Couldn't empty it"
            onPress={() =>
              menu.confirm({
                title: "Empty Trash?",
                description: `${trashed.length} ${trashed.length === 1 ? "item goes" : "items go"} forever, on every device. This can't be undone.`,
                actions: [
                  {
                    label: "Empty Trash",
                    destructive: true,
                    onPress: () => empty.mutate(undefined),
                  },
                ],
              })
            }
          />
          {forever.error ? <Text tone="destructive">{forever.error.message}</Text> : null}
        </View>
      ) : null}
      <Section>
        <ListEmpty
          glyph={IconTrash}
          total={trashed.length}
          shown={shown.length}
          nothingYet={{ title: "Trash Is Empty" }}
          onClear={() => {
            setQuery("");
            filters.clear();
          }}
        />
        {staged.map((entity) => (
          <View key={entity.id}>
            <SwipeRow
              leading={[
                {
                  label: "Restore",
                  tone: "positive",
                  onPress: () => restore.mutate(entity.id),
                },
              ]}
              trailing={[
                {
                  label: "Delete",
                  tone: "destructive",
                  onPress: () => askForever(entity.id, entity.title),
                },
              ]}
            >
              <Row
                title={entity.title || "Untitled"}
                subtitle={`${typeLabel(entity.type)} · ${spaceName(entity.spaceId)} · ${entity.deletedAt ? ago(entity.deletedAt) : ""}`}
                muted
                icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                onPress={() => router.push(`/entity/${entity.id}`)}
                onLongPress={() => entityMenu(entity)}
              />
            </SwipeRow>
          </View>
        ))}
      </Section>
      {filters.saveBar}
    </Screen>
  );
}
