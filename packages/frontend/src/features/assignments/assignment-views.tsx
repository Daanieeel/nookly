import { IconCircleDot } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { DueColumnLabels, DueColumns } from "#/components/due-columns.tsx";
import { CardKey, EntityKeyCopyInline } from "#/components/entity-key.tsx";
import type { CardDrag } from "#/components/grouped-view/grouped-board.tsx";
import { CourseChip, CourseChipLink } from "#/features/courses/course-lookup.tsx";
import { daysUntil } from "#/features/tasks/task-model.ts";
import {
  DueDateButton,
  DueDatePicker,
  DueLabel,
  PendingIcon,
  PROPERTY_PILL,
  StatusPicker,
  TaskStatusIcon,
} from "#/features/tasks/task-properties.tsx";
import {
  setAssignmentCourse,
  updateAssignmentDueDate,
  updateAssignmentStatus,
} from "#/lib/api/assignments.ts";
import type { Assignment, Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
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

/// Changes an assignment's due date; `null` clears it.
export function useSetAssignmentDueDate(assignment: Assignment) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dueDate: string | null) => updateAssignmentDueDate(assignment.entity.id, dueDate),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assignments", assignment.entity.spaceId] }),
  });
}

/// Moves an assignment to another Course.
export function useSetAssignmentCourse(
  assignment: Assignment,
  currentCourseId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => setAssignmentCourse(assignment.entity.id, courseId),
    onSuccess: (_, courseId) =>
      Promise.all(
        [
          ["assignments", assignment.entity.spaceId],
          ["relationships", courseId],
          ["relationships", currentCourseId],
        ]
          .filter(([, id]) => id)
          .map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}

/// Due date urgency for the pill: red once overdue, yellow today or tomorrow.
export function dueTone(assignment: Assignment): "overdue" | "soon" | null {
  if (!assignment.dueDate || isDone(assignment)) return null;
  const days = daysUntil(assignment.dueDate);
  if (days < 0) return "overdue";
  return days <= 1 ? "soon" : null;
}

/// A list row's due date columns, as on Tasks: the day opens the date picker.
function AssignmentDueColumns({ assignment, done }: { assignment: Assignment; done: boolean }) {
  const change = useSetAssignmentDueDate(assignment);
  return (
    <DueColumns
      dueDate={assignment.dueDate}
      done={done}
      date={
        <DueDateButton
          value={assignment.dueDate}
          onSelect={(day) => change.mutate(day)}
          pending={change.isPending}
          failed={change.isError}
        />
      }
    />
  );
}

/// The due date pill on a card, which opens the date picker.
export function AssignmentDueControl({ assignment }: { assignment: Assignment }) {
  const change = useSetAssignmentDueDate(assignment);
  return (
    <DueDatePicker value={assignment.dueDate} onSelect={(day) => change.mutate(day)}>
      <button
        type="button"
        aria-label={change.isError ? "Couldn't set due date, try again" : "Change Due Date"}
        className={cn(PROPERTY_PILL, "relative", change.isError && "border-destructive/60")}
      >
        {change.isPending || change.isError ? (
          <>
            <PendingIcon pending={change.isPending} failed={change.isError} idle={null} />
            Due date
          </>
        ) : (
          assignment.dueDate && <DueLabel day={assignment.dueDate} tone={dueTone(assignment)} />
        )}
      </button>
    </DueDatePicker>
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
      <AssignmentDueColumns assignment={assignment} done={done} />
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

/// Column labels for `AssignmentRow`, with the same widths and breakpoints.
export function AssignmentColumnLabels() {
  return (
    <div
      aria-hidden
      className="flex h-8 shrink-0 items-center gap-3 border-t border-border px-4 text-xs whitespace-nowrap text-muted-foreground"
    >
      <span title="Status" className="flex w-6 shrink-0 justify-center">
        <IconCircleDot size={14} />
      </span>
      <DueColumnLabels />
      <span className="hidden w-20 shrink-0 sm:block">ID</span>
      <span className="min-w-0 flex-1">Title</span>
      <span className="max-md:hidden">Course</span>
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
          {assignment.dueDate && (
            <span className={cn("relative", interactive && "pointer-events-auto")}>
              <AssignmentDueControl assignment={assignment} />
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
