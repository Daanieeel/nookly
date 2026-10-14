import { IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useSpaces, useStatuses, useTasks } from "../data/queries.ts";
import { IconButton } from "../ui/Button.tsx";
import { Section, Separator } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { TaskRow } from "./TaskRow.tsx";
import { useSyncRefresh } from "./useSyncRefresh.ts";

/// How many finished tasks a status group shows; the rest live on in their Space.
const FINISHED_SHOWN = 10;

/// Tasks grouped by status, in status order: every Space's (the cross Space
/// overview), or one Space's.
export function TasksScreen({ spaceId = null }: { spaceId?: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: tasks = [] } = useTasks(spaceId);
  const { data: statuses = [] } = useStatuses();
  const { data: spaces = [] } = useSpaces();
  const { refreshing, onRefresh } = useSyncRefresh();
  const ordered = [...statuses].sort(
    (a, b) => (a.doneness >= 100 ? 1 : 0) - (b.doneness >= 100 ? 1 : 0) || a.position - b.position,
  );
  const newTask = () => router.push(spaceId ? `/new/task?spaceId=${spaceId}` : "/new/task");
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              label="New Task"
              icon={<IconPlus size={22} color={theme.colors.foreground} />}
              onPress={newTask}
            />
          ),
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        {tasks.length === 0 ? <Text tone="muted">No tasks yet. Tap + to add one.</Text> : null}
        {ordered.map((status) => {
          const inStatus = tasks.filter((t) => t.statusId === status.id);
          if (inStatus.length === 0) return null;
          const shown = status.doneness >= 100 ? inStatus.slice(0, FINISHED_SHOWN) : inStatus;
          return (
            <Section key={status.id} title={`${status.name} · ${inStatus.length}`}>
              {shown.map((task, i) => (
                <View key={task.entity.id}>
                  {i > 0 ? <Separator /> : null}
                  <TaskRow
                    task={task}
                    statuses={statuses}
                    spaceColor={
                      spaceId ? undefined : spaces.find((s) => s.id === task.entity.spaceId)?.color
                    }
                  />
                </View>
              ))}
            </Section>
          );
        })}
      </Screen>
    </>
  );
}
