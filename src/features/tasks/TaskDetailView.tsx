import {
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconChevronDown,
  IconChevronUp,
  IconCircleDashed,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { FieldError } from "@/components/action-feedback";
import { entityTarget } from "@/components/context-menu/registry";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { EntityKey } from "@/components/entity-key";
import { LabelChip } from "@/components/label-chip";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BlockEditor } from "@/features/notes/BlockEditor";
import { attachLabel, detachLabel } from "@/lib/api/labels";
import {
  createSubtask,
  getTask,
  listSubtasks,
  listTasks,
  subtaskProgress,
  updateTaskDates,
  updateTaskStatus,
} from "@/lib/api/tasks";
import type { Entity, Task } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import {
  TaskDueControl,
  TaskLabelsControl,
  TaskStatusControl,
  TasksDataContext,
  useRefreshTasks,
  useTasksData,
  useTasksDataValue,
} from "./task-controls";
import {
  dueTone,
  formatTimestamp,
  groupTasks,
  orderTasks,
  readDisplay,
  statusInTab,
} from "./task-model";
import { useTaskParent } from "./task-parent";
import {
  DueDatePicker,
  DueLabel,
  LabelsPicker,
  PendingIcon,
  StatusPicker,
  TaskStatusIcon,
} from "./task-properties";

/// True while typing somewhere, so single key shortcuts stay out of the way.
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/// A Task's page: the same header and description editor as a Note, plus a
/// previous and next stepper, the sub-tasks, and a properties panel at the top of
/// the right sidebar, as in Linear's issue view.
export function TaskDetailView({ entity }: { entity: Entity }) {
  const data = useTasksDataValue(entity.spaceId);
  return (
    <TasksDataContext.Provider value={data}>
      <TaskPage entity={entity} />
    </TasksDataContext.Provider>
  );
}

function TaskPage({ entity }: { entity: Entity }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const sidebarCollapsed = useNavStore((s) => s.rightSidebarCollapsed);
  const isSubtask = entity.type === "sub_task";

  const { data: task } = useQuery({
    queryKey: ["task", entity.id],
    queryFn: () => getTask(entity.id),
  });
  const { data: progress } = useQuery({
    queryKey: ["subtask-progress", entity.id],
    queryFn: () => subtaskProgress(entity.id),
    enabled: !isSubtask,
  });
  const parent = useTaskParent(entity);
  const neighbours = useTaskNeighbours(entity, parent);

  return (
    <EntityDetailLayout
      entity={entity}
      headerExtra={
        neighbours && (
          <TaskStepper
            index={neighbours.index}
            total={neighbours.total}
            onStep={(next) => openEntity(next.entity.id, next.entity.spaceId)}
            prev={neighbours.prev}
            next={neighbours.next}
          />
        )
      }
      sidebar={task && <PropertiesPanel task={task} progress={progress ?? null} />}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col pb-24">
        {/* Properties live in the sidebar; without it they sit above the description.
            Indented by the editor's handle gutter (`.tiptap-content`) to line up with
            its text. */}
        {task && (
          <div
            className={cn(
              "mb-2 flex flex-wrap items-center gap-1.5 pl-13",
              !sidebarCollapsed && "lg:hidden",
            )}
          >
            <TaskStatusControl task={task} />
            <TaskLabelsControl task={task} />
            <TaskDueControl task={task} />
          </div>
        )}
        <BlockEditor entityId={entity.id} spaceId={entity.spaceId} />
        {!isSubtask && <SubtaskSection parent={entity} progress={progress ?? null} />}
      </div>
    </EntityDetailLayout>
  );
}

