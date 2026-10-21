import { createView } from "@nookly/shared/data";
import { CARD_CLASSES } from "@nookly/ui/classes";
import {
  IconAdjustmentsHorizontal,
  IconFilter,
  IconLayoutKanban,
  IconList,
} from "@tabler/icons-react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import {
  useAllLabels,
  useSpaces,
  useStatuses,
  useTaskLabelIds,
  useTasks,
  useViews,
} from "../data/queries.ts";
import { Band } from "../ui/Band.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { ListTitle, Presets } from "../ui/ListBar.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Field } from "../ui/Field.tsx";
import { Empty, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { FilterField, LayoutTiles, SelectRow, SwitchRow } from "../ui/sheet/DisplayParts.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { StatusIcon, TaskRow } from "./TaskRow.tsx";
import {
  DEFAULT_DISPLAY,
  GROUPINGS,
  ORDERINGS,
  type TaskDisplay,
  displayFromView,
  displaySchema,
  groupTasks,
  viewConfigFromDisplay,
} from "./task-view.ts";
import { useSyncRefresh } from "./useSyncRefresh.ts";

/// How many finished tasks a group shows at first; the rest are a tap away in their Space.
const FINISHED_SHOWN = 10;

/// Layout, grouping and ordering, remembered on this phone like the desktop remembers
/// them per page: the desktop's Display popover as a sheet.
function DisplayPanel({
  display,
  onChange,
  spaceId,
}: {
  display: TaskDisplay;
  onChange: (next: TaskDisplay) => void;
  spaceId: string | null;
}) {
  const module = spaceId ? "tasks" : "tasks-overview";
  const { data: allSpaces = [] } = useSpaces();
  const [name, setName] = useState("");
  const save = useLocalWrite((db, title: string) => {
    const space = spaceId ?? allSpaces[0]?.id;
    if (!space) throw new Error("Make a Space first.");
    return createView(db, space, { title, module, config: viewConfigFromDisplay(display) });
  });
  return (
    <View className="gap-3">
      <LayoutTiles
        tiles={[
          { id: "list", label: "List", icon: IconList },
          { id: "board", label: "Board", icon: IconLayoutKanban },
        ]}
        value={display.layout}
        onSelect={(layout) => onChange({ ...display, layout })}
      />
      <View>
        <SelectRow
          label="Grouping"
          value={display.grouping}
          options={[...GROUPINGS]}
          onChange={(grouping) => onChange({ ...display, grouping })}
        />
        <SelectRow
          label="Ordering"
          value={display.ordering}
          options={[...ORDERINGS]}
          onChange={(ordering) => onChange({ ...display, ordering })}
        />
        <SwitchRow
          label="Show finished"
          value={display.showFinished}
          onChange={(showFinished) => onChange({ ...display, showFinished })}
        />
      </View>
      <View className="flex-row items-end gap-2 border-t border-border pt-3">
        <View className="flex-1">
          <Field label="View name" placeholder="Open work" value={name} onChangeText={setName} />
        </View>
        <Button
          label="Save View"
          variant="secondary"
          status={statusOf(save)}
          errorLabel="Couldn't save"
          onPress={() => name.trim() && save.mutate(name.trim(), { onSuccess: () => setName("") })}
        />
      </View>
    </View>
  );
}

/// What to narrow the list to, statuses and labels: the desktop's Filter menu as a sheet.
function FilterPanel({
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
  return (
    <View>
      <FilterField
        label="Status"
        values={display.statuses}
        options={statuses.map((s) => ({
          id: s.id,
          label: s.name,
          icon: <StatusIcon status={s} size={16} />,
        }))}
        onChange={(next) => onChange({ ...display, statuses: next })}
      />
      {shownLabels.length > 0 ? (
        <FilterField
          label="Labels"
          values={display.labels}
          options={shownLabels.map((l) => ({
            id: l.id,
            label: l.name,
            icon: <View className="size-2 rounded-full" style={{ backgroundColor: l.color }} />,
          }))}
          onChange={(next) => onChange({ ...display, labels: next })}
        />
      ) : null}
    </View>
  );
}

/// Tasks of one Space, or every Space's (the cross Space overview), as a list or a
/// board, grouped, ordered and filtered the way the person chose. The overview opens as a list
/// by due date; a Space's tasks as a board where there is room (an iPad), else a list by status.
export function TasksScreen({ spaceId = null }: { spaceId?: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  const tablet = useIsTablet();
  const { data: tasks = [] } = useTasks(spaceId);
  const { data: statuses = [] } = useStatuses();
  const { data: spaces = [] } = useSpaces();
  const { data: labels = [] } = useAllLabels();
  const { data: labelMap } = useTaskLabelIds(
    spaceId,
    tasks.map((t) => t.entity.id),
  );
  const module = spaceId ? "tasks" : "tasks-overview";
  const { data: views = [] } = useViews(spaceId ? { spaceId, module } : { module });
  const { refreshing, onRefresh } = useSyncRefresh();
  const initial: TaskDisplay = spaceId
    ? tablet
      ? { ...DEFAULT_DISPLAY, layout: "board" }
      : DEFAULT_DISPLAY
    : { ...DEFAULT_DISPLAY, grouping: "due" };
  const [display, setDisplay] = usePreference<TaskDisplay>(
    `tasks.display.${spaceId ?? "all"}`,
    displaySchema,
    initial,
  );
  const [panel, setPanel] = useState<"filter" | "display" | null>(null);
  const { view: requested } = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState("all");
  const [note, setNote] = useState<string | null>(null);
  const shownLabels = spaceId ? labels.filter((l) => l.spaceId === spaceId) : labels;
  const groups = groupTasks(tasks, display, {
    statuses,
    labels: shownLabels,
    labelIdsOf: (id) => labelMap?.get(id) ?? [],
    spaces,
  });
  const spaceOf = (task: (typeof tasks)[number]) =>
    spaceId ? undefined : spaces.find((s) => s.id === task.entity.spaceId);
  const labelsOf = (task: (typeof tasks)[number]) =>
    (labelMap?.get(task.entity.id) ?? []).flatMap((id) => labels.filter((l) => l.id === id));
  const newTask = (statusId?: string) =>
    router.push(
      `/new/task${spaceId ? `?spaceId=${spaceId}` : ""}${
        statusId ? `${spaceId ? "&" : "?"}statusId=${statusId}` : ""
      }`,
    );
  const finishedGroup = (status: string) =>
    (statuses.find((s) => s.id === status)?.doneness ?? 0) >= 100;
  const board = display.layout === "board";
  const openView = (id: string) => {
    setView(id);
    if (id === "all") {
      setDisplay(initial);
      setNote(null);
      return;
    }
    const saved = views.find((v) => v.entity.id === id);
    if (!saved) return;
    const { display: next, ignored } = displayFromView(saved.config, {
      statusIds: statuses.map((s) => s.id),
      labelIds: labels.map((l) => l.id),
    });
    setDisplay(next);
    setNote(
      ignored.length > 0
        ? `This view also uses ${ignored.join(", ")}, which the phone doesn't show yet.`
        : null,
    );
  };
  // A view picked in the sidebar opens once the list of views is here.
  useEffect(() => {
    if (requested && views.some((v) => v.entity.id === requested)) openView(requested);
    // Only when the request or the views change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, views.length]);
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const active = [
    ...display.statuses.map((id) => ({
      key: `status-${id}`,
      label: statuses.find((s) => s.id === id)?.name ?? id,
      remove: () => setDisplay({ ...display, statuses: toggle(display.statuses, id) }),
    })),
    ...display.labels.map((id) => ({
      key: `label-${id}`,
      label: labels.find((l) => l.id === id)?.name ?? id,
      remove: () => setDisplay({ ...display, labels: toggle(display.labels, id) }),
    })),
  ];
  const row = (task: (typeof tasks)[number]) => {
    const space = spaceOf(task);
    return (
      <TaskRow
        task={task}
        statuses={statuses}
        spaceColor={space?.color}
        spaceName={space?.name}
        labels={labelsOf(task)}
      />
    );
  };
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={TOOLBAR_ICONS.plus}
          iconRenderingMode="template"
          accessibilityLabel="New Task"
          onPress={() => newTask()}
        />
      </Stack.Toolbar>
      <Screen onRefresh={onRefresh} refreshing={refreshing} wide={board}>
        <ListTitle title="Tasks" count={tasks.length} />
        {views.length > 0 ? (
          <Presets
            label="Views"
            value={view}
            onChange={openView}
            options={[
              { id: "all", label: "All" },
              ...views.map((v) => ({ id: v.entity.id, label: v.entity.title || "Untitled" })),
            ]}
          />
        ) : null}
        <View className="flex-row items-center gap-2">
          <Button
            label="Filter"
            variant={panel === "filter" ? "secondary" : "ghost"}
            size="sm"
            icon={<IconFilter size={16} color={theme.colors.foreground} />}
            onPress={() => setPanel((open) => (open === "filter" ? null : "filter"))}
          />
          <Button
            label="Display"
            variant={panel === "display" ? "secondary" : "ghost"}
            size="sm"
            icon={<IconAdjustmentsHorizontal size={16} color={theme.colors.foreground} />}
            onPress={() => setPanel((open) => (open === "display" ? null : "display"))}
          />
        </View>
        {active.length > 0 ? (
          <ChipGroup label="Active filters" multiple>
            {active.map((f) => (
              <Chip key={f.key} label={`${f.label} ×`} multiple selected onPress={f.remove} />
            ))}
          </ChipGroup>
        ) : null}
        <Sheet
          open={panel === "filter"}
          onOpenChange={(open) => !open && setPanel(null)}
          title="Filter"
        >
          <FilterPanel display={display} onChange={setDisplay} spaceId={spaceId} />
        </Sheet>
        <Sheet
          open={panel === "display"}
          onOpenChange={(open) => !open && setPanel(null)}
          title="Display"
        >
          <DisplayPanel display={display} onChange={setDisplay} spaceId={spaceId} />
        </Sheet>
        {note ? (
          <Text variant="small" tone="muted">
            {note}
          </Text>
        ) : null}
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
                    <View key={task.entity.id}>{row(task)}</View>
                  ))}
                </Section>
                {display.grouping === "status" ? (
                  <View className="items-start">
                    <Button
                      label={`New Task in ${group.title}`}
                      variant="ghost"
                      size="sm"
                      onPress={() => newTask(group.id)}
                    />
                  </View>
                ) : null}
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
              <Band
                key={group.id}
                icon={null}
                title={group.title}
                count={group.tasks.length}
                initiallyOpen={
                  !(display.grouping === "status" && finishedGroup(group.id)) && group.id !== "done"
                }
              >
                <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden")}>
                  <View className="-mb-px">
                    {shown.map((task) => (
                      <View key={task.entity.id}>{row(task)}</View>
                    ))}
                  </View>
                </View>
              </Band>
            );
          })
        )}
      </Screen>
    </>
  );
}
