import { restoreEntity } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useEntities } from "../data/queries.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SwipeRow } from "../ui/SwipeRow.tsx";

/// What was moved to Trash. Nothing in it is ever removed from here; swipe to restore.
export function TrashScreen() {
  const router = useRouter();
  const { data: trashed = [] } = useEntities(null, [], true);
  const restore = useLocalWrite((db, id: string) => restoreEntity(db, id));
  return (
    <Screen>
      <Section>
        {trashed.length === 0 ? <Empty text="Trash is empty." /> : null}
        {trashed.map((entity) => (
          <View key={entity.id}>
            <SwipeRow
              left={{
                label: "Restore",
                tone: "positive",
                onPress: () => restore.mutate(entity.id),
              }}
            >
              <Row
                title={entity.title || "Untitled"}
                subtitle={entity.key}
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
