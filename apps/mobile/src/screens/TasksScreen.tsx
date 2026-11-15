import { FixedTop } from "../ui/fixed-top.tsx";
import { PageActions } from "../ui/page-actions.tsx";
import { SaveBar } from "../ui/SaveBar.tsx";
import { ListEmpty } from "../ui/ListEmpty.tsx";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { labelOption, statusOption } from "./option-badges.tsx";
import { createView, setTaskStatus, updateViewConfig } from "@nookly/shared/data";
import {
  IconBolt,
  IconCalendarCheck,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCircleDot,
  IconClockEdit,
  IconClockPlus,
  IconLayoutKanban,
  IconList,
  IconPin,
  IconTag,
  IconPlus,
} from "@tabler/icons-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useDraftPreference } from "../data/preferences.ts";
import {
  useAllLabels,
  useSpaces,
  useStatuses,
  useTaskLabelIds,
  useTasks,
  useViews,
} from "../data/queries.ts";
import { Band } from "../ui/Band.tsx";
import { Button } from "../ui/Button.tsx";
import { ListHeader, Presets } from "../ui/ListBar.tsx";
import { ActiveFilters } from "../ui/ActiveFilters.tsx";
import type { ListFilter } from "../ui/ListControls.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { Screen } from "../ui/Screen.tsx";
import {
  DisplayGroup,
  FilterField,
  LayoutTiles,
  SelectRow,
  SwitchRow,
} from "../ui/sheet/DisplayParts.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { Text } from "../ui/Text.tsx";
import { TaskCard, TaskRow } from "./TaskRow.tsx";
import { StatusIcon } from "./StatusIcon.tsx";
import { Board } from "../ui/Board.tsx";
import {
  DEFAULT_DISPLAY,
  GROUPINGS,
  ORDERINGS,
  type BucketKey,
  type TaskDisplay,
  bucketFilters,
  displayFromView,
  displaySchema,
  groupTasks,
  viewConfigFromDisplay,
  NO_TASK_FILTERS,
} from "./task-view.ts";
import { useSyncRefresh } from "./useSyncRefresh.ts";
import { useSetting } from "../data/settings.ts";
import { useWeekStart } from "../ui/entity-filters.tsx";

/// How many finished tasks a group shows at first; the rest are a tap away in their Space.
const FINISHED_SHOWN = 10;

/// Layout, grouping and ordering: the desktop's Display popover as a sheet. A change is kept,
/// or made a View, from the save bar at the bottom of the page.
function DisplayPanel({
  display,
  onChange,
}: {
  display: TaskDisplay;
  onChange: (next: TaskDisplay) => void;
}) {
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
      <DisplayGroup>
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
      </DisplayGroup>
    </View>
  );
}

/// The desktop's icon for each of its other task filters.
const BUCKET_ICONS = {
  due: IconCalendarEvent,
  start: IconCalendarPlus,
  created: IconClockPlus,
  updated: IconClockEdit,
  completed: IconCalendarCheck,
  effort: IconBolt,
  pinned: IconPin,
} satisfies Record<BucketKey, typeof IconPin>;

/// The Tasks page's filters, for its Filter sheet and its chips alike.
function useTaskFilters(
  display: TaskDisplay,
  onChange: (next: TaskDisplay) => void,
  spaceId: string | null,
): ListFilter[] {
  const { data: statuses = [] } = useStatuses();
  const { data: labels = [] } = useAllLabels();
  const [scale] = useSetting("general.effortScale");
  const shownLabels = spaceId ? labels.filter((l) => l.spaceId === spaceId) : labels;
  return [
    {
      label: "Status",
      icon: IconCircleDot,
      values: display.statuses,
      options: statuses.map(statusOption),
      onChange: (next) => onChange({ ...display, statuses: next }),
    },
    ...(shownLabels.length > 0 || display.labels.length > 0
      ? [
          {
            label: "Labels",
            icon: IconTag,
            values: display.labels,
            options: shownLabels.map(labelOption),
            onChange: (next: string[]) => onChange({ ...display, labels: next }),
          },
        ]
      : []),
    ...bucketFilters(scale).map((field) => ({
      label: field.label,
      icon: BUCKET_ICONS[field.key],
      values: display[field.key],
      options: field.options,
      onChange: (next: string[]) => onChange({ ...display, [field.key]: next }),
    })),
  ];
}

