import {
  IconCalendarEvent,
  IconCalendarPlus,
  IconBolt,
  IconCalendarCheck,
  IconCalendarStats,
  IconChecklist,
  IconCircleDot,
  IconClockEdit,
  IconClockPlus,
  IconPlus,
  IconSchool,
  IconTag,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SUCCESS_REVERT_MS } from "#/components/action-feedback.tsx";
import { contextTarget, entityTarget } from "#/components/context-menu/registry.ts";
import { ViewIconButton } from "#/features/views/ViewIconButton.tsx";
import { EditableViewTitle } from "#/features/views/EditableViewTitle.tsx";
import { ViewActions, ViewSaveBar } from "#/features/views/ViewActions.tsx";
import { ViewPresetsButton } from "#/features/views/ViewPresetsButton.tsx";
import { useViewPage } from "#/features/views/use-view-page.ts";
import { AGE_BUCKETS } from "#/features/assignments/assignment-model.ts";
import { EmptyState } from "#/components/empty-state.tsx";
import { type ViewGroup, buildGroups } from "#/components/grouped-view/grouping.ts";
import { type ActiveFilter, type FilterField, FilterMenu } from "#/components/filter-menu.tsx";
import { LabelDot } from "#/components/label-chip.tsx";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { attachLabel, detachLabel } from "#/lib/api/labels.ts";
import { listCourses, listSemesters } from "#/lib/api/courses.ts";
import { listTasks, updateTaskStatus } from "#/lib/api/tasks.ts";
import { EFFORT_STEPS, effortLabel, useEffortSettings } from "#/lib/effort.ts";
import type { Task } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { QuickCreateTask, type TaskDraft } from "./QuickCreateTask";
import { TaskBoard } from "./TaskBoard";
import { taskGroupDefs } from "./task-groups";
import { TasksDataContext, useTasksDataValue } from "./task-controls";
import { TaskDisplayMenu } from "./TaskDisplayMenu";
import { TaskList } from "./TaskList";
import {
  COMPLETED_BUCKETS,
  TASK_VIEW_PRESETS,
  describeDisplay,
  DUE_BUCKETS,
  NO_EFFORT,
  START_BUCKETS,
  type Grouping,
  orderTasks,
  normalizeDisplay,
  passesFilters,
  readDisplay,
  writeDisplay,
} from "./task-model";
import { TaskStatusIcon } from "./task-properties";
import { qk } from "#/lib/query-keys.ts";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";

const NO_FILTERS: ActiveFilter[] = [];