/// Where this task sits among its neighbours, for Linear's "3 / 12" stepper. A Task
/// steps through the Tasks page as it was last displayed (tab, grouping, ordering),
/// or through every task when that tab hides it. A Sub-task steps through its
/// siblings under the same parent.
function useTaskNeighbours(entity: Entity, parent: Entity | null | undefined) {
  const { statuses, labels, kindOf } = useTasksData();
  const isSubtask = entity.type === "sub_task";
  const { data: tasks } = useQuery({
    queryKey: ["tasks", entity.spaceId],
    queryFn: () => listTasks(entity.spaceId),
    enabled: !isSubtask,
  });
  const { data: siblings } = useQuery({
    queryKey: ["subtasks", parent?.id],
    queryFn: () => (parent ? listSubtasks(parent.id) : []),
    enabled: isSubtask && !!parent,
  });

  return useMemo(() => {
    let list: Task[] | undefined;
    if (isSubtask) {
      // Trashed siblings are skipped, unless this is the trashed one.
      list = siblings?.filter((t) => !t.entity.deletedAt || t.entity.id === entity.id);
    } else if (tasks) {
      const display = readDisplay();
      const ordered = (tab: typeof display.tab) => {
        const inView = tasks.filter((t) => statusInTab(t.statusId, tab, kindOf));
        const grouped = groupTasks(
          orderTasks(inView, display.ordering, statuses),
          display.grouping,
          statuses,
          labels,
        ).flatMap((g) => g.tasks);
        // Label grouping can list a task twice; the first place counts.
        const seen = new Set<string>();
        return grouped.filter((t) => !seen.has(t.entity.id) && !!seen.add(t.entity.id));
      };
      list = ordered(display.tab);
      if (!list.some((t) => t.entity.id === entity.id)) list = ordered("all");
    }
    const index = list?.findIndex((t) => t.entity.id === entity.id) ?? -1;
    if (!list || index < 0 || list.length < 2) return null;
    return { index, total: list.length, prev: list[index - 1], next: list[index + 1] };
  }, [isSubtask, siblings, tasks, entity.id, statuses, labels, kindOf]);
}

