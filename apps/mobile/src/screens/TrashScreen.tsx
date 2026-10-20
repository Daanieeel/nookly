import { deleteForever, emptyTrash, restoreEntity } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { Alert, View } from "react-native";
import { Button, statusOf } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";
import { useLocalWrite } from "../data/context.tsx";
import { useEntities, useSpaces } from "../data/queries.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { FilterField, ListTitle } from "../ui/ListBar.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SwipeRow } from "../ui/SwipeRow.tsx";
import { useState } from "react";
import { ago } from "./dates.ts";
import { typeLabel } from "./pinned-groups.ts";

/// What was moved to Trash. Swipe right to restore, left to delete forever; Empty Trash
/// deletes it all. Both ask first, since neither can be undone.
export function TrashScreen() {
  const router = useRouter();
  const { data: trashed = [] } = useEntities(null, [], true);
  const { data: spaces = [] } = useSpaces();
  const [query, setQuery] = useState("");
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? "";
  const shown = trashed.filter((e) =>
    `${e.title} ${e.key} ${typeLabel(e.type)} ${spaceName(e.spaceId)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const restore = useLocalWrite((db, id: string) => restoreEntity(db, id));
  const forever = useLocalWrite((db, id: string) => deleteForever(db, id));
  const empty = useLocalWrite((db) => emptyTrash(db));
  const askForever = (id: string, title: string) =>
    Alert.alert(
      `Delete "${title || "Untitled"}" forever?`,
      "This can't be undone, on any device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Forever", style: "destructive", onPress: () => forever.mutate(id) },
      ],
    );
  return (
    <Screen>
      <ListTitle title="Trash" count={trashed.length} />
      <Text tone="muted">
        Deleted items stay here until you restore them. Nothing is purged automatically.
      </Text>
      {trashed.length > 0 ? (
        <FilterField label="Filter Trash" value={query} onChange={setQuery} />
      ) : null}
      {trashed.length > 0 ? (
        <View className="items-start gap-2">
          <Button
            label="Empty Trash"
            variant="destructive"
            status={statusOf(empty)}
            successLabel="Emptied"
            errorLabel="Couldn't empty it"
            onPress={() =>
              Alert.alert(
                "Empty Trash?",
                `${trashed.length} ${trashed.length === 1 ? "item goes" : "items go"} forever, on every device. This can't be undone.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Empty Trash",
                    style: "destructive",
                    onPress: () => empty.mutate(undefined),
                  },
                ],
              )
            }
          />
          {forever.error ? <Text tone="destructive">{forever.error.message}</Text> : null}
        </View>
      ) : null}
      <Section>
        {trashed.length === 0 ? <Empty text="Trash is empty." /> : null}
        {trashed.length > 0 && shown.length === 0 ? <Empty text="Nothing matches." /> : null}
        {shown.map((entity) => (
          <View key={entity.id}>
            <SwipeRow
              left={{
                label: "Restore",
                tone: "positive",
                onPress: () => restore.mutate(entity.id),
              }}
              right={{
                label: "Delete",
                tone: "destructive",
                onPress: () => askForever(entity.id, entity.title),
              }}
            >
              <Row
                title={entity.title || "Untitled"}
                subtitle={`${typeLabel(entity.type)} · ${spaceName(entity.spaceId)} · ${entity.deletedAt ? ago(entity.deletedAt) : ""}`}
                muted
                icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                onPress={() => router.push(`/entity/${entity.id}`)}
              />
            </SwipeRow>
          </View>
        ))}
      </Section>
    </Screen>
  );
}