/// The Tasks page, modeled on Linear: a header with view tabs, a filter and display
/// bar, then a board (default) or a grouped list. C opens the create modal.
export function TasksListView({ spaceId, viewId }: { spaceId: string; viewId?: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { display, setDisplay, filters, setFilters, view, dirty, save, discard } = useViewPage({
    spaceId,
    module: "tasks",
    viewId,
    readDisplay,
    normalizeDisplay,
    remember: writeDisplay,
    defaultFilters: NO_FILTERS,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const { data: tasks = [], isPending } = useQuery({
    queryKey: qk.tasks.bySpace(spaceId),
    queryFn: () => listTasks(spaceId),
  });
  const { data: courses = [] } = useQuery({
    queryKey: qk.courses.bySpace(spaceId),
    queryFn: () => listCourses(spaceId),
  });
  const { data: semesters = [] } = useQuery({
    queryKey: qk.semesters.bySpace(spaceId),
    queryFn: () => listSemesters(spaceId),
  });
  const effortScale = useEffortSettings((s) => s.scale);
  const data = useTasksDataValue(spaceId);
  const { statuses, labels, kindOf } = data;

  const startCreate = useCallback((next: TaskDraft = {}) => {
    setDraft(next);
    setCreateOpen(true);
  }, []);

  useCreateShortcut(() => startCreate());

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), SUCCESS_REVERT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const move = useMutation({
    mutationFn: async (vars: {
      task: Task;
      statusId?: string;
      detachLabelIds?: string[];
      attachLabelId?: string;
    }) => {
      const id = vars.task.entity.id;
      if (vars.statusId) await updateTaskStatus(id, vars.statusId);
      for (const labelId of vars.detachLabelIds ?? []) await detachLabel(id, labelId);
      if (vars.attachLabelId) await attachLabel(id, vars.attachLabelId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.tasks.bySpace(spaceId) }),
  });
  const failedTaskId = move.isError ? move.variables?.task.entity.id : undefined;

  const filterFields = useMemo<FilterField[]>(() => {
    const fields: FilterField[] = [
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
          ...EFFORT_STEPS.map((s) => ({
            value: String(s.value),
            label: effortLabel(s.value, effortScale),
          })),
          { value: NO_EFFORT, label: "No estimate" },
        ],
      },
    ];
    const usedCourses = courses.filter((c) => tasks.some((t) => t.courseIds.includes(c.id)));
    if (usedCourses.length > 0) {
      fields.push({
        id: "course",
        label: "Course",
        icon: IconSchool,
        options: usedCourses.map((c) => ({ value: c.id, label: displayTitle(c) })),
      });
    }
    const usedSemesters = semesters.filter((s) =>
      tasks.some((t) => t.semesterIds.includes(s.entity.id)),
    );
    if (usedSemesters.length > 0) {
      fields.push({
        id: "semester",
        label: "Semester",
        icon: IconCalendarStats,
        options: usedSemesters.map((s) => ({ value: s.entity.id, label: displayTitle(s.entity) })),
      });
    }
    const used = labels.filter((l) => tasks.some((t) => t.labelIds.includes(l.id)));
    if (used.length > 0) {
      fields.push({
        id: "labels",
        label: "Labels",
        icon: IconTag,
        options: used.map((l) => ({ value: l.id, label: l.name, icon: <LabelDot label={l} /> })),
      });
    }
    return fields;
  }, [statuses, labels, tasks, kindOf, courses, semesters, effortScale]);

  const visible = useMemo(
    () =>
      orderTasks(
        tasks.filter((t) => passesFilters(t, filters)),
        display.ordering,
        statuses,
      ),
    [tasks, filters, display.ordering, statuses],
  );

  const groups = useMemo(() => {
    const defs = taskGroupDefs(display.grouping, statuses, labels, kindOf);
    const subDefs = taskGroupDefs(display.subGrouping, statuses, labels, kindOf);
    const all = buildGroups(
      visible,
      defs ?? [{ id: "all", name: "All tasks", match: () => true }],
      subDefs,
    );
    const showEmpty = display.showEmpty[display.layout] && display.grouping !== "none";
    return all.filter((g) => showEmpty || g.items.length > 0);
  }, [visible, display, statuses, labels, kindOf]);

  /// A new task placed in a group (and sub-group) starts with what they stand for.
  /// Date buckets have no single date to give, so they offer no create.
  const onCreateIn = (group: ViewGroup<Task>, subgroup: ViewGroup<Task> | null) => {
    const parts: [Grouping, string][] = [[display.grouping, group.id]];
    if (subgroup) parts.push([display.subGrouping, subgroup.id]);
    if (parts.some(([kind]) => !["status", "label"].includes(kind))) return undefined;
    const next: TaskDraft = {};
    for (const [kind, id] of parts) {
      if (kind === "status") next.statusId = id;
      if (kind === "label" && id !== "no-label") next.labelIds = [id];
    }
    return () => startCreate(next);
  };

  /// Dropping a card on another status or label column (or swimlane) moves it
  /// there. Between labels, the label it was picked up under swaps for the new one.
  const dropKinds = new Set([display.grouping, display.subGrouping]);
  const boardDraggable = dropKinds.has("status") || dropKinds.has("label");
  const onMove = (
    task: Task,
    columnId: string,
    laneId: string | null,
    from: { columnId: string; laneId: string | null },
  ) => {
    const target = (kind: Grouping) =>
      display.grouping === kind ? columnId : display.subGrouping === kind ? laneId : null;
    const source = (kind: Grouping) =>
      display.grouping === kind ? from.columnId : display.subGrouping === kind ? from.laneId : null;
    const vars: Parameters<typeof move.mutate>[0] = { task };
    const statusId = target("status");
    if (statusId && statusId !== task.statusId) vars.statusId = statusId;
    const labelTo = target("label");
    const labelFrom = source("label");
    if (labelTo && labelFrom && labelTo !== labelFrom) {
      if (labelTo === "no-label") vars.detachLabelIds = task.labelIds;
      else {
        if (labelFrom !== "no-label") vars.detachLabelIds = [labelFrom];
        if (!task.labelIds.includes(labelTo)) vars.attachLabelId = labelTo;
      }
    }
    if (vars.statusId || vars.detachLabelIds?.length || vars.attachLabelId) move.mutate(vars);
  };

  const columnProps = (group: ViewGroup<Task>) => {
    const status = display.grouping === "status" ? data.statusById.get(group.id) : undefined;
    return status
      ? contextTarget("tasks.column", {
          status,
          startCreate: () => startCreate({ statusId: status.id }),
        })
      : undefined;
  };

  const openTask = (task: Task) => openEntity(task.entity.id, spaceId);

  return (
    <TasksDataContext.Provider value={data}>
      <div
        className="relative flex h-full min-h-0 flex-col"
        {...contextTarget("module-view", {
          spaceId,
          createLabel: "New Task",
          create: () => startCreate(),
        })}
      >
        <header className="flex shrink-0 flex-col gap-2.5 border-b border-border py-2 pr-2 pl-4">
          <div className="flex min-w-0 items-center gap-1">
            <h1
              className="flex h-8 items-center gap-2 text-sm font-medium"
              {...(view && entityTarget(view.entity))}
            >
              {view ? (
                <ViewIconButton entity={view.entity} />
              ) : (
                <IconChecklist size={16} className="text-muted-foreground" />
              )}
              {view ? <EditableViewTitle entity={view.entity} /> : "Tasks"}
            </h1>
            <div className="flex-1" />
            <ViewPresetsButton
              spaceId={spaceId}
              module="tasks"
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
            <ViewActions
              spaceId={spaceId}
              module="tasks"
              view={view}
              filters={filters}
              display={display}
            />
            <TaskDisplayMenu display={display} onChange={setDisplay} columns={groups} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="ml-1 gap-1.5"
                  onClick={() => startCreate()}
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
        <ViewSaveBar view={view} dirty={dirty} save={save} onDiscard={discard} />

        {!isPending && tasks.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={IconChecklist}
              title="No tasks in this Space yet"
              description="Press C anywhere on this page to capture the first one."
              action={{ label: "New task", onClick: () => startCreate() }}
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm text-muted-foreground">No tasks match this view.</p>
            <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
              Clear filters
            </Button>
          </div>
        ) : display.layout === "board" ? (
          <TaskBoard
            groups={groups.filter((g) => !display.hiddenColumns.includes(g.id))}
            properties={display.properties}
            highlightId={highlightId}
            failedTaskId={failedTaskId}
            draggable={boardDraggable}
            onOpen={openTask}
            onMove={onMove}
            onCreateIn={onCreateIn}
            columnProps={columnProps}
          />
        ) : (
          <TaskList
            groups={groups}
            showHeaders={display.grouping !== "none"}
            properties={display.properties}
            highlightId={highlightId}
            onOpen={openTask}
            onCreateIn={onCreateIn}
          />
        )}
      </div>

      <QuickCreateTask
        open={createOpen}
        draft={draft}
        onOpenChange={setCreateOpen}
        onCreated={(task) => setHighlightId(task.entity.id)}
      />
    </TasksDataContext.Provider>
  );
}