/// What to narrow the list to: the desktop's Filter menu as a sheet.
function FilterPanel({ filters }: { filters: ListFilter[] }) {
  return (
    <DisplayGroup>
      {filters.map((field) => (
        <FilterField key={field.label} {...field} />
      ))}
    </DisplayGroup>
  );
}

/// Tasks of one Space, or every Space's (the cross Space overview), as a list or a
/// board, grouped, ordered and filtered the way the person chose. The overview opens as a list
/// by due date; a Space's tasks as a board where there is room (an iPad), else a list by status.
export function TasksScreen({ spaceId = null }: { spaceId?: string | null }) {
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
  const draft = useDraftPreference<TaskDisplay>(
    `tasks.display.${spaceId ?? "all"}`,
    displaySchema,
    initial,
  );
  const display = draft.value;
  const setDisplay = draft.set;
  const [panel, setPanel] = useState<"filter" | "display" | null>(null);
  const { view: requested } = useLocalSearchParams<{ view?: string }>();
  const view = draft.viewId ?? "all";
  const [note, setNote] = useState<string | null>(null);
  const shownLabels = spaceId ? labels.filter((l) => l.spaceId === spaceId) : labels;
  const weekStart = useWeekStart();
  // What the list and the board show depends on everything but which of them is shown, so a
  // switch between them builds nothing again (see `built` below).
  const contentKey = JSON.stringify({ ...display, layout: null });
  const groups = useMemo(
    () =>
      groupTasks(tasks, display, {
        statuses,
        labels: shownLabels,
        labelIdsOf: (id) => labelMap?.get(id) ?? [],
        spaces,
        weekStart,
      }),
    // `display` is read through `contentKey`, its layout left out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, contentKey, statuses, labels, labelMap, spaces, weekStart, spaceId],
  );
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
  // The layout shown follows the one picked a beat later, so the tile answers the finger at
  // once; each layout stays built once shown, behind the other, so switching back is instant.
  const layout = useDeferredValue(display.layout);
  const board = layout === "board";
  const [built, setBuilt] = useState<TaskDisplay["layout"][]>([layout]);
  if (!built.includes(layout)) setBuilt([...built, layout]);
  const hiddenUnless = (on: boolean) => (on ? undefined : { display: "none" as const });
  const moveTo = useLocalWrite((db, move: { id: string; statusId: string }) =>
    setTaskStatus(db, move.id, move.statusId),
  );
  const move = useRef(moveTo);
  move.current = moveTo;
  const openView = (id: string) => {
    if (id === "all") {
      draft.open(null);
      setNote(null);
      return;
    }
    const saved = views.find((v) => v.entity.id === id);
    if (!saved) return;
    const { display: next, ignored } = displayFromView(saved.config, {
      statusIds: statuses.map((s) => s.id),
      labelIds: labels.map((l) => l.id),
    });
    draft.open({ id, value: next });
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
  const filters = useTaskFilters(display, setDisplay, spaceId);
  const viewSpace = spaceId ?? spaces[0]?.id;
  const saveView = useLocalWrite((db, id: string) =>
    updateViewConfig(db, id, viewConfigFromDisplay(display)),
  );
  const saveAsView = useLocalWrite((db, title: string) => {
    if (!viewSpace) throw new Error("Make a Space first.");
    return createView(db, viewSpace, {
      title,
      module: spaceId ? "tasks" : "tasks-overview",
      config: viewConfigFromDisplay(display),
    });
  });
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
  const boardBlock = useMemo(
    () =>
      built.includes("board") ? (
        <Board
          columns={(display.grouping === "status"
            ? // Every status a card can go to, empty ones too, as the desktop's board.
              statuses
                .filter(
                  (s) =>
                    (display.statuses.length === 0 || display.statuses.includes(s.id)) &&
                    (display.showFinished || s.doneness < 100),
                )
                .map((s) => ({
                  id: s.id,
                  title: s.name,
                  tasks: groups.find((g) => g.id === s.id)?.tasks ?? [],
                }))
            : groups
          ).map((group) => ({
            id: group.id,
            title: group.title,
            icon:
              display.grouping === "status" ? (
                <StatusIcon status={statuses.find((s) => s.id === group.id)} size={16} />
              ) : undefined,
            items: group.tasks,
            footer:
              display.grouping === "status" ? (
                <View className="items-start">
                  <Button
                    label={`New Task in ${group.title}`}
                    variant="ghost"
                    size="sm"
                    onPress={() => newTask(group.id)}
                  />
                </View>
              ) : undefined,
          }))}
          keyOf={(task) => task.entity.id}
          labelOf={(task) => task.entity.title || "Untitled"}
          onOpen={(task) => router.push(`/entity/${task.entity.id}`)}
          onMove={
            display.grouping === "status"
              ? (task, statusId) => move.current.mutate({ id: task.entity.id, statusId })
              : undefined
          }
          renderCard={(task) => {
            const space = spaceOf(task);
            return (
              <TaskCard
                task={task}
                statuses={statuses}
                spaceColor={space?.color}
                spaceName={space?.name}
                labels={labelsOf(task)}
              />
            );
          }}
        />
      ) : null,
    // Built from the same things as `groups`; `display` read through `contentKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [built, groups, contentKey, statuses, labels, labelMap, spaces],
  );
  const listBlock = useMemo(
    () =>
      built.includes("list") ? (
        <>
          {groups.map((group) => {
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
                <View>
                  {shown.map((task) => (
                    <View key={task.entity.id}>{row(task)}</View>
                  ))}
                </View>
              </Band>
            );
          })}
        </>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [built, groups, contentKey, statuses, labels, labelMap, spaces],
  );
  return (
    <>
      <Screen onRefresh={onRefresh} refreshing={refreshing} wide={board}>
        <PageActions
          actions={[
            {
              label: "New Task",
              icon: IconPlus,
              toolbarIcon: TOOLBAR_ICONS.plus,
              onPress: () => newTask(),
              primary: true,
            },
          ]}
        />
        <FixedTop>
          <ListHeader title="Tasks" count={tasks.length} panel={panel} onPanel={setPanel} />
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
          <ActiveFilters filters={filters} />
        </FixedTop>
        <Sheet
          open={panel === "filter"}
          onOpenChange={(open) => !open && setPanel(null)}
          title="Filter"
          kind="picker"
          wide
        >
          <FilterPanel filters={filters} />
        </Sheet>
        <Sheet
          open={panel === "display"}
          onOpenChange={(open) => !open && setPanel(null)}
          title="Display"

          kind="picker"
          wide
        >
          <DisplayPanel display={display} onChange={setDisplay} />
        </Sheet>
        {note ? (
          <Text variant="small" tone="muted">
            {note}
          </Text>
        ) : null}
        <ListEmpty
          glyph={MODULE_ICONS.tasks}
          total={tasks.length}
          shown={groups.length}
          nothingYet={{ title: "No Tasks", message: "Tap + to add one." }}
          onClear={() => setDisplay({ ...display, ...NO_TASK_FILTERS })}
        />
        <View style={hiddenUnless(board)}>{boardBlock}</View>
        <View testID="tasks-list" className="gap-5" style={hiddenUnless(!board)}>
          {listBlock}
        </View>
        <SaveBar
          dirty={draft.dirty}
          onDiscard={draft.discard}
          onSave={async () => {
            if (draft.viewId) {
              await saveView.mutateAsync(draft.viewId);
              draft.commit();
            } else draft.save();
          }}
          // An open View saves into itself; only the page's own makes a new one.
          onSaveAsView={
            draft.viewId
              ? undefined
              : async (title) => {
                  const id = await saveAsView.mutateAsync(title);
                  draft.open({ id, value: display });
                }
          }
        />
      </Screen>
    </>
  );
}
