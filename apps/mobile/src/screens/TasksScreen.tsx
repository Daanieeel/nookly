import { IconAdjustmentsHorizontal, IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { usePreference } from "../data/preferences.ts";
import {
  useAllLabels,
  useSpaces,
  useStatuses,
  useTaskLabelIds,
  useTasks,
} from "../data/queries.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Empty, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { TaskRow } from "./TaskRow.tsx";
import {
  DEFAULT_DISPLAY,
  GROUPINGS,
  ORDERINGS,
  type TaskDisplay,
  displaySchema,
  groupTasks,
} from "./task-view.ts";
import { useSyncRefresh } from "./useSyncRefresh.ts";

/// How many finished tasks a group shows at first; the rest are a tap away in their Space.
const FINISHED_SHOWN = 10;

/// Layout, grouping, ordering and filters, remembered on this phone like the desktop
/// remembers them per page.
function DisplayPanel({
  display,
  onChange,
  spaceId,
}: {
  display: TaskDisplay;
  onChange: (next: TaskDisplay) => void;
  spaceId: string | null;
}) {
  const { data: statuses = [] } = useStatuses();
  const { data: labels = [] } = useAllLabels();
  const shownLabels = spaceId ? labels.filter((l) => l.spaceId === spaceId) : labels;
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return (
    <View
      className="gap-3 rounded-lg border border-border p-3"
      accessibilityLabel="Display options"
    >
      <ChipGroup label="Layout">
        <Chip
          label="List"
          selected={display.layout === "list"}
          onPress={() => onChange({ ...display, layout: "list" })}
        />
        <Chip
          label="Board"
          selected={display.layout === "board"}
          onPress={() => onChange({ ...display, layout: "board" })}
        />
      </ChipGroup>
      <Text variant="small" tone="muted">
        Group by
      </Text>
      <ChipGroup label="Group by" scroll>
        {GROUPINGS.map((g) => (
          <Chip
            key={g.id}
            label={g.label}
            selected={display.grouping === g.id}
            onPress={() => onChange({ ...display, grouping: g.id })}
          />
        ))}
      </ChipGroup>
      <Text variant="small" tone="muted">
        Order by
      </Text>
      <ChipGroup label="Order by" scroll>
        {ORDERINGS.map((o) => (
          <Chip
            key={o.id}
            label={o.label}
            selected={display.ordering === o.id}
            onPress={() => onChange({ ...display, ordering: o.id })}
          />
        ))}
      </ChipGroup>
      <Text variant="small" tone="muted">
        Show only these statuses
      </Text>
      <ChipGroup label="Statuses" multiple scroll>
        {statuses.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            multiple
            selected={display.statuses.includes(s.id)}
            onPress={() => onChange({ ...display, statuses: toggle(display.statuses, s.id) })}
          />
        ))}
      </ChipGroup>
      {shownLabels.length > 0 ? (
        <>
          <Text variant="small" tone="muted">
            Show only these labels
          </Text>
          <ChipGroup label="Labels" multiple scroll>
            {shownLabels.map((l) => (
              <Chip
                key={l.id}
                label={l.name}
                multiple
                selected={display.labels.includes(l.id)}
                onPress={() => onChange({ ...display, labels: toggle(display.labels, l.id) })}
              />
            ))}
          </ChipGroup>
        </>
      ) : null}
      <ChipGroup label="Finished tasks" multiple>
        <Chip
          label="Show finished"
          multiple
          selected={display.showFinished}
          onPress={() => onChange({ ...display, showFinished: !display.showFinished })}
        />
      </ChipGroup>
    </View>
  );
}

/// Tasks of one Space, or every Space's (the cross Space overview), as a list or a
/// board, grouped, ordered and filtered the way the person chose.
export function TasksScreen({ spaceId = null }: { spaceId?: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: tasks = [] } = useTasks(spaceId);
  const { data: statuses = [] } = useStatuses();
  const { data: spaces = [] } = useSpaces();
  const { data: labels = [] } = useAllLabels();
  const { data: labelMap } = useTaskLabelIds(
    spaceId,
    tasks.map((t) => t.entity.id),
  );
  const { refreshing, onRefresh } = useSyncRefresh();
  const [display, setDisplay] = usePreference<TaskDisplay>(
    `tasks.display.${spaceId ?? "all"}`,
    displaySchema,
    DEFAULT_DISPLAY,
  );
  const [panel, setPanel] = useState(false);
  const groups = groupTasks(tasks, display, {
    statuses,
    labels: spaceId ? labels.filter((l) => l.spaceId === spaceId) : labels,
    labelIdsOf: (id) => labelMap?.get(id) ?? [],
    spaces,
  });
  const colorOf = (task: (typeof tasks)[number]) =>
    spaceId ? undefined : spaces.find((s) => s.id === task.entity.spaceId)?.color;
  const newTask = () => router.push(spaceId ? `/new/task?spaceId=${spaceId}` : "/new/task");
  const finishedGroup = (status: string) =>
    (statuses.find((s) => s.id === status)?.doneness ?? 0) >= 100;
  const board = display.layout === "board";
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
        <View className="items-end">
          <Button
            label="Display"
            variant="ghost"
            size="sm"
            icon={<IconAdjustmentsHorizontal size={16} color={theme.colors.foreground} />}
            onPress={() => setPanel((open) => !open)}
          />
        </View>
        {panel ? <DisplayPanel display={display} onChange={setDisplay} spaceId={spaceId} /> : null}
        {tasks.length === 0 ? <Text tone="muted">No tasks yet. Tap + to add one.</Text> : null}
        {tasks.length > 0 && groups.length === 0 ? (
          <Empty text="Nothing matches these filters." />
        ) : null}
        {board ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3"
          >
            {groups.map((group) => (
              <View
                key={group.id}
                className="w-72 gap-1"
                accessibilityLabel={`${group.title} column`}
              >
                <Section title={`${group.title} · ${group.tasks.length}`}>
                  {group.tasks.map((task) => (
                    <View key={task.entity.id}>
                      <TaskRow task={task} statuses={statuses} spaceColor={colorOf(task)} />
                    </View>
                  ))}
                </Section>
              </View>
            ))}
          </ScrollView>
        ) : (
          groups.map((group) => {
            const shown =
              display.grouping === "status" && finishedGroup(group.id)
                ? group.tasks.slice(0, FINISHED_SHOWN)
                : group.tasks;
            return (
              <Section key={group.id} title={`${group.title} · ${group.tasks.length}`}>
                {shown.map((task) => (
                  <View key={task.entity.id}>
                    <TaskRow task={task} statuses={statuses} spaceColor={colorOf(task)} />
                  </View>
                ))}
              </Section>
            );
          })
        )}
      </Screen>
    </>
  );
}
