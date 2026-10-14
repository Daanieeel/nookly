import { type ConflictItem, describeConflicts } from "@nookly/shared/data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Empty, Section, ROW_DIVIDER } from "../ui/Row.tsx";
import { cn } from "../ui/classes.ts";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";

/// The lost changes, as the conflicts count and the list read them.
function useConflictItems() {
  const { db, sync } = useAppData();
  return useQuery({
    queryKey: keys.sync.conflictItems,
    queryFn: async () => describeConflicts(db, await sync.engine.conflicts()),
  });
}

function ConflictRow({ item }: { item: ConflictItem }) {
  const router = useRouter();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.sync.conflicts });
    void queryClient.invalidateQueries({ queryKey: keys.local });
  };
  const restore = useMutation({
    mutationFn: () => sync.engine.restoreConflict(item.conflict.id),
    onSuccess: () => {
      refresh();
      sync.notifyLocalChange();
    },
  });
  const dismiss = useMutation({
    mutationFn: () => sync.engine.dismissConflict(item.conflict.id),
    onSuccess: refresh,
  });
  const when = new Date(item.conflict.createdAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <View className={cn("gap-2 p-4", ROW_DIVIDER)}>
      <Text numberOfLines={1}>{item.title}</Text>
      <Text variant="small" tone="muted">
        {item.field}
        {item.value !== null ? `: ${item.value}` : ""} · {when}
      </Text>
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          label="Bring Back"
          status={statusOf(restore)}
          successLabel="Back"
          errorLabel="Its item is gone"
          onPress={() => restore.mutate()}
        />
        <Button label="Dismiss" variant="ghost" onPress={() => dismiss.mutate()} />
        {item.entityId ? (
          <Button
            label="Open"
            variant="ghost"
            onPress={() => router.push(`/entity/${item.entityId}`)}
          />
        ) : null}
      </View>
    </View>
  );
}

/// Changes that lost to newer ones from another device, kept so none is lost: bring
/// one back, which makes it the newest change, or dismiss it.
export function ConflictsScreen() {
  const { data: items = [] } = useConflictItems();
  return (
    <Screen>
      <Text tone="muted">
        When two devices change the same thing, the newer change wins. The other one waits here.
      </Text>
      <Section>
        {items.length === 0 ? <Empty text="No conflicts." /> : null}
        {items.slice(0, 100).map((item) => (
          <View key={item.conflict.id}>
            <ConflictRow item={item} />
          </View>
        ))}
      </Section>
    </Screen>
  );
}
