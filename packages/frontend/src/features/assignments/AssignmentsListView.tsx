import { IconCalendarEvent, IconClipboardCheck, IconSchool } from "@tabler/icons-react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import { ViewPresetsButton } from "#/features/views/ViewPresetsButton.tsx";
import { useViewPage } from "#/features/views/use-view-page.ts";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { type ActiveFilter, type FilterField, applyFilters } from "#/components/filter-menu.tsx";
import { Button } from "@nookly/ui/components/button";
import { DueLabel, PROPERTY_PILL } from "#/features/tasks/task-properties.tsx";
import { listSpaces } from "#/lib/api/spaces.ts";
import { cn } from "@nookly/ui/lib/utils";
import { fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { useCourseLookup } from "#/features/courses/course-lookup.tsx";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";
import {
  createAssignment,
  listAssignments,
  setAssignmentCourse,
  updateAssignmentStatus,
} from "#/lib/api/assignments.ts";
import type { Assignment, Entity, Space } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { AssignmentDisplayMenu } from "./AssignmentDisplayMenu";
import { DuePicker } from "./AssignmentDuePicker";
import { assignmentGroupDefs } from "./assignment-groups";
import {
  type DueValue,
  offsetLabel,
  orderAssignments,
  normalizeDisplay,
  readDisplay,
  writeDisplay,
  ASSIGNMENT_VIEW_PRESETS,
  describeDisplay,
} from "./assignment-model";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { qk } from "#/lib/query-keys.ts";

function courseFilter(courseId: string | undefined): ActiveFilter[] {
  return courseId ? [{ fieldId: "course", operator: "is", values: [courseId] }] : [];
}
import { ModuleViewHeader, NoMatchesNotice } from "#/components/module-view-header.tsx";
import { buildVisibleGroups } from "#/components/grouped-view/visible-groups.ts";
import { AssignmentGroups } from "./AssignmentGroups";
import { assignmentFilterFields, assignmentFilterValue } from "./assignment-filter-fields";
import {
  CreateMoreSwitch,
  NewEntityBreadcrumb,
  NewEntityDialog,
} from "#/components/new-entity-dialog.tsx";

/// An inbox to work through: a list bucketed by due date by default, or a board,
/// either one groupable and sub-groupable by deadline, creation, status or Course.
/// A Course page's "view all" lands here with `filterCourseId`, applied as a
/// regular Course filter.
export function AssignmentsListView({
  spaceId,
  filterCourseId,
  viewId,
}: {
  spaceId: string;
  filterCourseId?: string;
  viewId?: string;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);
  const { display, setDisplay, filters, setFilters, view, dirty, save, discard } = useViewPage({
    spaceId,
    module: "assignments",
    viewId,
    readDisplay,
    normalizeDisplay,
    remember: writeDisplay,
    filtersKey: STORAGE_KEYS.assignmentsFilters,
    defaultFilters: courseFilter(filterCourseId),
  });

  // A Course's "view all" link applies its filter; a saved View brings its own.
  useEffect(() => {
    if (!viewId && filterCourseId) setFilters(courseFilter(filterCourseId));
  }, [filterCourseId, viewId, setFilters]);

  const { data: assignments = [], isPending } = useQuery({
    queryKey: qk.assignments.bySpace(spaceId),
    queryFn: () => listAssignments(spaceId),
  });
  const { courses, courseOf } = useCourseLookup(spaceId, "assignment-course");

  const startCreate = useCallback(() => setCreateOpen(true), []);
  useCreateShortcut(startCreate);

  /// A drop changes whatever the target column or swimlane stands for: a status
  /// or the Course.
  const move = useMutation({
    mutationFn: async (vars: { assignment: Assignment; status?: string; courseId?: string }) => {
      const { assignment, status, courseId } = vars;
      if (status) await updateAssignmentStatus(assignment.entity.id, status, assignment.grade);
      if (courseId) await setAssignmentCourse(assignment.entity.id, courseId);
    },
    onSuccess: (_, { assignment, courseId }) => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.bySpace(spaceId) });
      queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      if (courseId) {
        const previous = courseOf.get(assignment.entity.id);
        for (const id of [courseId, previous?.id]) {
          if (id) queryClient.invalidateQueries({ queryKey: qk.relationships.of(id) });
        }
      }
    },
  });

  const filterFields = useMemo<FilterField[]>(() => assignmentFilterFields(courses), [courses]);

  const visible = applyFilters(assignments, filters, (a, fieldId) =>
    assignmentFilterValue(a, fieldId, courseOf),
  );
  const groups = buildVisibleGroups(
    orderAssignments(visible, display.grouping, display.ordering),
    assignmentGroupDefs(display.grouping, courses, courseOf),
    assignmentGroupDefs(display.subGrouping, courses, courseOf),
    "All assignments",
    display.showEmpty[display.layout] && display.grouping !== "none",
  );

  const dropKinds = new Set([display.grouping, display.subGrouping]);
  const boardDraggable = dropKinds.has("status") || dropKinds.has("course");
  const onMove = (assignment: Assignment, columnId: string, laneId: string | null) => {
    const target = (kind: "status" | "course") =>
      display.grouping === kind ? columnId : display.subGrouping === kind ? laneId : null;
    const status = target("status");
    const courseId = target("course");
    const next = {
      status: status && status !== assignment.status ? status : undefined,
      // Every assignment needs a Course, so "No course" takes no drops.
      courseId:
        courseId && courseId !== "no-course" && courseId !== courseOf.get(assignment.entity.id)?.id
          ? courseId
          : undefined,
    };
    if (next.status || next.courseId) move.mutate({ assignment, ...next });
  };
  const failedId = move.isError ? move.variables?.assignment.entity.id : undefined;
  const open = (a: Assignment) => openEntity(a.entity.id, spaceId);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Assignment",
        create: startCreate,
      })}
    >
      <ModuleViewHeader
        icon={IconClipboardCheck}
        title="Assignments"
        view={view}
        viewMenu
        presets={
          <ViewPresetsButton
            spaceId={spaceId}
            module="assignments"
            presets={ASSIGNMENT_VIEW_PRESETS}
            fields={filterFields}
            describeDisplay={describeDisplay}
          />
        }
        displayMenu={
          <AssignmentDisplayMenu display={display} onChange={setDisplay} columns={groups} />
        }
        create={{ label: "New assignment", tooltip: "Create an assignment", onClick: startCreate }}
        filterFields={filterFields}
        filters={filters}
        onFiltersChange={setFilters}
        dirty={dirty}
        save={save}
        onDiscard={discard}
        spaceId={spaceId}
        module={"assignments"}
        display={display}
      />

      {!isPending && assignments.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={IconClipboardCheck}
            title="No assignments yet"
            description="Press C to add one. Pick its Course and due date, the rest comes later."
            action={{ label: "New assignment", onClick: startCreate }}
          />
        </div>
      ) : groups.every((g) => g.items.length === 0) ? (
        <NoMatchesNotice
          text="No assignments match these filters."
          onClear={() => setFilters([])}
        />
      ) : (
        <AssignmentGroups
          groups={groups}
          display={display}
          onDisplayChange={setDisplay}
          courseOf={courseOf}
          boardDraggable={boardDraggable}
          onMove={onMove}
          failedId={failedId}
          onOpen={open}
        />
      )}

      <CreateAssignmentDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