function TaskStepper({
  index,
  total,
  prev,
  next,
  onStep,
}: {
  index: number;
  total: number;
  prev: Task | undefined;
  next: Task | undefined;
  onStep: (task: Task) => void;
}) {
  // K and J step through tasks, as in Linear, whenever nothing else has the keyboard.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isEditable(e.target) || document.querySelector("[role=dialog],[role=menu]")) return;
      const target = e.key === "k" ? prev : e.key === "j" ? next : undefined;
      if (!target) return;
      e.preventDefault();
      onStep(target);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prev, next, onStep]);

  return (
    <div className="flex items-center gap-0.5 pr-1">
      <span className="px-1.5 text-xs text-muted-foreground tabular-nums">
        {index + 1} / {total}
      </span>
      {(
        [
          { task: prev, label: "Previous Task", shortcut: "K", icon: IconChevronUp },
          { task: next, label: "Next Task", shortcut: "J", icon: IconChevronDown },
        ] as const
      ).map(({ task, label, shortcut, icon: Icon }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              disabled={!task}
              onClick={() => task && onStep(task)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Icon size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {label} ({shortcut})
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/// Linear's sub-issues block: a header with the rolled up progress, one row per
/// sub-task, and an inline row that keeps adding until Escape.
function SubtaskSection({ parent, progress }: { parent: Entity; progress: number | null }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const refresh = useRefreshTasks(parent.spaceId);
  const { kindOf } = useTasksData();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: subtasks = [] } = useQuery({
    queryKey: ["subtasks", parent.id],
    queryFn: () => listSubtasks(parent.id),
  });
  const add = useMutation({
    mutationFn: async (next: string) => {
      await createSubtask(parent.id, next);
      await refresh();
    },
    onSuccess: () => setTitle(""),
  });

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function startAdding() {
    setOpen(true);
    setAdding(true);
  }

  // Trashed sub-tasks stay listed, faded, but no longer count toward progress.
  const live = subtasks.filter((s) => !s.entity.deletedAt);
  const done = live.filter((s) => {
    const kind = kindOf(s.statusId);
    return kind === "completed" || kind === "canceled";
  }).length;

  return (
    <section aria-label="Sub-tasks" className="mt-10 flex flex-col">
      <div className="flex h-9 items-center gap-3 border-b border-border">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-ml-2 flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-accent/60"
        >
          {open ? (
            <IconCaretDownFilled size={10} className="text-muted-foreground" />
          ) : (
            <IconCaretRightFilled size={10} className="text-muted-foreground" />
          )}
          Sub-tasks
        </button>
        {live.length > 0 ? (
          <SubtaskProgressBar value={progress ?? 0} done={done} total={live.length} />
        ) : (
          <span className="flex-1" />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Add Sub-task"
              onClick={startAdding}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <IconPlus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Add Sub-task</TooltipContent>
        </Tooltip>
      </div>

      {open && (
        <>
          {subtasks.map((subtask) => {
            const trashed = !!subtask.entity.deletedAt;
            return (
              <div
                key={subtask.entity.id}
                className="relative flex h-10 items-center gap-2 border-b border-border/60 px-1 hover:bg-accent/40"
                {...entityTarget(subtask.entity)}
              >
                <button
                  type="button"
                  aria-label={`Open ${displayTitle(subtask.entity)}${trashed ? " (deleted)" : ""}`}
                  onClick={() => openEntity(subtask.entity.id, subtask.entity.spaceId)}
                  className="absolute inset-0 cursor-pointer outline-none focus-visible:bg-accent/50"
                />
                {/* A trashed sub-task is read only until restored from its own page. */}
                <div
                  className={cn(
                    "pointer-events-none relative flex min-w-0 flex-1 items-center gap-2",
                    trashed && "opacity-35",
                  )}
                >
                  {trashed ? (
                    <TrashedStatusIcon task={subtask} />
                  ) : (
                    <span className="pointer-events-auto">
                      <TaskStatusControl task={subtask} />
                    </span>
                  )}
                  <EntityKey entityKey={subtask.entity.key} className="hidden w-16 sm:block" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      (trashed || kindOf(subtask.statusId) === "canceled") &&
                        "text-muted-foreground line-through",
                    )}
                  >
                    {displayTitle(subtask.entity)}
                  </span>
                </div>
                {trashed ? (
                  <span className="pointer-events-none relative flex shrink-0 items-center gap-1 text-xs text-muted-foreground/70">
                    <IconTrash size={12} />
                    Deleted
                  </span>
                ) : (
                  <TaskDueControl task={subtask} />
                )}
              </div>
            );
          })}

          {adding ? (
            <div className="flex flex-col gap-1 border-b border-border/60 py-2 pl-1">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <PendingIcon
                    pending={add.isPending}
                    failed={add.isError}
                    idle={<IconCircleDashed size={14} className="text-muted-foreground/60" />}
                  />
                </span>
                <input
                  ref={inputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setAdding(false);
                      setTitle("");
                      add.reset();
                    }
                    if (e.key === "Enter" && title.trim() && !add.isPending) {
                      e.preventDefault();
                      add.mutate(title.trim());
                    }
                  }}
                  onBlur={() => !title.trim() && !add.isError && setAdding(false)}
                  placeholder="Sub-task title, Enter to add, Esc to stop"
                  aria-label="New sub-task title"
                  aria-invalid={add.isError || undefined}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="pl-8">
                <FieldError
                  message={add.isError && "Couldn't add the sub-task, press Enter to retry"}
                />
              </div>
            </div>
          ) : (
            subtasks.length === 0 && (
              <button
                type="button"
                onClick={startAdding}
                className="flex h-10 cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <IconPlus size={14} />
                Add sub-tasks
              </button>
            )
          )}
        </>
      )}
    </section>
  );
}

/// The rolled up doneness of all sub-tasks as a thin bar, filled by a transform so
/// it can animate as statuses change.
function SubtaskProgressBar({
  value,
  done,
  total,
}: {
  value: number;
  done: number;
  total: number;
}) {
  const percent = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {done}/{total}
      </span>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a styled bar, which a native <progress> can't be across both engines
        role="progressbar"
        aria-label="Sub-task progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-foreground/10"
      >
        <div
          className="size-full origin-left rounded-full bg-positive transition-transform duration-500"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

/// The status glyph alone, without its picker, for a sub-task in the Trash.
function TrashedStatusIcon({ task }: { task: Task }) {
  const { statusById, kindOf } = useTasksData();
  const status = statusById.get(task.statusId);
  return (
    <span className="flex size-6 shrink-0 items-center justify-center">
      {status && <TaskStatusIcon status={status} kind={kindOf(status.id)} />}
    </span>
  );
}

const PROPERTY_VALUE =
  "flex h-7 min-w-0 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent data-[state=open]:bg-accent";

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-1">
      <span className="truncate px-2 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/// Linear's properties panel: each value is its own picker, and shows its own
/// spinner or warning while a change saves or after it failed.
function PropertiesPanel({ task, progress }: { task: Task; progress: number | null }) {
  const { spaceId, statuses, labels, statusById, labelById, kindOf } = useTasksData();
  const refresh = useRefreshTasks(spaceId);
  const status = statusById.get(task.statusId);
  const attached = task.labelIds.flatMap((id) => labelById.get(id) ?? []);

  const setStatus = useMutation({
    mutationFn: async (statusId: string) => {
      await updateTaskStatus(task.entity.id, statusId);
      await refresh();
    },
  });
  const setDates = useMutation({
    mutationFn: async (vars: { field: "start" | "due"; day: string | null }) => {
      await updateTaskDates(
        task.entity.id,
        vars.field === "start" ? vars.day : task.startDate,
        vars.field === "due" ? vars.day : task.dueDate,
      );
      await refresh();
    },
  });
  const toggleLabel = useMutation({
    mutationFn: async (labelId: string) => {
      if (task.labelIds.includes(labelId)) await detachLabel(task.entity.id, labelId);
      else await attachLabel(task.entity.id, labelId);
      await refresh();
    },
  });
  const dateField = setDates.variables?.field;

  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Status">
        <StatusPicker
          statuses={statuses}
          kindOf={kindOf}
          value={task.statusId}
          onSelect={(id) => setStatus.mutate(id)}
        >
          <button
            type="button"
            aria-label={setStatus.isError ? "Couldn't change status, try again" : "Change Status"}
            className={PROPERTY_VALUE}
          >
            <PendingIcon
              pending={setStatus.isPending}
              failed={setStatus.isError}
              idle={status && <TaskStatusIcon status={status} kind={kindOf(status.id)} />}
            />
            <span className="truncate">{status?.name ?? "No status"}</span>
          </button>
        </StatusPicker>
      </PropertyRow>

      <PropertyRow label="Labels">
        <LabelsPicker
          labels={labels}
          selected={task.labelIds}
          onToggle={(id) => !toggleLabel.isPending && toggleLabel.mutate(id)}
          pendingId={toggleLabel.isPending ? toggleLabel.variables : undefined}
          failedId={toggleLabel.isError ? toggleLabel.variables : undefined}
          align="end"
        >
          <button
            type="button"
            aria-label="Change Labels"
            className={cn(PROPERTY_VALUE, "h-auto min-h-7 flex-wrap gap-1 py-1")}
          >
            {attached.length > 0 ? (
              attached.map((l) => (
                <LabelChip key={l.id} label={l} className="rounded-full border-foreground/10" />
              ))
            ) : (
              <span className="text-muted-foreground">Add label</span>
            )}
          </button>
        </LabelsPicker>
      </PropertyRow>

      {(["start", "due"] as const).map((field) => {
        const day = field === "start" ? task.startDate : task.dueDate;
        const noun = field === "start" ? "start date" : "due date";
        const failed = setDates.isError && dateField === field;
        return (
          <PropertyRow key={field} label={field === "start" ? "Start date" : "Due date"}>
            <DueDatePicker
              value={day}
              noun={noun}
              align="end"
              onSelect={(next) => setDates.mutate({ field, day: next })}
            >
              <button
                type="button"
                aria-label={failed ? `Couldn't set ${noun}, try again` : `Change ${noun}`}
                className={PROPERTY_VALUE}
              >
                {(setDates.isPending && dateField === field) || failed ? (
                  <PendingIcon pending={!failed} failed={failed} idle={null} />
                ) : null}
                {day ? (
                  <DueLabel
                    day={day}
                    tone={field === "due" ? dueTone(task, kindOf(task.statusId)) : null}
                  />
                ) : (
                  <span className="text-muted-foreground">Set {noun}</span>
                )}
              </button>
            </DueDatePicker>
          </PropertyRow>
        );
      })}

      {progress != null && (
        <PropertyRow label="Progress">
          <span className="flex h-7 items-center gap-2 px-2 text-sm tabular-nums">
            <ProgressCircle value={progress} size={14} />
            {Math.round(progress)}%
          </span>
        </PropertyRow>
      )}

      <PropertyRow label="Created">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(task.entity.createdAt)}
        </span>
      </PropertyRow>
      <PropertyRow label="Updated">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(task.entity.updatedAt)}
        </span>
      </PropertyRow>
    </section>
  );
}
