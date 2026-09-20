import {
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { IconChecklist, IconLayoutKanban, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTask, listTaskStatuses, listTasks, updateTaskStatus } from "@/lib/api/tasks";
import type { Task, TaskStatus } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";

type ViewMode = "board" | "list";

interface NewTaskVars {
  title: string;
  statusId: string | null;
  dueDate: string | null;
}

/// Board (Linear-style columns by status) is the default view (§2.3) — the flat
/// list is a secondary, dense view reachable via the toggle.
export function TasksListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [mode, setMode] = useState<ViewMode>("board");

  const { data: statuses = [] } = useQuery({
    queryKey: ["task-statuses"],
    queryFn: listTaskStatuses,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", spaceId],
    queryFn: () => listTasks(spaceId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks", spaceId] });

  const create = useMutation({
    mutationFn: async (vars: NewTaskVars) => {
      const task = await createTask(spaceId, vars.title, null, vars.dueDate);
      if (vars.statusId && vars.statusId !== task.statusId) {
        await updateTaskStatus(task.entity.id, vars.statusId);
      }
      return task;
    },
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: (vars: { entityId: string; statusId: string }) =>
      updateTaskStatus(vars.entityId, vars.statusId),
    onSuccess: invalidate,
  });

  const sortedStatuses = [...statuses].sort((a, b) => a.position - b.position);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <div className="flex items-center gap-2">
          <Tabs
            value={mode}
            onValueChange={(v) => {
              // SAFETY: TabsTrigger values below are hardcoded to "board"/"list", the
              // only two members of ViewMode.
              setMode(v as ViewMode);
            }}
          >
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
          </Tabs>
          <QuickCreateTask
            statuses={sortedStatuses}
            onCreate={(vars) => create.mutate(vars)}
            trigger={
              <Button size="sm" className="gap-1.5">
                <IconPlus size={14} /> New
              </Button>
            }
          />
        </div>
      </div>

      {mode === "board" ? (
        <TaskBoard
          statuses={sortedStatuses}
          tasks={tasks}
          onOpen={(id) => openEntity(id, spaceId)}
          onDrop={(entityId, statusId) => setStatus.mutate({ entityId, statusId })}
          onCreateInStatus={(statusId, title) => create.mutate({ title, statusId, dueDate: null })}
        />
      ) : (
        <TaskListGrouped
          statuses={sortedStatuses}
          tasks={tasks}
          onOpen={(id) => openEntity(id, spaceId)}
          onStatusChange={(entityId, statusId) => setStatus.mutate({ entityId, statusId })}
        />
      )}
    </div>
  );
}

function TaskBoard({
  statuses,
  tasks,
  onOpen,
  onDrop,
  onCreateInStatus,
}: {
  statuses: TaskStatus[];
  tasks: Task[];
  onOpen: (entityId: string) => void;
  onDrop: (entityId: string, statusId: string) => void;
  onCreateInStatus: (statusId: string, title: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (statuses.length === 0) {
    return (
      <EmptyState
        icon={IconLayoutKanban}
        title="No statuses configured"
        description="Ask an admin to set up task statuses for this Space."
      />
    );
  }

  const activeTask = tasks.find((t) => t.entity.id === activeId) ?? null;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    // SAFETY: every droppable rendered in this board is a `TaskColumn`, whose
    // `useDroppable` id is always the column's own `status.id` string.
    const targetStatusId = over?.id as string | undefined;
    if (targetStatusId && active.data.current?.statusId !== targetStatusId) {
      // SAFETY: every draggable rendered in this board is a `DraggableTaskCard`,
      // whose `useDraggable` id is always the task's `entity.id` string.
      onDrop(active.id as string, targetStatusId);
    }
  }

  return (
    <DndContext
      onDragStart={(event) => {
        // SAFETY: every draggable rendered in this board is a `DraggableTaskCard`,
        // whose `useDraggable` id is always the task's `entity.id` string.
        setActiveId(event.active.id as string);
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-2">
        {statuses.map((status) => (
          <TaskColumn
            key={status.id}
            status={status}
            tasks={tasks.filter((t) => t.statusId === status.id)}
            onOpen={onOpen}
            onCreate={(title) => onCreateInStatus(status.id, title)}
          />
        ))}
      </div>
      <DragOverlay>{activeTask && <TaskCard task={activeTask} onOpen={() => {}} />}</DragOverlay>
    </DndContext>
  );
}

function TaskColumn({
  status,
  tasks,
  onOpen,
  onCreate,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (entityId: string) => void;
  onCreate: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function submit() {
    if (title.trim()) onCreate(title.trim());
    setTitle("");
    setCreating(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/col flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2 transition-colors",
        isOver && "bg-muted/70",
      )}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span
            className="size-2 shrink-0 rounded-full bg-(--status-color)"
            // SAFETY: `--status-color` only ever receives `status.color`, a plain hex
            // string from the task-statuses API — `CSSProperties` just doesn't model
            // custom properties.
            style={{ "--status-color": status.color } as CSSProperties}
          />
          <span className="text-foreground">{status.name}</span>
          <Badge variant="secondary" className="h-4 px-1.5 tabular-nums">
            {tasks.length}
          </Badge>
        </div>
        <button
          type="button"
          aria-label={`Add task to ${status.name}`}
          onClick={() => setCreating(true)}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover/col:opacity-100"
        >
          <IconPlus size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.entity.id}
            task={task}
            onOpen={() => onOpen(task.entity.id)}
          />
        ))}
      </div>

      {creating ? (
        <Input
          ref={inputRef}
          placeholder="Task title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              setTitle("");
              setCreating(false);
            }
          }}
          className="h-8 text-sm"
        />
      ) : (
        tasks.length === 0 && (
          <p className="px-1 py-2 text-center text-xs text-muted-foreground">No tasks</p>
        )
      )}
    </div>
  );
}

function DraggableTaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.entity.id,
    data: { statusId: task.statusId },
  });

  return (
    <TaskCard
      task={task}
      onOpen={onOpen}
      dragRef={setNodeRef}
      dragTransform={transform ?? undefined}
      dragging={isDragging}
      dragListeners={listeners}
      dragAttributes={attributes}
    />
  );
}

function TaskCard({
  task,
  onOpen,
  dragRef,
  dragTransform,
  dragging,
  dragListeners,
  dragAttributes,
}: {
  task: Task;
  onOpen: () => void;
  dragRef?: (node: HTMLElement | null) => void;
  dragTransform?: { x: number; y: number };
  dragging?: boolean;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
}) {
  return (
    <button
      ref={dragRef}
      type="button"
      // SAFETY: `--dnd-x`/`--dnd-y` only ever receive the numeric pixel offsets
      // dnd-kit reports for the active drag — `CSSProperties` just doesn't model
      // custom properties.
      style={
        dragTransform
          ? ({
              "--dnd-x": `${dragTransform.x}px`,
              "--dnd-y": `${dragTransform.y}px`,
            } as CSSProperties)
          : undefined
      }
      onClick={onOpen}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-border bg-card p-2.5 text-left shadow-xs hover:border-ring/50 hover:shadow-sm",
        dragTransform && "translate-x-(--dnd-x) translate-y-(--dnd-y)",
        dragging && "opacity-40",
      )}
      {...dragListeners}
      {...dragAttributes}
    >
      <span className="flex items-start gap-1.5 text-sm">
        <EntityIcon entity={task.entity} className="mt-0.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">{displayTitle(task.entity)}</span>
      </span>
      {task.dueDate && (
        <Badge variant="outline" className="w-fit">
          {task.dueDate}
        </Badge>
      )}
    </button>
  );
}

function TaskListGrouped({
  statuses,
  tasks,
  onOpen,
  onStatusChange,
}: {
  statuses: TaskStatus[];
  tasks: Task[];
  onOpen: (entityId: string) => void;
  onStatusChange: (entityId: string, statusId: string) => void;
}) {
  const groups = statuses
    .map((status) => ({ status, tasks: tasks.filter((t) => t.statusId === status.id) }))
    .filter((g) => g.tasks.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {groups.map(({ status, tasks: group }) => (
        <div key={status.id} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
            <span
              className="size-2 shrink-0 rounded-full bg-(--status-color)"
              // SAFETY: `--status-color` only ever receives `status.color`, a plain hex
              // string from the task-statuses API — `CSSProperties` just doesn't model
              // custom properties.
              style={{ "--status-color": status.color } as CSSProperties}
            />
            {status.name}
            <span>{group.length}</span>
          </div>
          {group.map((task) => (
            <div
              key={task.entity.id}
              className="group flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
            >
              <button
                type="button"
                onClick={() => onOpen(task.entity.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <EntityIcon entity={task.entity} className="shrink-0 text-muted-foreground" />
                <span className="truncate group-hover:underline">{displayTitle(task.entity)}</span>
              </button>
              {task.dueDate && (
                <Badge variant="outline" className="shrink-0">
                  {task.dueDate}
                </Badge>
              )}
              <Select
                value={task.statusId}
                onValueChange={(statusId) => onStatusChange(task.entity.id, statusId)}
              >
                <SelectTrigger size="sm" className="w-32 shrink-0">
                  <SelectValue />
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
          ))}
        </div>
      ))}
      {tasks.length === 0 && (
        <EmptyState
          icon={IconChecklist}
          title="No tasks yet"
          description='Use "New" above to add your first one.'
        />
      )}
    </div>
  );
}

/// Lightweight, keyboard-first quick-create (§3.3) — title plus small contextual
/// pickers, not a full form. Enter creates and keeps the popover open, focused and
/// cleared, for rapid batch entry; Escape closes.
function QuickCreateTask({
  statuses,
  defaultStatusId,
  onCreate,
  trigger,
}: {
  statuses: TaskStatus[];
  defaultStatusId?: string;
  onCreate: (vars: NewTaskVars) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [statusId, setStatusId] = useState<string | undefined>(defaultStatusId);
  const [dueDate, setDueDate] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStatusId(defaultStatusId ?? statuses[0]?.id);
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [open, defaultStatusId, statuses]);

  function submit() {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), statusId: statusId ?? null, dueDate: dueDate || null });
    setTitle("");
    setDueDate("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2"
        >
          <Input
            ref={inputRef}
            placeholder="Task title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            className="h-8"
          />
          <div className="flex gap-1.5">
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger size="sm" className="flex-1">
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
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 w-32"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">Enter to add another</span>
            <Button type="submit" size="sm" disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
