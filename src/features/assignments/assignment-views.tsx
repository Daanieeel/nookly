import { IconCalendarEvent } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ReactNode } from "react";
import { entityTarget } from "@/components/context-menu/registry";
import { CardKey, EntityKeyCopyInline } from "@/components/entity-key";
import type { CardDrag } from "@/components/grouped-view/grouped-board";
import { CourseChip, CourseChipLink } from "@/features/courses/course-lookup";
import {
  PendingIcon,
  PROPERTY_PILL,
  StatusPicker,
  TaskStatusIcon,
} from "@/features/tasks/task-properties";
import { updateAssignmentStatus } from "@/lib/api/assignments";
import type { Assignment, Entity } from "@/lib/api/types";
import { formatShortDate, formatWeekday } from "@/lib/datetime";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { ASSIGNMENT_STATUSES, assignmentStatus, isDone, statusKindOf } from "./assignment-model";

/// The status glyph, which opens the status picker, as on Tasks. Swaps to a
/// spinner while saving and a warning when the change failed.
export function AssignmentStatusControl({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (status: string) =>
      updateAssignmentStatus(assignment.entity.id, status, assignment.grade),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assignments", assignment.entity.spaceId] }),
  });
  const status = assignmentStatus(assignment.status);
  const label = change.isError ? "Couldn't change status, try again" : "Change Status";
  return (
    <StatusPicker
      statuses={ASSIGNMENT_STATUSES}
      kindOf={statusKindOf}
      value={assignment.status}
      onSelect={(next) => change.mutate(next)}
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
          idle={<TaskStatusIcon status={status} kind={statusKindOf(status.id)} />}
        />
      </button>
    </StatusPicker>
  );
}

function relativeDue(dueDate: string, done: boolean) {
  const days = differenceInCalendarDays(parseISO(dueDate), new Date());
  if (days < 0) {
    return done
      ? { text: `${-days}d ago`, tone: null }
      : { text: `${-days}d overdue`, tone: "text-destructive" };
  }
  if (days === 0) return { text: "Today", tone: done ? null : "text-caution" };
  if (days === 1) return { text: "Tomorrow", tone: null };
  return { text: `in ${days} days`, tone: null };
}

/// A list row's due date as two fixed width columns: the day, then how far away it is.
function DueColumns({ dueDate, done }: { dueDate: string | null; done: boolean }) {
  const due = dueDate ? relativeDue(dueDate, done) : null;
  return (
    <>
      <time
        dateTime={dueDate ?? undefined}
        className={cn(
          "pointer-events-none relative w-24 shrink-0 text-xs tabular-nums",
          !dueDate && "text-muted-foreground/60",
        )}
      >
        {dueDate ? `${formatWeekday(dueDate, "short")}, ${formatShortDate(dueDate)}` : "No date"}
      </time>
      <span
        className={cn(
          "pointer-events-none relative w-20 shrink-0 text-xs text-muted-foreground",
          due?.tone,
        )}
      >
        {due?.text}
      </span>
    </>
  );
}

function Grade({ grade }: { grade: number }) {
  return (
    <span className="pointer-events-none relative shrink-0 text-xs text-muted-foreground tabular-nums">
      Grade <span className="font-medium text-foreground">{grade}</span>
    </span>
  );
}

export function AssignmentRow({
  assignment,
  course,
  onOpen,
}: {
  assignment: Assignment;
  course: Entity | undefined;
  onOpen: () => void;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const title = displayTitle(assignment.entity);
  const done = isDone(assignment);
  return (
    <div
      className="relative flex h-11 items-center gap-3 border-b border-border/60 px-4 transition-colors focus-within:bg-accent/50 hover:bg-accent/40"
      {...entityTarget(assignment.entity, assignment)}
    >
      <button
        type="button"
        data-task-row
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer outline-none"
      />
      <AssignmentStatusControl assignment={assignment} />
      <DueColumns dueDate={assignment.dueDate} done={done} />
      <span className="relative hidden w-20 shrink-0 sm:flex">
        <EntityKeyCopyInline entityKey={assignment.entity.key} className="-ml-1" />
      </span>
      <span
        className={cn(
          "pointer-events-none relative min-w-0 flex-1 truncate text-sm",
          done && "text-muted-foreground",
        )}
      >
        {title}
      </span>
      {course && (
        <CourseChipLink
          course={course}
          onOpen={() => openEntity(course.id, course.spaceId)}
          className="relative max-md:hidden"
        />
      )}
    </div>
  );
}

export function AssignmentCard({
  assignment,
  course,
  drag,
  failed,
  onOpen,
}: {
  assignment: Assignment;
  course: Entity | undefined;
  drag: CardDrag;
  failed: boolean;
  onOpen: () => void;
}) {
  return (
    <AssignmentCardBody
      assignment={assignment}
      course={course}
      interactive
      className={cn(drag.isDragging && "opacity-40", failed && "border-destructive/60")}
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
        aria-label={`Open ${displayTitle(assignment.entity)}`}
        onClick={onOpen}
        className={cn(
          "absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
          drag.cursorClass,
        )}
        {...drag.listeners}
        {...drag.attributes}
      />
    </AssignmentCardBody>
  );
}

export function AssignmentCardBody({
  assignment,
  course,
  interactive = false,
  className,
  children,
  footer,
}: {
  assignment: Assignment;
  course: Entity | undefined;
  /// A live status control; the drag preview renders it inert.
  interactive?: boolean;
  className?: string;
  /// The overlay button that opens and drags the card.
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const done = isDone(assignment);
  const due = assignment.dueDate ? relativeDue(assignment.dueDate, done) : null;
  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col gap-1.5 rounded-md border border-foreground/10 bg-card p-3 shadow-xs transition-colors hover:border-foreground/20 dark:bg-accent",
        !interactive && "pointer-events-none",
        className,
      )}
      {...entityTarget(assignment.entity, assignment)}
    >
      {children}
      <CardKey entityKey={assignment.entity.key} interactive={interactive} />
      <div className="flex items-start gap-1.5">
        <span className="relative -mt-0.5 -ml-1">
          <AssignmentStatusControl assignment={assignment} />
        </span>
        <span className="pointer-events-none relative line-clamp-3 min-w-0 flex-1 text-sm font-medium">
          {displayTitle(assignment.entity)}
        </span>
      </div>
      {(assignment.dueDate || course || assignment.grade !== null) && (
        <div className="pointer-events-none relative flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
          {assignment.dueDate && due && (
            <span className={cn(PROPERTY_PILL, "cursor-default hover:bg-transparent")}>
              <IconCalendarEvent size={14} className={cn("shrink-0", due.tone)} />
              <span className={cn("truncate", due.tone)}>
                {formatShortDate(assignment.dueDate)}
              </span>
            </span>
          )}
          {course &&
            (interactive ? (
              <CourseChipLink
                course={course}
                onOpen={() => openEntity(course.id, course.spaceId)}
                className="pointer-events-auto"
              />
            ) : (
              <CourseChip course={course} />
            ))}
          {assignment.grade !== null && <Grade grade={assignment.grade} />}
        </div>
      )}
      {footer}
    </div>
  );
}
