import { type CardDrag, GroupedBoard } from "@/components/grouped-view/grouped-board";
import type { ViewGroup } from "@/components/grouped-view/grouping";
import { type ContextTargetProps, entityTarget } from "@/components/context-menu/registry";
import { CardKey } from "@/components/entity-key";
import type { Task } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { cn } from "@/lib/utils";
import { TaskDueControl, TaskLabelsControl, TaskStatusControl } from "./task-controls";
import type { DisplayProperty } from "./task-model";

/// Linear style board: one column per group (and one swimlane per sub-group),
/// cards carrying ID, status, title and property pills.
export function TaskBoard({
  groups,
  properties,
  highlightId,
  failedTaskId,
  draggable,
  onOpen,
  onMove,
  onCreateIn,
  columnProps,
}: {
  groups: ViewGroup<Task>[];
  properties: DisplayProperty[];
  highlightId: string | null;
  failedTaskId: string | undefined;
  draggable: boolean;
  onOpen: (task: Task) => void;
  onMove: (task: Task, columnId: string, laneId: string | null) => void;
  onCreateIn: (group: ViewGroup<Task>, lane: ViewGroup<Task> | null) => (() => void) | undefined;
  columnProps?: (group: ViewGroup<Task>) => ContextTargetProps | undefined;
}) {
  return (
    <GroupedBoard
      groups={groups}
      getKey={(task) => task.entity.id}
      draggable={draggable}
      onMove={onMove}
      onCreateIn={onCreateIn}
      createLabel={(name) => `New Task in ${name}`}
      columnProps={columnProps}
      renderOverlay={(task) => (
        <TaskCardBody task={task} properties={properties} className="rotate-2 shadow-lg" />
      )}
      renderCard={(task, drag) => (
        <TaskCard
          task={task}
          drag={drag}
          properties={properties}
          highlighted={highlightId === task.entity.id}
          failed={failedTaskId === task.entity.id}
          onOpen={() => onOpen(task)}
        />
      )}
    />
  );
}

function TaskCard({
  task,
  drag,
  properties,
  highlighted,
  failed,
  onOpen,
}: {
  task: Task;
  drag: CardDrag;
  properties: DisplayProperty[];
  highlighted: boolean;
  failed: boolean;
  onOpen: () => void;
}) {
  return (
    <TaskCardBody
      task={task}
      properties={properties}
      interactive
      className={cn(
        drag.isDragging && "opacity-40",
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
        ref={drag.ref}
        type="button"
        data-task-row
        aria-label={`Open ${displayTitle(task.entity)}`}
        onClick={onOpen}
        className={cn(
          "absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
          drag.cursorClass,
        )}
        {...drag.listeners}
        {...drag.attributes}
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
      {show("key") && <CardKey entityKey={task.entity.key} interactive={interactive} />}
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
