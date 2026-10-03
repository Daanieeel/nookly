import {
  IconBan,
  IconCalendarEvent,
  IconChecklist,
  IconCircleDot,
  IconEye,
  IconEyeOff,
  IconFolder,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useMemo, useState } from "react";
import { z } from "zod";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityKeyCopyInline } from "#/components/entity-key.tsx";
import { type ActiveFilter, type FilterField, FilterMenu } from "#/components/filter-menu.tsx";
import { type GroupDef, buildGroups } from "#/components/grouped-view/grouping.ts";
import { GroupedList } from "#/components/grouped-view/grouped-list.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { listSpaces } from "#/lib/api/spaces.ts";
import { listTaskStatuses, listTasksAll } from "#/lib/api/tasks.ts";
import type { Space, Task } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { preferences } from "#/lib/preferences.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import {
  TaskDueColumns,
  TaskStatusControl,
  TasksDataContext,
  type TasksData,
} from "./task-controls";
import { taskGroupDefs } from "./task-groups";
import { DUE_BUCKETS, orderTasks, passesFilters, sortStatuses, statusKind } from "./task-model";
import { TaskStatusIcon } from "./task-properties";

const OVERVIEW_GROUPINGS = [
  { id: "due", label: "Due date", icon: IconCalendarEvent },
  { id: "status", label: "Status", icon: IconCircleDot },
  { id: "space", label: "Space", icon: IconFolder },
  { id: "none", label: "No grouping", icon: IconBan },
] as const;

const groupingSchema = z.enum(["due", "status", "space", "none"]).catch("due");

const displaySchema = z.object({
  grouping: groupingSchema,
  showCompleted: z.boolean().catch(false),
});

type OverviewDisplay = z.infer<typeof displaySchema>;

function readDisplay(): OverviewDisplay {
  try {
    const raw = preferences.get(STORAGE_KEYS.tasksOverview);
    return displaySchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return displaySchema.parse({});
  }
}

const NO_FILTERS: ActiveFilter[] = [];

/// The sixth cross-Space exception (`docs/04-navigation-spaces.md`): every Space's
/// tasks in one list, below Calendar in the sidebar. Each row carries its Space's
/// color so it reads where the task lives. Open and edit work as in a Space's own
/// Tasks page; creating a task still happens inside its Space.
export function TasksOverviewView() {
  const openEntity = useNavStore((s) => s.openEntity);
  const [display, setDisplay] = useState(readDisplay);
  const [filters, setFilters] = useState(NO_FILTERS);

  const update = (patch: Partial<OverviewDisplay>) => {
    const next = { ...display, ...patch };
    preferences.set(STORAGE_KEYS.tasksOverview, JSON.stringify(next));
    setDisplay(next);
  };

  const { data: tasks = [], isPending } = useQuery({
    queryKey: qk.tasks.all,
    queryFn: listTasksAll,
  });
  const { data: rawStatuses = [] } = useQuery({
    queryKey: qk.tasks.statuses,
    queryFn: listTaskStatuses,
  });
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  const base = useMemo<TasksData>(() => {
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
    };
  }, [rawStatuses]);
  const { statuses, kindOf } = base;

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
          return (display.showCompleted || !finished) && passesFilters(t, filters);
        }),
        "due",
        statuses,
      ),
    [tasks, filters, display.showCompleted, statuses, kindOf],
  );

  const groups = useMemo(() => {
    const defs =
      display.grouping === "space"
        ? spaceGroupDefs(spaces)
        : taskGroupDefs(display.grouping, statuses, [], kindOf);
    return buildGroups(
      visible,
      defs ?? [{ id: "all", name: "All tasks", match: () => true }],
      null,
    ).filter((g) => g.items.length > 0);
  }, [visible, display.grouping, spaces, statuses, kindOf]);

  return (
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
            aria-pressed={display.showCompleted}
            onClick={() => update({ showCompleted: !display.showCompleted })}
          >
            {display.showCompleted ? <IconEye /> : <IconEyeOff />}
            Completed
          </Button>
          <Select
            value={display.grouping}
            onValueChange={(value) => update({ grouping: groupingSchema.parse(value) })}
          >
            <SelectTrigger size="sm" className="w-40" aria-label="Grouping">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OVERVIEW_GROUPINGS.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <g.icon />
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      ) : (
        <GroupedList
          groups={groups}
          showHeaders={display.grouping !== "none"}
          getKey={(task) => task.entity.id}
          renderRow={(task) => (
            <OverviewTaskRow
              task={task}
              base={base}
              space={spaceById.get(task.entity.spaceId)}
              onOpen={() => openEntity(task.entity.id, task.entity.spaceId)}
            />
          )}
        />
      )}
    </div>
  );
}

/// A Space's color as a small dot.
function SpaceDot({ space }: { space: Space }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full bg-(--space-color)"
      // SAFETY: `--space-color` only ever receives `space.color`, a plain hex string.
      style={{ "--space-color": space.color } as CSSProperties}
    />
  );
}

function spaceGroupDefs(spaces: Space[]): GroupDef<Task>[] {
  return spaces.map((space) => ({
    id: space.id,
    name: space.name,
    icon: (
      <span className="flex size-3.5 items-center justify-center">
        <SpaceDot space={space} />
      </span>
    ),
    match: (t) => t.entity.spaceId === space.id,
  }));
}

/// One task: status, due date, ID, title and its Space, color coded. The inline controls
/// read the task's own Space from a context of their own, since the page spans all of them.
function OverviewTaskRow({
  task,
  base,
  space,
  onOpen,
}: {
  task: Task;
  base: TasksData;
  space: Space | undefined;
  onOpen: () => void;
}) {
  const data = useMemo(() => ({ ...base, spaceId: task.entity.spaceId }), [base, task]);
  const title = displayTitle(task.entity);
  return (
    <TasksDataContext.Provider value={data}>
      <div
        className="relative flex h-11 items-center gap-2 border-b border-border/60 px-4 transition-colors focus-within:bg-accent/50 hover:bg-accent/40"
        {...entityTarget(task.entity)}
      >
        <button
          type="button"
          data-task-row
          aria-label={`Open ${title}`}
          onClick={onOpen}
          className="absolute inset-0 cursor-pointer outline-none"
        />
        <TaskStatusControl task={task} />
        <TaskDueColumns task={task} />
        <span className="relative hidden w-20 shrink-0 sm:flex">
          <EntityKeyCopyInline entityKey={task.entity.key} className="-ml-1" />
        </span>
        <span className="pointer-events-none relative min-w-0 flex-1 truncate text-sm">
          {title}
        </span>
        {space && (
          <span
            title={`Space: ${space.name}`}
            className="pointer-events-none relative flex max-w-40 shrink-0 items-center gap-1.5 rounded-md border border-(--space-color)/40 bg-(--space-color)/10 px-1.5 py-0.5 text-xs text-foreground"
            // SAFETY: `--space-color` only ever receives `space.color`, a plain hex string.
            style={{ "--space-color": space.color } as CSSProperties}
          >
            <SpaceDot space={space} />
            <span className="truncate">{space.name}</span>
          </span>
        )}
      </div>
    </TasksDataContext.Provider>
  );
}
