import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { NumberProperty } from "#/components/property-fields.tsx";
import { PROPERTY_VALUE, PropertyRow } from "#/components/property-row.tsx";
import { CoursePickerField, useCourseLookup } from "#/features/courses/course-lookup.tsx";
import { BlockEditor } from "#/features/notes/BlockEditor.tsx";
import { RelatedItemsSection } from "#/features/relationships/RelatedItemsSection.tsx";
import { TasksDataContext, useTasksDataValue } from "#/features/tasks/task-controls.tsx";
import { formatTimestamp } from "#/features/tasks/task-model.ts";
import {
  DueDatePicker,
  DueLabel,
  PendingIcon,
  StatusPicker,
  TaskStatusIcon,
} from "#/features/tasks/task-properties.tsx";
import { listAssignments, updateAssignmentStatus } from "#/lib/api/assignments.ts";
import type { Assignment, Entity } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { ASSIGNMENT_STATUSES, assignmentStatus, statusKindOf } from "./assignment-model";
import {
  AssignmentDueControl,
  AssignmentStatusControl,
  dueTone,
  useSetAssignmentCourse,
  useSetAssignmentDueDate,
} from "./assignment-views";

/// Assignment ↔ Course is structural (§5.8) but delegates Todos/Notes entirely to
/// Relationships. Its own fields (status, due date, grade) sit in a Linear style
/// properties panel in the right sidebar, as on Tasks, and above the content while
/// the sidebar is collapsed.
export function AssignmentDetailView({ entity }: { entity: Entity }) {
  // The related Tasks tab draws Task status and due date controls.
  const tasksData = useTasksDataValue(entity.spaceId);
  return (
    <TasksDataContext.Provider value={tasksData}>
      <AssignmentPage entity={entity} />
    </TasksDataContext.Provider>
  );
}

function AssignmentPage({ entity }: { entity: Entity }) {
  const sidebarCollapsed = useNavStore((s) => s.rightSidebarCollapsed);
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", entity.spaceId],
    queryFn: () => listAssignments(entity.spaceId),
  });
  const assignment = assignments.find((a) => a.entity.id === entity.id);

  return (
    <EntityDetailLayout
      entity={entity}
      sidebar={assignment && <PropertiesPanel assignment={assignment} />}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col pb-24">
        {/* Properties live in the sidebar; without it they sit above the description,
            indented by the editor's handle gutter to line up with its text. */}
        {assignment && (
          <div
            className={cn(
              "mb-2 flex flex-wrap items-center gap-1.5 pl-13",
              !sidebarCollapsed && "lg:hidden",
            )}
          >
            <AssignmentStatusControl assignment={assignment} />
            {assignment.dueDate ? (
              <AssignmentDueControl assignment={assignment} />
            ) : (
              <SetDueDate assignment={assignment} />
            )}
          </div>
        )}
        <BlockEditor entityId={entity.id} spaceId={entity.spaceId} />
        <RelatedItemsSection entity={entity} />
      </div>
    </EntityDetailLayout>
  );
}

function SetDueDate({ assignment }: { assignment: Assignment }) {
  const change = useSetAssignmentDueDate(assignment);
  return (
    <DueDatePicker value={null} onSelect={(day) => change.mutate(day)}>
      <button
        type="button"
        aria-label={change.isError ? "Couldn't set due date, try again" : "Set Due Date"}
        className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md border border-foreground/10 px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
      >
        <PendingIcon pending={change.isPending} failed={change.isError} idle={null} />
        Set due date
      </button>
    </DueDatePicker>
  );
}

/// Linear's properties panel: each value is its own picker, and shows its own
/// spinner or warning while a change saves or after it failed.
function PropertiesPanel({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const { courseOf } = useCourseLookup(assignment.entity.spaceId, "assignment-course");
  const course = courseOf.get(assignment.entity.id);
  const status = assignmentStatus(assignment.status);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["assignments", assignment.entity.spaceId] });

  const setStatus = useMutation({
    mutationFn: (next: string) =>
      updateAssignmentStatus(assignment.entity.id, next, assignment.grade),
    onSuccess: invalidate,
  });
  const setDue = useSetAssignmentDueDate(assignment);
  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Status">
        <StatusPicker
          statuses={ASSIGNMENT_STATUSES}
          kindOf={statusKindOf}
          value={assignment.status}
          onSelect={(next) => setStatus.mutate(next)}
        >
          <button
            type="button"
            aria-label={setStatus.isError ? "Couldn't change status, try again" : "Change Status"}
            className={PROPERTY_VALUE}
          >
            <PendingIcon
              pending={setStatus.isPending}
              failed={setStatus.isError}
              idle={<TaskStatusIcon status={status} kind={statusKindOf(status.id)} />}
            />
            <span className="truncate">{status.name}</span>
          </button>
        </StatusPicker>
      </PropertyRow>

      <PropertyRow label="Due date">
        <DueDatePicker
          value={assignment.dueDate}
          align="end"
          onSelect={(day) => setDue.mutate(day)}
        >
          <button
            type="button"
            aria-label={setDue.isError ? "Couldn't set due date, try again" : "Change due date"}
            className={PROPERTY_VALUE}
          >
            {(setDue.isPending || setDue.isError) && (
              <PendingIcon pending={setDue.isPending} failed={setDue.isError} idle={null} />
            )}
            {assignment.dueDate ? (
              <DueLabel day={assignment.dueDate} tone={dueTone(assignment)} />
            ) : (
              <span className="text-muted-foreground">Set due date</span>
            )}
          </button>
        </DueDatePicker>
      </PropertyRow>

      <PropertyRow label="Grade">
        <GradeField assignment={assignment} />
      </PropertyRow>

      <PropertyRow label="Course">
        <CourseField assignment={assignment} course={course} />
      </PropertyRow>

      <PropertyRow label="Created">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(assignment.entity.createdAt)}
        </span>
      </PropertyRow>
      <PropertyRow label="Updated">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(assignment.entity.updatedAt)}
        </span>
      </PropertyRow>
    </section>
  );
}

function GradeField({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (grade: number | null) =>
      updateAssignmentStatus(assignment.entity.id, assignment.status, grade),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assignments", assignment.entity.spaceId] }),
  });
  return (
    <NumberProperty
      value={assignment.grade}
      onSave={(grade) => save.mutate(grade)}
      addLabel="Add grade"
      clearLabel="Remove Grade"
      min={0}
      pending={save.isPending}
      failed={save.isError}
    />
  );
}

function CourseField({
  assignment,
  course,
}: {
  assignment: Assignment;
  course: Entity | undefined;
}) {
  const change = useSetAssignmentCourse(assignment, course?.id);
  return (
    <CoursePickerField
      spaceId={assignment.entity.spaceId}
      course={course}
      onChange={(courseId) => change.mutate(courseId)}
      pending={change.isPending}
      failed={change.isError}
    />
  );
}
