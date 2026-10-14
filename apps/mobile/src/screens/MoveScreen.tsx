import { moveEntity } from "@nookly/shared/data";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useEntity, useSpaces } from "../data/queries.ts";
import { SpaceDot } from "../ui/Badge.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";

/// Moves an item, with everything that belongs to it, to another Space. Labels of the
/// old Space come off; the new Space gets the module the item needs.
export function MoveScreen() {
  const router = useRouter();
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  const { data: entity } = useEntity(entityId);
  const { data: spaces = [] } = useSpaces();
  const move = useLocalWrite((db, spaceId: string) => moveEntity(db, entityId, spaceId));
  const others = spaces.filter((s) => s.id !== entity?.spaceId);
  return (
    <Screen>
      <Text tone="muted">
        Sub-tasks, sessions and the notes that belong to it move along. Its labels stay behind,
        since each Space has its own.
      </Text>
      <Section>
        {others.length === 0 ? <Empty text="There is no other Space." /> : null}
        {others.map((space) => (
          <View key={space.id}>
            <Row
              title={space.name}
              icon={<SpaceDot color={space.color} />}
              onPress={() => move.mutate(space.id, { onSuccess: () => router.back() })}
            />
          </View>
        ))}
      </Section>
      {move.error ? <Text tone="destructive">{move.error.message}</Text> : null}
    </Screen>
  );
}
