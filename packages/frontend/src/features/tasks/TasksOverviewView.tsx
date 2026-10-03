import {
  IconBolt,
  IconCalendarCheck,
  IconCalendarEvent,
  IconCalendarPlus,
  IconChecklist,
  IconCircleDot,
  IconClockEdit,
  IconClockPlus,
  IconFolder,
  IconPlus,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { EditableViewTitle } from "#/features/views/EditableViewTitle.tsx";
import { ViewPresetsButton } from "#/features/views/ViewPresetsButton.tsx";
import { ViewSaveBar } from "#/features/views/ViewActions.tsx";
import { ViewIconButton } from "#/features/views/ViewIconButton.tsx";
import { useViewPage } from "#/features/views/use-view-page.ts";
import { EmptyState } from "#/components/empty-state.tsx";
import { type ActiveFilter, type FilterField, FilterMenu } from "#/components/filter-menu.tsx";
import { type ViewGroup, buildGroups } from "#/components/grouped-view/grouping.ts";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";
import { TASKS_OVERVIEW } from "#/lib/api/views.ts";
import { AGE_BUCKETS } from "#/features/assignments/assignment-model.ts";
import { EFFORT_STEPS, effortLabel, useEffortSettings } from "#/lib/effort.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { listTaskStatuses, listTasksAll, updateTaskStatus } from "#/lib/api/tasks.ts";
import type { Task } from "#/lib/api/types.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { TaskBoard } from "./TaskBoard";
import { SpaceDot } from "#/components/space-chip.tsx";
import { TasksDataContext, type TasksData, useTasksDataValue } from "./task-controls";
import { QuickCreateTask, type TaskDraft } from "./QuickCreateTask";
import { TaskDisplayMenu } from "./TaskDisplayMenu";
import { taskGroupDefs } from "./task-groups";
import { TaskList } from "./TaskList";
import {
  COMPLETED_BUCKETS,
  DUE_BUCKETS,
  NO_EFFORT,
  START_BUCKETS,
  TASK_VIEW_PRESETS,
  describeDisplay,
  type Grouping,
  orderTasks,
  passesFilters,
  normalizeDisplay,
  readOverviewDisplay,
  sortStatuses,
  statusKind,
  writeOverviewDisplay,
} from "./task-model";
import { TaskStatusIcon } from "./task-properties";

const NO_FILTERS: ActiveFilter[] = [];
const NO_CREATE = () => undefined;
const NO_DRAFT: TaskDraft = {};

/// The sixth cross-Space exception (`docs/04-navigation-spaces.md`): every Space's
/// tasks in one list or board, below Calendar in the sidebar. Each row and card carries
/// its Space's color. It filters, groups, orders and edits in place like a Space's own
/// Tasks page; creating a task still happens inside its Space.
/// Gives the create dialog the statuses and labels of the Space it will create in.
function ScopedTasksData({ spaceId, children }: { spaceId: string; children: React.ReactNode }) {
  return (
    <TasksDataContext.Provider value={useTasksDataValue(spaceId)}>
      {children}
    </TasksDataContext.Provider>
  );
}

export function TasksOverviewView({ viewId }: { viewId?: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { display, setDisplay, filters, setFilters, view, dirty, save, discard } = useViewPage({
    // A cross-Space page has no Space of its own; a View's own is read from it.
    spaceId: "",
    module: TASKS_OVERVIEW,
    viewId,
    readDisplay: readOverviewDisplay,
    normalizeDisplay,
    remember: writeOverviewDisplay,
    filtersKey: STORAGE_KEYS.tasksOverviewFilters,
    defaultFilters: NO_FILTERS,
  });

  const { data: tasks = [], isPending } = useQuery({
    queryKey: qk.tasks.all,
    queryFn: listTasksAll,
  });
  const { data: rawStatuses = [] } = useQuery({
    queryKey: qk.tasks.statuses,
    queryFn: listTaskStatuses,
  });
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });

  const data = useMemo<TasksData>(() => {
    const statuses = sortStatuses(rawStatuses);
    const statusById = new Map(statuses.map((s) => [s.id, s]));
    return {
      spaceId: "",
      statuses,
      // Labels belong to a Space, so the overview shows none.
      labels: [],
      statusById,
      labelById: new Map(),
      kindOf: (id) => {
        const status = statusById.get(id);
        return status ? statusKind(status, statuses) : "unstarted";
      },
      spaces: new Map(spaces.map((s) => [s.id, s])),
    };
  }, [rawStatuses, spaces]);
  const { statuses, kindOf } = data;
  // A new View or task starts in the Space being worked in, else the first.
  const saveSpaceId = spaces.find((s) => s.id === activeSpaceId)?.id ?? spaces[0]?.id ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const [createSpaceId, setCreateSpaceId] = useState("");
  const startCreate = useCallback(() => {
    setCreateSpaceId(saveSpaceId);
    setCreateOpen(true);
  }, [saveSpaceId]);
  useCreateShortcut(startCreate);
  const effortScale = useEffortSettings((s) => s.scale);
  // Labels belong to a Space, so a View made from a preset may name them without them showing.
  const properties = display.properties.filter((p) => p !== "labels");

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        id: "space",
        label: "Space",
        icon: IconFolder,
        options: spaces.map((space) => ({
          value: space.id,
          label: space.name,
          icon: <SpaceDot space={space} />,
        })),
      },
      {
        id: "status",
        label: "Status",
        icon: IconCircleDot,
        options: statuses.map((s) => ({
          value: s.id,
          label: s.name,
          icon: <TaskStatusIcon status={s} kind={kindOf(s.id)} />,
        })),
      },
      {
        id: "due",
        label: "Due date",
        icon: IconCalendarEvent,
        options: DUE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
      {
        id: "start",
        label: "Start date",
        icon: IconCalendarPlus,
        options: START_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
      {
        id: "created",
        label: "Created",
        icon: IconClockPlus,
        options: AGE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
      {
        id: "updated",
        label: "Updated",
        icon: IconClockEdit,
        options: AGE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
      {
        id: "completed",
        label: "Completed",
        icon: IconCalendarCheck,
        options: COMPLETED_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
      {
        id: "effort",
        label: "Effort",
        icon: IconBolt,
        options: [
          ...EFFORT_STEPS.map((step) => ({
            value: String(step.value),
            label: effortLabel(step.value, effortScale),
          })),
          { value: NO_EFFORT, label: "No estimate" },
        ],
      },
    ],
    [spaces, statuses, kindOf, effortScale],
  );

  const visible = useMemo(
    () =>
      orderTasks(
        tasks.filter((t) => {
          return passesFilters(t, filters);
        }),
        display.ordering,
        statuses,
      ),
    [tasks, filters, display.ordering, statuses, kindOf],
  );

  const groups = useMemo(() => {
    const defs = taskGroupDefs(display.grouping, statuses, [], kindOf, spaces);
    const subDefs = taskGroupDefs(display.subGrouping, statuses, [], kindOf, spaces);
    const all = buildGroups(
      visible,
      defs ?? [{ id: "all", name: "All tasks", match: () => true }],
      subDefs,
    );
    const showEmpty = display.showEmpty[display.layout] && display.grouping !== "none";
    return all.filter((g) => showEmpty || g.items.length > 0);
  }, [visible, display, statuses, kindOf, spaces]);

  const move = useMutation({
    mutationFn: ({ task, statusId }: { task: Task; statusId: string }) =>
      updateTaskStatus(task.entity.id, statusId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.tasks.root }),
  });
  const failedTaskId = move.isError ? move.variables?.task.entity.id : undefined;

  /// Only status can change by dropping a card; a Space is where a task lives.
  const dropKinds = new Set<Grouping>([display.grouping, display.subGrouping]);
  const boardDraggable = dropKinds.has("status");
  const onMove = (
    task: Task,
    columnId: string,
    laneId: string | null,
    from: { columnId: string; laneId: string | null },
  ) => {
    const target = display.grouping === "status" ? columnId : laneId;
    const source = display.grouping === "status" ? from.columnId : from.laneId;
    if (target && target !== source && target !== task.statusId) {
      move.mutate({ task, statusId: target });
    }
  };
  const openTask = (task: Task) => openEntity(task.entity.id, task.entity.spaceId);
  const columns: ViewGroup<Task>[] = groups;

  return (
    <TasksDataContext.Provider value={data}>
      <div className="relative flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 flex-col gap-2.5 border-b border-border py-2 pr-2 pl-4">
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="flex h-8 items-center gap-2 text-sm font-medium">
              {view ? (
                <ViewIconButton entity={view.entity} />
              ) : (
                <IconChecklist size={16} className="text-muted-foreground" />
              )}
              {view ? <EditableViewTitle entity={view.entity} /> : "Tasks"}
            </h1>
            <div className="flex-1" />
            <ViewPresetsButton
              spaceId={saveSpaceId}
              spaces={spaces}
              module={TASKS_OVERVIEW}
              presets={TASK_VIEW_PRESETS}
              fields={filterFields}
              describeDisplay={describeDisplay}
            />
            <FilterMenu
              fields={filterFields}
              filters={filters}
              onFiltersChange={setFilters}
              part="button"
            />
            <TaskDisplayMenu display={display} onChange={setDisplay} columns={columns} crossSpace />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="ml-1 gap-1.5"
                  disabled={spaces.length === 0}
                  onClick={startCreate}
                >
                  <IconPlus />
                  New task
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                Create a task <Kbd>C</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
          <FilterMenu
            fields={filterFields}
            filters={filters}
            onFiltersChange={setFilters}
            part="chips"
          />
        </header>
        <ViewSaveBar
          view={view}
          dirty={dirty}
          save={save}
          onDiscard={discard}
          spaceId={saveSpaceId}
          spaces={spaces}
          module={TASKS_OVERVIEW}
          filters={filters}
          display={display}
        />

        {!isPending && tasks.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={IconChecklist}
              title="No tasks yet"
              description="Tasks from every Space show up here. Create them inside a Space."
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm text-muted-foreground">No tasks match this view.</p>
            {filters.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
                Clear filters
              </Button>
            )}
          </div>
        ) : display.layout === "board" ? (
          <TaskBoard
            groups={groups.filter((g) => !display.hiddenColumns.includes(g.id))}
            properties={properties}
            highlightId={null}
            failedTaskId={failedTaskId}
            draggable={boardDraggable}
            onOpen={openTask}
            onMove={onMove}
            onCreateIn={NO_CREATE}
          />
        ) : (
          <TaskList
            groups={groups}
            showHeaders={display.grouping !== "none"}
            properties={properties}
            highlightId={null}
            onOpen={openTask}
            onCreateIn={NO_CREATE}
          />
        )}
      </div>
      {createSpaceId && (
        <ScopedTasksData spaceId={createSpaceId}>
          <QuickCreateTask
            open={createOpen}
            draft={NO_DRAFT}
            spaces={spaces}
            onSpaceChange={setCreateSpaceId}
            onOpenChange={setCreateOpen}
            onCreated={() => {}}
          />
        </ScopedTasksData>
      )}
    </TasksDataContext.Provider>
  );
}
