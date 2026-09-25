import { useCreateLabel } from "#/components/label-manager.tsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { DueColumns } from "#/components/due-columns.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { attachLabel, detachLabel, listLabels } from "#/lib/api/labels.ts";
import { listTaskStatuses, updateTaskDates, updateTaskStatus } from "#/lib/api/tasks.ts";
import type { Label, Task, TaskStatus } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
import { type StatusKind, dueTone, sortStatuses, statusKind } from "./task-model";
import {
  DueDateButton,
  DueDatePicker,
  DueLabel,
  LabelsPicker,
  PendingIcon,
  PROPERTY_PILL,
  StatusPicker,
  TaskStatusIcon,
} from "./task-properties";

/// Everything the inline property controls on rows and cards need, shared once by
/// the Tasks page instead of threaded through every row.
export interface TasksData {
  spaceId: string;
  statuses: TaskStatus[];
  labels: Label[];
  statusById: Map<string, TaskStatus>;
  labelById: Map<string, Label>;
  kindOf: (statusId: string) => StatusKind;
}

export const TasksDataContext = createContext<TasksData | null>(null);

export function useTasksData(): TasksData {
  const data = useContext(TasksDataContext);
  if (!data) throw new Error("useTasksData needs a TasksDataContext provider");
  return data;
}

/// Builds the shared data for a Space: statuses in order, its labels, and lookups.
export function useTasksDataValue(spaceId: string): TasksData {
  const { data: rawStatuses = [] } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: listTaskStatuses,
  });
  const { data: labels = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
  });
  return useMemo<TasksData>(() => {
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
}

/// Every view a task shows up in: the Space's list, a detail page, and the
/// sub-task list and progress of a parent.
export function useRefreshTasks(spaceId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [["tasks", spaceId], ["task"], ["subtasks"], ["subtask-progress"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

/// The status glyph, which opens the status picker. Swaps to a spinner while saving
/// and a warning when the change failed.
export function TaskStatusControl({ task, size = 14 }: { task: Task; size?: number }) {
  const { spaceId, statuses, statusById, kindOf } = useTasksData();
  const refresh = useRefreshTasks(spaceId);
  const status = statusById.get(task.statusId);
  const change = useMutation({
    mutationFn: (statusId: string) => updateTaskStatus(task.entity.id, statusId),
    onSuccess: refresh,
  });
  if (!status) return null;
  const label = change.isError ? "Couldn't change status, try again" : "Change Status";
  return (
    <StatusPicker
      statuses={statuses}
      kindOf={kindOf}
      value={task.statusId}
      onSelect={(statusId) => change.mutate(statusId)}
    >
      <button
        type="button"
        aria-label={`${label}, currently ${status.name}`}
        title={label}
        className="relative flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent data-[state=open]:bg-accent"
      >
        <PendingIcon
          pending={change.isPending}
          failed={change.isError}
          idle={<TaskStatusIcon status={status} kind={kindOf(task.statusId)} size={size} />}
        />
      </button>
    </StatusPicker>
  );
}

/// The due date pill, which opens the date picker. Hidden while the task has none.
export function TaskDueControl({ task }: { task: Task }) {
  const { spaceId, kindOf } = useTasksData();
  const refresh = useRefreshTasks(spaceId);
  const change = useMutation({
    mutationFn: (dueDate: string | null) =>
      updateTaskDates(task.entity.id, task.startDate, dueDate),
    onSuccess: refresh,
  });
  if (!task.dueDate && !change.isError) return null;
  return (
    <DueDatePicker value={task.dueDate} onSelect={(day) => change.mutate(day)}>
      <button
        type="button"
        aria-label={change.isError ? "Couldn't set due date, try again" : "Change Due Date"}
        className={cn(PROPERTY_PILL, "relative", change.isError && "border-destructive/60")}
      >
        {change.isPending || change.isError ? (
          <>
            <PendingIcon pending={change.isPending} failed={change.isError} idle={null} />
            {task.dueDate ? "Due date" : "Set due date"}
          </>
        ) : (
          task.dueDate && (
            <DueLabel day={task.dueDate} tone={dueTone(task, kindOf(task.statusId))} />
          )
        )}
      </button>
    </DueDatePicker>
  );
}

/// A list row's due date columns, as on Assignments: the day opens the date
/// picker (also on rows without one), then how far away it is.
export function TaskDueColumns({ task }: { task: Task }) {
  const { spaceId, kindOf } = useTasksData();
  const refresh = useRefreshTasks(spaceId);
  const change = useMutation({
    mutationFn: (dueDate: string | null) =>
      updateTaskDates(task.entity.id, task.startDate, dueDate),
    onSuccess: refresh,
  });
  const kind = kindOf(task.statusId);
  return (
    <DueColumns
      dueDate={task.dueDate}
      done={kind === "completed" || kind === "canceled"}
      date={
        <DueDateButton
          value={task.dueDate}
          onSelect={(day) => change.mutate(day)}
          pending={change.isPending}
          failed={change.isError}
        />
      }
    />
  );
}

const MAX_CHIPS = 3;

/// The task's labels as quiet chips; clicking them opens the labels picker.
export function TaskLabelsControl({
  task,
  align = "start",
}: {
  task: Task;
  align?: "start" | "end";
}) {
  const { spaceId, labels, labelById } = useTasksData();
  const refresh = useRefreshTasks(spaceId);
  const toggle = useMutation({
    mutationFn: async (labelId: string) => {
      if (task.labelIds.includes(labelId)) await detachLabel(task.entity.id, labelId);
      else await attachLabel(task.entity.id, labelId);
      await refresh();
    },
  });
  const createLabel = useCreateLabel(spaceId);
  const attached = task.labelIds.flatMap((id) => labelById.get(id) ?? []);
  if (attached.length === 0) return null;
  const shown = attached.slice(0, MAX_CHIPS);
  const extra = attached.length - shown.length;
  return (
    <LabelsPicker
      labels={labels}
      selected={task.labelIds}
      onToggle={(labelId) => !toggle.isPending && toggle.mutate(labelId)}
      pendingId={toggle.isPending ? toggle.variables : undefined}
      failedId={toggle.isError ? toggle.variables : undefined}
      onCreate={(name) =>
        createLabel.mutate(name, { onSuccess: (label) => toggle.mutate(label.id) })
      }
      creating={createLabel.isPending}
      align={align}
    >
      <button
        type="button"
        aria-label="Change Labels"
        className="relative flex min-w-0 shrink cursor-pointer items-center gap-1 rounded-md"
      >
        {shown.map((label) => (
          <LabelChip key={label.id} label={label} className="rounded-full border-foreground/10" />
        ))}
        {extra > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground">+{extra}</span>
            </TooltipTrigger>
            <TooltipContent>
              {attached
                .slice(MAX_CHIPS)
                .map((l) => l.name)
                .join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      </button>
    </LabelsPicker>
  );
}
