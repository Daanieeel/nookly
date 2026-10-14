import { restoreEntity } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useEntities } from "../data/queries.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section, Separator } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SwipeRow } from "../ui/SwipeRow.tsx";
import { useTheme } from "../ui/theme.ts";

/// What was moved to Trash. Nothing in it is ever removed from here; swipe to restore.
export function TrashScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: trashed = [] } = useEntities(null, [], true);
  const restore = useLocalWrite((db, id: string) => restoreEntity(db, id));
  return (
    <Screen>
      <Section>
        {trashed.length === 0 ? <Empty text="Trash is empty." /> : null}
        {trashed.map((entity, i) => (
          <View key={entity.id}>
            {i > 0 ? <Separator /> : null}
            <SwipeRow
              left={{
                label: "Restore",
                color: theme.colors.positive,
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
