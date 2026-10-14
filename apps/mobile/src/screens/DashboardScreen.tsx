import { IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useSyncState } from "../data/context.tsx";
import { useAgenda, usePinned, useSpaces, useStatuses, useTasks } from "../data/queries.ts";
import { IconButton } from "../ui/Button.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section, Separator } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { AgendaRow } from "./CalendarScreen.tsx";
import { greeting, localDay } from "./dates.ts";
import { TaskRow } from "./TaskRow.tsx";
import { useSyncRefresh } from "./useSyncRefresh.ts";

/// The day at a glance, like the desktop's Dashboard: what is on today, what is due,
/// and what is pinned, across every Space.
export function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = localDay();
  const { data: items = [] } = useAgenda(today, today);
  const { data: tasks = [] } = useTasks(null);
  const { data: statuses = [] } = useStatuses();
  const { data: spaces = [] } = useSpaces();
  const { data: pinnedItems = [] } = usePinned();
  const syncState = useSyncState((s) => s.status.state);
  const { refreshing, onRefresh } = useSyncRefresh();
  const finished = new Set(statuses.filter((s) => s.doneness >= 100).map((s) => s.id));
  const due = tasks.filter(
    (t) =>
      !finished.has(t.statusId) &&
      t.dueDate !== null &&
      t.dueDate <= today &&
      t.entity.type === "task",
  );
  const colorOf = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              label="New Task"
              icon={<IconPlus size={22} color={theme.colors.foreground} />}
              onPress={() => router.push("/new/task")}
            />
          ),
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <View style={{ gap: theme.space(1) }}>
          <Text variant="title" accessibilityRole="header">
            {greeting()}
          </Text>
          <Text tone="muted">
            {date}
            {syncState === "offline" ? ". Offline, changes sync later." : ""}
          </Text>
        </View>
        <Section title="Today">
          {items.length === 0 ? (
            <Empty text="Nothing on the calendar today." />
          ) : (
            items.map((item, i) => (
              <View key={item.id}>
                {i > 0 ? <Separator /> : null}
                <AgendaRow item={item} color={colorOf(item.spaceId)} />
              </View>
            ))
          )}
        </Section>
        <Section title="Due">
          {due.length === 0 ? (
            <Empty text="No tasks due." />
          ) : (
            due.map((task, i) => (
              <View key={task.entity.id}>
                {i > 0 ? <Separator /> : null}
                <TaskRow
                  task={task}
                  statuses={statuses}
                  spaceColor={colorOf(task.entity.spaceId)}
                />
              </View>
            ))
          )}
        </Section>
        {pinnedItems.length > 0 ? (
          <Section title="Pinned">
            {pinnedItems.map((entity, i) => (
              <View key={entity.id}>
                {i > 0 ? <Separator /> : null}
                <Row
                  title={entity.title || "Untitled"}
                  subtitle={entity.key}
                  icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                  onPress={() => router.push(`/entity/${entity.id}`)}
                />
              </View>
            ))}
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
