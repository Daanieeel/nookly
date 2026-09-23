import {
  IconCalendarEvent,
  IconChecklist,
  IconCircleDot,
  IconPlus,
  IconTag,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SUCCESS_REVERT_MS } from "@/components/action-feedback";
import { contextTarget } from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import { type ActiveFilter, type FilterField, FilterMenu } from "@/components/filter-menu";
import { LabelDot } from "@/components/label-chip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listLabels } from "@/lib/api/labels";
import { listTaskStatuses, listTasks, updateTaskStatus } from "@/lib/api/tasks";
import type { Task } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { QuickCreateTask, type TaskDraft } from "./QuickCreateTask";
import { TaskBoard } from "./TaskBoard";
import { type TasksData, TasksDataContext } from "./task-controls";
import { TaskDisplayMenu } from "./TaskDisplayMenu";
import { TaskList } from "./TaskList";
import {
  DUE_BUCKETS,
  type DisplayOptions,
  type TaskGroup,
  type TaskTab,
  groupTasks,
  orderTasks,
  passesFilters,
  readDisplay,
  sortStatuses,
  statusInTab,
  statusKind,
  writeDisplay,
} from "./task-model";
import { TaskStatusIcon } from "./task-properties";

const TABS: { id: TaskTab; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "active", label: "Active" },
  { id: "backlog", label: "Backlog" },
];

/// True while typing somewhere, so single key shortcuts stay out of the way.
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/// The Tasks page, modeled on Linear: a header with view tabs, a filter and display
/// bar, then a board (default) or a grouped list. C opens the create modal.
export function TasksListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [display, setDisplayState] = useState<DisplayOptions>(readDisplay);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const { data: rawStatuses = [] } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: listTaskStatuses,
  });
  const { data: tasks = [], isPending } = useQuery({
    queryKey: ["tasks", spaceId],
    queryFn: () => listTasks(spaceId),
  });
  const { data: labels = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
  });

  const data = useMemo<TasksData>(() => {
    const statuses = sortStatuses(rawStatuses);
    const statusById = new Map(statuses.map((s) => [s.id, s]));
    return {
      spaceId,
      statuses,
      labels,
      statusById,
      labelById: new Map(labels.map((l) => [l.id, l])),
      kindOf: (id) => {
        const status = statusById.get(id);
        return status ? statusKind(status, statuses) : "unstarted";
      },
    };
  }, [rawStatuses, labels, spaceId]);
  const { statuses, kindOf } = data;
  const hasBacklog = statuses.some((s) => kindOf(s.id) === "backlog");

  const setDisplay = (next: DisplayOptions) => {
    setDisplayState(next);
    writeDisplay(next);
  };
  const tab = display.tab === "backlog" && !hasBacklog ? "all" : display.tab;

  const startCreate = useCallback((next: TaskDraft = {}) => {
    setDraft(next);
    setCreateOpen(true);
  }, []);

  // C creates a task, as in Linear, whenever nothing else has the keyboard.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isEditable(e.target) || document.querySelector("[role=dialog],[role=menu]")) return;
      e.preventDefault();
      startCreate();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startCreate]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), SUCCESS_REVERT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const move = useMutation({
    mutationFn: (vars: { task: Task; statusId: string }) =>
      updateTaskStatus(vars.task.entity.id, vars.statusId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", spaceId] }),
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
    ];
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
  }, [statuses, labels, tasks, kindOf]);

  const visible = useMemo(
    () =>
      orderTasks(
        tasks.filter((t) => statusInTab(t.statusId, tab, kindOf) && passesFilters(t, filters)),
        display.ordering,
        statuses,
      ),
    [tasks, tab, kindOf, filters, display.ordering, statuses],
  );

  const groups = useMemo(() => {
    const all = groupTasks(visible, display.grouping, statuses, labels);
    // In a filtered tab, only the statuses that tab covers make sense as columns.
    const inScope = all.filter((g) => !g.status || statusInTab(g.status.id, tab, kindOf));
    const showEmpty = display.showEmpty[display.layout] && display.grouping !== "none";
    return inScope.filter((g) => showEmpty || g.tasks.length > 0);
  }, [visible, display, statuses, labels, tab, kindOf]);

  const onCreateIn = ({ id, status, label }: TaskGroup) => {
    if (status) return () => startCreate({ statusId: status.id });
    if (label) return () => startCreate({ labelIds: [label.id] });
    if (id === "no-label" || id === "all") return () => startCreate();
    return undefined;
  };

  const openTask = (task: Task) => openEntity(task.entity.id, spaceId);

  return (
    <TasksDataContext.Provider value={data}>
      <div
        className="flex h-full min-h-0 flex-col"
        {...contextTarget("module-view", {
          spaceId,
          createLabel: "New Task",
          create: () => startCreate(),
        })}
      >
        <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-4">
          <h1 className="flex items-center gap-2 text-sm font-medium">
            <IconChecklist size={16} className="text-muted-foreground" />
            Tasks
          </h1>
          <nav aria-label="Task views" className="flex min-w-0 items-center gap-1 overflow-hidden">
            {TABS.filter((t) => t.id !== "backlog" || hasBacklog).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setDisplay({ ...display, tab: t.id })}
                className={cn(
                  "h-7 shrink-0 cursor-pointer rounded-md border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                  tab === t.id && "border-border bg-accent text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <div className="min-w-0 flex-1">
              <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
            </div>
            <TaskDisplayMenu display={display} onChange={setDisplay} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
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
        </header>

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters([]);
                setDisplay({ ...display, tab: "all" });
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : display.layout === "board" ? (
          <TaskBoard
            groups={groups}
            properties={display.properties}
            highlightId={highlightId}
            failedTaskId={failedTaskId}
            draggable={display.grouping === "status"}
            onOpen={openTask}
            onMove={(task, statusId) => move.mutate({ task, statusId })}
            onCreateIn={onCreateIn}
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
