import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { EntityKey } from "@/components/entity-key";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { cn } from "@/lib/utils";
import { TaskDueControl, TaskLabelsControl, TaskStatusControl } from "./task-controls";
import type { DisplayProperty, TaskGroup } from "./task-model";
import { GroupIcon, moveRowFocus } from "./TaskList";

/// Linear style board: one lane per group, cards carrying ID, status, title and
/// property pills. Cards drag between lanes only when the lanes are statuses.
export function TaskBoard({
  groups,
  properties,
  highlightId,
  failedTaskId,
  draggable,
  onOpen,
  onMove,
  onCreateIn,
}: {
  groups: TaskGroup[];
  properties: DisplayProperty[];
  highlightId: string | null;
  failedTaskId: string | undefined;
  draggable: boolean;
  onOpen: (task: Task) => void;
  onMove: (task: Task, groupId: string) => void;
  onCreateIn: (group: TaskGroup) => (() => void) | undefined;
}) {
  const [active, setActive] = useState<Task | null>(null);
  // A few pixels of travel before a drag starts, so a plain click still opens the card.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    setActive(null);
    const task: Task | undefined = event.active.data.current?.task;
    // SAFETY: every droppable on this board is a `BoardLane`, whose `useDroppable` id
    // is always its group's `id` string.
    const groupId = event.over?.id as string | undefined;
    if (task && groupId && task.statusId !== groupId) onMove(task, groupId);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => setActive(event.active.data.current?.task ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the card buttons inside */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3" onKeyDown={moveRowFocus}>
        {groups.map((group) => (
          <BoardLane
            key={group.id}
            group={group}
            properties={properties}
            highlightId={highlightId}
            failedTaskId={failedTaskId}
            draggable={draggable}
            onOpen={onOpen}
            onCreate={onCreateIn(group)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <TaskCardBody task={active} properties={properties} className="rotate-2 shadow-lg" />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function BoardLane({
  group,
  properties,
  highlightId,
  failedTaskId,
  draggable,
  onOpen,
  onCreate,
}: {
  group: TaskGroup;
  properties: DisplayProperty[];
  highlightId: string | null;
  failedTaskId: string | undefined;
  draggable: boolean;
  onOpen: (task: Task) => void;
  onCreate: (() => void) | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id, disabled: !draggable });
  const status = group.status;
  const menu =
    status && onCreate
      ? contextTarget("tasks.column", { status, startCreate: onCreate })
      : undefined;

  return (
    <section
      ref={setNodeRef}
      aria-label={group.name}
      className={cn(
        "group/lane flex w-80 shrink-0 flex-col rounded-lg bg-foreground/3 transition-colors",
        isOver && "bg-foreground/6",
      )}
      {...menu}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3">
        <GroupIcon group={group} />
        <span className="truncate text-sm font-medium">{group.name}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{group.tasks.length}</span>
        {onCreate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`New Task in ${group.name}`}
                onClick={onCreate}
                className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/lane:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
              >
                <IconPlus size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>New Task in {group.name}</TooltipContent>
          </Tooltip>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {group.tasks.map((task) => (
          <DraggableCard
            key={task.entity.id}
            task={task}
            properties={properties}
            highlighted={highlightId === task.entity.id}
            failed={failedTaskId === task.entity.id}
            draggable={draggable}
            onOpen={() => onOpen(task)}
          />
        ))}
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/lane:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100"
            aria-label={`New Task in ${group.name}`}
          >
            <IconPlus size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

function DraggableCard({
  task,
  properties,
  highlighted,
  failed,
  draggable,
  onOpen,
}: {
  task: Task;
  properties: DisplayProperty[];
  highlighted: boolean;
  failed: boolean;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.entity.id,
    data: { task },
    disabled: !draggable,
  });
  const title = displayTitle(task.entity);

  return (
    <TaskCardBody
      task={task}
      properties={properties}
      interactive
      className={cn(
        isDragging && "opacity-40",
        highlighted && "border-positive/60 bg-positive/10",
        failed && "border-destructive/60",
      )}
      footer={
        failed && (
          <span role="alert" className="relative text-xs text-destructive">
            Couldn't move, drag again
          </span>
        )
      }
    >
      <button
        ref={setNodeRef}
        type="button"
        data-task-row
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...listeners}
        {...attributes}
      />
    </TaskCardBody>
  );
}

function TaskCardBody({
  task,
  properties,
  interactive = false,
  className,
  children,
  footer,
}: {
  task: Task;
  properties: DisplayProperty[];
  /// Live property controls; the drag preview renders them inert.
  interactive?: boolean;
  className?: string;
  /// The overlay button that opens and drags the card.
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const show = (p: DisplayProperty) => properties.includes(p);
  const hasPills = (show("due") && task.dueDate) || (show("labels") && task.labelIds.length > 0);
  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col gap-1.5 rounded-md border border-foreground/10 bg-card p-3 shadow-xs transition-colors duration-700 hover:border-foreground/20 dark:bg-accent",
        !interactive && "pointer-events-none",
        className,
      )}
      {...entityTarget(task.entity)}
    >
      {children}
      {show("key") && (
        <EntityKey entityKey={task.entity.key} className="pointer-events-none relative" />
      )}
      <div className="flex items-start gap-1.5">
        {show("status") && (
          <span className="-mt-0.5 -ml-1">
            <TaskStatusControl task={task} />
          </span>
        )}
        <span className="pointer-events-none relative line-clamp-3 min-w-0 flex-1 text-sm font-medium">
          {displayTitle(task.entity)}
        </span>
      </div>
      {hasPills && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
          {show("due") && <TaskDueControl task={task} />}
          {show("labels") && <TaskLabelsControl task={task} />}
        </div>
      )}
      {footer}
    </div>
  );
}
