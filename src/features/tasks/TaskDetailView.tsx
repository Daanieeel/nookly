import { IconChevronDown, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ProgressCircle } from "@/components/ui/progress-circle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSubtask,
  listSubtasks,
  listTaskStatuses,
  listTasks,
  subtaskProgress,
  updateTaskDates,
  updateTaskStatus,
} from "@/lib/api/tasks";
import type { Entity, Task, TaskStatus } from "@/lib/api/types";

export function TaskDetailView({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const isSubtask = entity.type === "sub_task";
  const [newSubtask, setNewSubtask] = useState("");
  const [subtasksOpen, setSubtasksOpen] = useState(true);

  const { data: statuses = [] } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: listTaskStatuses,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", entity.spaceId],
    queryFn: () => listTasks(entity.spaceId),
  });
  const task = tasks.find((t) => t.entity.id === entity.id);
  const { data: subtasks = [] } = useQuery({
    queryKey: ["subtasks", entity.id],
    queryFn: () => listSubtasks(entity.id),
    enabled: !isSubtask,
  });
  const { data: progress } = useQuery({
    queryKey: ["subtask-progress", entity.id],
    queryFn: () => subtaskProgress(entity.id),
    enabled: !isSubtask,
  });

  const setStatus = useMutation({
    mutationFn: (statusId: string) => updateTaskStatus(entity.id, statusId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", entity.spaceId] }),
  });
  const setDates = useMutation({
    mutationFn: (vars: { startDate: string | null; dueDate: string | null }) =>
      updateTaskDates(entity.id, vars.startDate, vars.dueDate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", entity.spaceId] }),
  });
  const addSubtask = useMutation({
    mutationFn: (title: string) => createSubtask(entity.id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", entity.id] });
      queryClient.invalidateQueries({ queryKey: ["subtask-progress", entity.id] });
      setNewSubtask("");
    },
  });
  const toggleSubtask = useMutation({
    mutationFn: (vars: { entityId: string; statusId: string }) =>
      updateTaskStatus(vars.entityId, vars.statusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", entity.id] });
      queryClient.invalidateQueries({ queryKey: ["subtask-progress", entity.id] });
    },
  });

  const doneStatus = statuses.find((s) => s.doneness >= 100);
  const todoStatus = statuses.find((s) => s.doneness <= 0) ?? statuses[0];

  return (
    <EntityDetailLayout entity={entity}>
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Select value={task?.statusId} onValueChange={(v) => setStatus.mutate(v)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {progress != null && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ProgressCircle value={progress} size={16} /> {Math.round(progress)}%
            </span>
          )}
        </div>

        <div className="flex gap-3">
          <label
            htmlFor={`${entity.id}-start-date`}
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            Start date
            <Input
              id={`${entity.id}-start-date`}
              type="date"
              value={task?.startDate ?? ""}
              onChange={(e) =>
                setDates.mutate({
                  startDate: e.target.value || null,
                  dueDate: task?.dueDate ?? null,
                })
              }
            />
          </label>
          <label
            htmlFor={`${entity.id}-due-date`}
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            Due date
            <Input
              id={`${entity.id}-due-date`}
              type="date"
              value={task?.dueDate ?? ""}
              onChange={(e) =>
                setDates.mutate({
                  startDate: task?.startDate ?? null,
                  dueDate: e.target.value || null,
                })
              }
            />
          </label>
        </div>

        {!isSubtask && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSubtasksOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground"
            >
              {subtasksOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              Sub-tasks
              {subtasks.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {subtasks.filter((s) => isDoneSubtask(s, statuses)).length}/{subtasks.length}
                </span>
              )}
            </button>

            {subtasksOpen && (
              <div className="flex flex-col gap-2 pl-1">
                <div className="flex flex-col">
                  {subtasks.map((s) => (
                    <SubtaskRow
                      key={s.entity.id}
                      subtask={s}
                      done={isDoneSubtask(s, statuses)}
                      onToggle={(checked) => {
                        const target = checked ? doneStatus : todoStatus;
                        if (target) {
                          toggleSubtask.mutate({ entityId: s.entity.id, statusId: target.id });
                        }
                      }}
                    />
                  ))}
                  {subtasks.length === 0 && (
                    <p className="px-1 py-2 text-sm text-muted-foreground">No sub-tasks yet.</p>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newSubtask.trim()) addSubtask.mutate(newSubtask.trim());
                  }}
                  className="flex gap-2"
                >
                  <Input
                    placeholder="Add sub-task…"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    className="h-8"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={!newSubtask.trim()}
                    className="gap-1"
                  >
                    <IconPlus size={14} /> Add
                  </Button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </EntityDetailLayout>
  );
}

function isDoneSubtask(subtask: Task, statuses: TaskStatus[]): boolean {
  return (statuses.find((s) => s.id === subtask.statusId)?.doneness ?? 0) >= 100;
}

function SubtaskRow({
  subtask,
  done,
  onToggle,
}: {
  subtask: Task;
  done: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-sm px-1 py-1.5 text-sm hover:bg-accent">
      <Checkbox checked={done} onCheckedChange={(c) => onToggle(c === true)} />
      <span className={done ? "text-muted-foreground line-through" : undefined}>
        {subtask.entity.title}
      </span>
    </label>
  );
}