const assignmentSchema = z.object({
  title: z.string(),
  course: z.custom<Entity | null>().refine((c): boolean => c !== null, "Pick a course"),
  due: z.custom<DueValue>(),
});
type AssignmentValues = z.infer<typeof assignmentSchema>;
const emptyAssignment: AssignmentValues = {
  title: "",
  course: null,
  due: { dueDate: null, dueSessionOffsetDays: null, dueSessionId: null },
};

/// The new assignment dialog, in the style of the new task modal: a breadcrumb, a title
/// and property pills (Course, due date). The title is optional and defaults to
/// "<Course> Assignment". Enter or Cmd+Enter creates; with "Create more" on the modal
/// stays open for the next one. On the cross-Space overview `spaces` makes the
/// breadcrumb's Space a picker (starting at `spaceId`), since the Course has to come
/// from the Space it goes to.
export function CreateAssignmentDialog({
  spaceId: initialSpaceId,
  spaces,
  open,
  onOpenChange,
}: {
  spaceId: string;
  spaces?: Space[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [createMore, setCreateMore] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const { data: allSpaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const space = allSpaces.find((s) => s.id === spaceId);

  const form = useForm({
    defaultValues: emptyAssignment,
    validators: { onChange: assignmentSchema },
    onSubmit: ({ value }) => {
      if (createStatus === "idle" || createStatus === "error") create.mutate(value);
    },
  });
  const course = useStore(form.store, (state) => state.values.course);

  const create = useMutation({
    mutationFn: ({ title, course: picked, due }: AssignmentValues) => {
      if (!picked) throw new Error("pick a course");
      return createAssignment(
        spaceId,
        title.trim() || `${displayTitle(picked)} Assignment`,
        picked.id,
        due.dueDate,
        due.dueSessionOffsetDays,
        due.dueSessionId,
      );
    },
    onSuccess: async (created, { course: picked }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.assignments.bySpace(spaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.assignments.all }),
        picked && queryClient.invalidateQueries({ queryKey: qk.relationships.of(picked.id) }),
      ]);
      if (createMore) {
        form.setFieldValue("title", "");
        requestAnimationFrame(() => titleRef.current?.focus());
      } else {
        handleOpenChange(false);
        openEntity(created.entity.id, spaceId);
      }
    },
  });
  const createStatus = statusOf(create);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) setSpaceId(initialSpaceId);
    if (!next) {
      form.reset();
      create.reset();
    }
  }

  function submit() {
    void form.handleSubmit();
  }

  return (
    <NewEntityDialog
      open={open}
      onOpenChange={handleOpenChange}
      titleRef={titleRef}
      onSubmit={submit}
    >
      <NewEntityBreadcrumb
        spaceId={spaceId}
        spaceName={space?.name ?? "Assignments"}
        space={space}
        spaces={spaces}
        onSpaceChange={(next) => {
          setSpaceId(next);
          // A Course belongs to one Space.
          form.resetField("course");
        }}
        title="New assignment"
        description="Give the assignment a title, then pick its course and due date."
      />

      <form.Field name="title">
        {(field) => (
          <input
            ref={titleRef}
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            placeholder={course ? `${displayTitle(course)} Assignment` : "Assignment title"}
            aria-label="Assignment title"
            aria-invalid={create.isError || undefined}
            className="w-full bg-transparent px-4 pt-4 pb-3 text-lg font-medium outline-none placeholder:text-muted-foreground/60"
          />
        )}
      </form.Field>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
        <form.Field name="course">
          {(field) => (
            <EntityPickerPopover
              spaceId={spaceId}
              typeFilter="course"
              exclude={course?.id}
              onSelect={field.handleChange}
              trigger={
                <button
                  type="button"
                  className={cn(PROPERTY_PILL, fieldMessage(field) && "border-destructive")}
                  aria-label="Change Course"
                >
                  <IconSchool size={14} className="shrink-0" />
                  <span className={cn("truncate", course && "text-foreground")}>
                    {course ? displayTitle(course) : "Course"}
                  </span>
                </button>
              }
            />
          )}
        </form.Field>
        <form.Field name="due">
          {(field) => {
            const { dueDate, dueSessionOffsetDays: offset } = field.state.value;
            return (
              <DuePicker
                value={field.state.value}
                spaceId={spaceId}
                courseId={course?.id}
                onSelect={(next) =>
                  field.handleChange(
                    next.kind === "date"
                      ? { dueDate: next.day, dueSessionOffsetDays: null, dueSessionId: null }
                      : {
                          dueDate: null,
                          dueSessionOffsetDays: next.offsetDays,
                          dueSessionId: next.sessionId ?? null,
                        },
                  )
                }
              >
                <button type="button" className={PROPERTY_PILL} aria-label="Change Due Date">
                  {offset !== null ? (
                    <>
                      <IconCalendarEvent size={14} className="shrink-0" />
                      <span className="text-foreground">{offsetLabel(offset)}</span>
                    </>
                  ) : dueDate ? (
                    <DueLabel day={dueDate} tone={null} />
                  ) : (
                    <>
                      <IconCalendarEvent size={14} className="shrink-0" />
                      Due date
                    </>
                  )}
                </button>
              </DuePicker>
            );
          }}
        </form.Field>
      </div>

      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <div className="mr-auto">
          <form.Subscribe selector={(state) => state.fieldMeta.course}>
            {(meta) => (
              <FieldError
                message={
                  (meta?.isTouched && meta.errors.length > 0 && "Pick a course") ||
                  (create.isError && "Couldn't create the assignment, try again")
                }
              />
            )}
          </form.Subscribe>
        </div>
        <CreateMoreSwitch
          id="create-more-assignments"
          checked={createMore}
          onCheckedChange={setCreateMore}
        />
        <form.Subscribe selector={hasVisibleErrors}>
          {(blocked) => (
            <Button type="submit" size="sm" disabled={blocked}>
              <StatusButtonContent
                status={createStatus}
                label="Create assignment"
                successLabel="Created"
                errorLabel="Try again"
              />
            </Button>
          )}
        </form.Subscribe>
      </div>
    </NewEntityDialog>
  );
}
