import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTask, listTaskStatuses, listTasks, updateTaskStatus } from "@/lib/api/tasks";
import { useNavStore } from "@/lib/store/nav";

export function TasksListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [newTitle, setNewTitle] = useState("");

  const { data: statuses = [] } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: listTaskStatuses,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", spaceId],
    queryFn: () => listTasks(spaceId),
  });

  const create = useMutation({
    mutationFn: (title: string) => createTask(spaceId, title, null, null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", spaceId] });
      setNewTitle("");
    },
  });
  const setStatus = useMutation({
    mutationFn: (vars: { entityId: string; statusId: string }) =>
      updateTaskStatus(vars.entityId, vars.statusId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", spaceId] }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Tasks</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle.trim()) create.mutate(newTitle.trim());
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="New task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={!newTitle.trim()}>
          Add
        </Button>
      </form>

      <div className="flex flex-col">
        {tasks.map((task) => {
          const status = statuses.find((s) => s.id === task.statusId);
          return (
            <div
              key={task.entity.id}
              className="group flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
            >
              <button
                type="button"
                onClick={() => openEntity(task.entity.id, spaceId)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <EntityIcon entity={task.entity} className="shrink-0 text-muted-foreground" />
                <span className="truncate group-hover:underline">{task.entity.title}</span>
              </button>
              {task.dueDate && (
                <Badge variant="outline" className="shrink-0">
                  {task.dueDate}
                </Badge>
              )}
              <Select
                value={task.statusId}
                onValueChange={(statusId) =>
                  setStatus.mutate({ entityId: task.entity.id, statusId })
                }
              >
                <SelectTrigger size="sm" className="w-32 shrink-0">
                  <SelectValue>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: status?.color }}
                      />
                      {status?.name}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No tasks yet.</p>
        )}
      </div>
    </div>
  );
}
