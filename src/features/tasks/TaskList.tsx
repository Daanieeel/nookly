import type { ViewGroup } from "@/components/grouped-view/grouping";
import { GroupedList } from "@/components/grouped-view/grouped-list";
import { entityTarget } from "@/components/context-menu/registry";
import { EntityKeyCopyInline } from "@/components/entity-key";
import type { Task } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { TaskDueControl, TaskLabelsControl, TaskStatusControl } from "./task-controls";
import { type DisplayProperty, formatTimestamp } from "./task-model";

/// Dense Linear style list: group and sub-group headers with a count, one 44px row
/// per task with its ID, status, title and properties on the right.
export function TaskList({
  groups,
  showHeaders,
  properties,
  highlightId,
  onOpen,
  onCreateIn,
}: {
  groups: ViewGroup<Task>[];
  showHeaders: boolean;
  properties: DisplayProperty[];
  highlightId: string | null;
  onOpen: (task: Task) => void;
  /// Unset for groups a new task can't be placed in, like a due date bucket.
  onCreateIn: (
    group: ViewGroup<Task>,
    subgroup: ViewGroup<Task> | null,
  ) => (() => void) | undefined;
}) {
  return (
    <GroupedList
      groups={groups}
      showHeaders={showHeaders}
      getKey={(task) => task.entity.id}
      renderRow={(task) => (
        <TaskRow
          task={task}
          properties={properties}
          highlighted={highlightId === task.entity.id}
          onOpen={() => onOpen(task)}
        />
      )}
      onCreateIn={onCreateIn}
      createLabel={(name) => `New Task in ${name}`}
    />
  );
}

function TaskRow({
  task,
  properties,
  highlighted,
  onOpen,
}: {
  task: Task;
  properties: DisplayProperty[];
  highlighted: boolean;
  onOpen: () => void;
}) {
  const title = displayTitle(task.entity);
  const show = (p: DisplayProperty) => properties.includes(p);
  return (
    <div
      className={cn(
        "relative flex h-11 items-center gap-2 border-b border-border/60 px-4 transition-colors duration-700 focus-within:bg-accent/50 hover:bg-accent/40",
        highlighted && "bg-positive/10",
      )}
      {...entityTarget(task.entity)}
    >
      {/* The whole row opens the task; the property controls sit above it. */}
      <button
        type="button"
        data-task-row
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer outline-none"
      />
      {show("key") && (
        <span className="relative hidden w-20 shrink-0 sm:flex">
          <EntityKeyCopyInline entityKey={task.entity.key} className="-ml-1" />
        </span>
      )}
      {show("status") && <TaskStatusControl task={task} />}
      <span className="pointer-events-none relative min-w-0 flex-1 truncate text-sm">{title}</span>
      {show("labels") && (
        <span className="relative hidden min-w-0 md:flex">
          <TaskLabelsControl task={task} align="end" />
        </span>
      )}
      {show("due") && <TaskDueControl task={task} />}
      {show("created") && (
        <time
          dateTime={task.entity.createdAt}
          title={`Created ${formatDateTime(task.entity.createdAt)}`}
          className="pointer-events-none relative hidden w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums lg:block"
        >
          {formatTimestamp(task.entity.createdAt)}
        </time>
      )}
    </div>
  );
}
