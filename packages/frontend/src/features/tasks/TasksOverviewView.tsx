import {
  IconCalendarEvent,
  IconChecklist,
  IconCircleDot,
  IconEye,
  IconEyeOff,
  IconFolder,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyState } from "#/components/empty-state.tsx";
import { type ActiveFilter, type FilterField, FilterMenu } from "#/components/filter-menu.tsx";
import { type ViewGroup, buildGroups } from "#/components/grouped-view/grouping.ts";
import { Button } from "@nookly/ui/components/button";
import { listSpaces } from "#/lib/api/spaces.ts";
import { listTaskStatuses, listTasksAll, updateTaskStatus } from "#/lib/api/tasks.ts";
import type { Task } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { TaskBoard } from "./TaskBoard";
import { SpaceDot, TasksDataContext, type TasksData } from "./task-controls";
import { TaskDisplayMenu } from "./TaskDisplayMenu";
import { taskGroupDefs } from "./task-groups";
import { TaskList } from "./TaskList";
import {
  DUE_BUCKETS,
  type DisplayOptions,
  type Grouping,
  type OverviewPrefs,
  orderTasks,
  passesFilters,
  readOverviewPrefs,
  sortStatuses,
  statusKind,
  writeOverviewPrefs,
} from "./task-model";
import { TaskStatusIcon } from "./task-properties";

const NO_FILTERS: ActiveFilter[] = [];
const NO_CREATE = () => undefined;

/// The sixth cross-Space exception (`docs/04-navigation-spaces.md`): every Space's
/// tasks in one list or board, below Calendar in the sidebar. Each row and card carries
/// its Space's color. It filters, groups, orders and edits in place like a Space's own
/// Tasks page; creating a task still happens inside its Space.
export function TasksOverviewView() {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [prefs, setPrefs] = useState(readOverviewPrefs);
  const [filters, setFilters] = useState(NO_FILTERS);
  const { display, showCompleted } = prefs;

  const update = (patch: Partial<OverviewPrefs>) => {
    const next = { ...prefs, ...patch };
    writeOverviewPrefs(next);
    setPrefs(next);
  };
  const setDisplay = (next: DisplayOptions) => update({ display: next });

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
    ],
    [spaces, statuses, kindOf],
  );

  const visible = useMemo(
    () =>
      orderTasks(
        tasks.filter((t) => {
          const kind = kindOf(t.statusId);
          const finished = kind === "completed" || kind === "canceled";
          return (showCompleted || !finished) && passesFilters(t, filters);
        }),
        display.ordering,
        statuses,
      ),
    [tasks, filters, showCompleted, display.ordering, statuses, kindOf],
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
              <IconChecklist size={16} className="text-muted-foreground" />
              Tasks
            </h1>
            <div className="flex-1" />
            <FilterMenu
              fields={filterFields}
              filters={filters}
              onFiltersChange={setFilters}
              part="button"
            />
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              aria-pressed={showCompleted}
              onClick={() => update({ showCompleted: !showCompleted })}
            >
              {showCompleted ? <IconEye /> : <IconEyeOff />}
              Completed
            </Button>
            <TaskDisplayMenu display={display} onChange={setDisplay} columns={columns} crossSpace />
          </div>
          <FilterMenu
            fields={filterFields}
            filters={filters}
            onFiltersChange={setFilters}
            part="chips"
          />
        </header>

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
            properties={display.properties}
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
            properties={display.properties}
            highlightId={null}
            onOpen={openTask}
            onCreateIn={NO_CREATE}
          />
        )}
      </div>
    </TasksDataContext.Provider>
  );
}
