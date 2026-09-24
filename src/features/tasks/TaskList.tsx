import {
  IconCalendarEvent,
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconPlus,
  IconTagOff,
} from "@tabler/icons-react";
import { useState } from "react";
import { entityTarget } from "@/components/context-menu/registry";
import { EntityKey } from "@/components/entity-key";
import { LabelDot } from "@/components/label-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { cn } from "@/lib/utils";
import {
  TaskDueControl,
  TaskLabelsControl,
  TaskStatusControl,
  useTasksData,
} from "./task-controls";
import { type DisplayProperty, type TaskGroup, formatTimestamp } from "./task-model";
import { TaskStatusIcon } from "./task-properties";
import { formatDateTime } from "@/lib/datetime";

/// The leading glyph of a group: its status, its label color, or a calendar.
export function GroupIcon({ group }: { group: TaskGroup }) {
  const { kindOf } = useTasksData();
  if (group.status) return <TaskStatusIcon status={group.status} kind={kindOf(group.status.id)} />;
  if (group.label) {
    return (
      <span className="flex size-3.5 items-center justify-center">
        <LabelDot label={group.label} />
      </span>
    );
  }
  if (group.bucket) {
    return (
      <IconCalendarEvent
        size={14}
        className={cn(
          "text-muted-foreground",
          group.bucket === "overdue" && "text-destructive",
          group.bucket === "today" && "text-caution",
        )}
      />
    );
  }
  if (group.id === "no-label") return <IconTagOff size={14} className="text-muted-foreground" />;
  return null;
}

/// Arrow keys and j/k move between rows (`data-task-row`) in document order.
export function moveRowFocus(e: React.KeyboardEvent<HTMLElement>) {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.hasAttribute("data-task-row")) return;
  const step =
    e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
  if (step === 0) return;
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-task-row]"));
  const next = rows[rows.indexOf(target) + step];
  if (next) {
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest" });
  }
}

/// Dense Linear style list: sticky group headers with a count, one 44px row per
/// task with its ID, status, title and properties on the right.
export function TaskList({
  groups,
  showHeaders,
  properties,
  highlightId,
  onOpen,
  onCreateIn,
}: {
  groups: TaskGroup[];
  showHeaders: boolean;
  properties: DisplayProperty[];
  highlightId: string | null;
  onOpen: (task: Task) => void;
  /// Unset for groups a new task can't be placed in, like a due date bucket.
  onCreateIn: (group: TaskGroup) => (() => void) | undefined;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
    <div className="min-h-0 flex-1 overflow-y-auto pb-6" onKeyDown={moveRowFocus}>
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.id);
        const create = onCreateIn(group);
        return (
          <section key={group.id} aria-label={group.name}>
            {showHeaders && (
              <div className="sticky top-0 z-10 bg-card">
                <div className="group/header flex h-9 items-center gap-2 border-b border-border bg-foreground/4 px-2">
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggle(group.id)}
                    className="flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
                  >
                    {isCollapsed ? (
                      <IconCaretRightFilled size={10} className="text-muted-foreground" />
                    ) : (
                      <IconCaretDownFilled size={10} className="text-muted-foreground" />
                    )}
                    <GroupIcon group={group} />
                    <span className="truncate font-medium">{group.name}</span>
                    <span className="text-muted-foreground tabular-nums">{group.tasks.length}</span>
                  </button>
                  {create && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`New Task in ${group.name}`}
                          onClick={create}
                          className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/header:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                        >
                          <IconPlus size={14} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>New Task in {group.name}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}
            {!isCollapsed &&
              group.tasks.map((task) => (
                <TaskRow
                  key={task.entity.id}
                  task={task}
                  properties={properties}
                  highlighted={highlightId === task.entity.id}
                  onOpen={() => onOpen(task)}
                />
              ))}
          </section>
        );
      })}
    </div>
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
        <EntityKey
          entityKey={task.entity.key}
          className="pointer-events-none relative hidden w-16 sm:block"
        />
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
