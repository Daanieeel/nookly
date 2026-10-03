import {
  IconCalendarEvent,
  IconCircleDot,
  IconClipboardCheck,
  IconClockEdit,
  IconChevronRight,
  IconClockPlus,
  IconPlus,
  IconSchool,
  IconStar,
} from "@tabler/icons-react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { contextTarget, entityTarget } from "#/components/context-menu/registry.ts";
import { ViewIconButton } from "#/features/views/ViewIconButton.tsx";
import { EditableViewTitle } from "#/features/views/EditableViewTitle.tsx";
import { ViewSaveBar } from "#/features/views/ViewActions.tsx";
import { ViewPresetsButton } from "#/features/views/ViewPresetsButton.tsx";
import { useViewPage } from "#/features/views/use-view-page.ts";
import { SpaceDot } from "#/components/space-chip.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "#/components/filter-menu.tsx";
import { GroupedBoard } from "#/components/grouped-view/grouped-board.tsx";
import { GroupedList } from "#/components/grouped-view/grouped-list.tsx";
import { buildGroups } from "#/components/grouped-view/grouping.ts";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { DueDatePicker, DueLabel, PROPERTY_PILL } from "#/features/tasks/task-properties.tsx";
import { listSpaces } from "#/lib/api/spaces.ts";
import { cn } from "@nookly/ui/lib/utils";
import { fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { Switch } from "@nookly/ui/components/switch";
import { useCourseLookup } from "#/features/courses/course-lookup.tsx";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
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
import { assignmentGroupDefs } from "./assignment-groups";
import {
  AGE_BUCKETS,
  ASSIGNMENT_STATUSES,
  DEADLINE_BUCKETS,
  GRADE_FILTER,
  ageBucket,
  deadlineBucket,
  orderAssignments,
  normalizeDisplay,
  readDisplay,
  statusKindOf,
  writeDisplay,
  ASSIGNMENT_VIEW_PRESETS,
  describeDisplay,
} from "./assignment-model";
import {
  AssignmentCard,
  AssignmentCardBody,
  AssignmentColumnLabels,
  AssignmentRow,
} from "./assignment-views";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { qk } from "#/lib/query-keys.ts";

function courseFilter(courseId: string | undefined): ActiveFilter[] {
  return courseId ? [{ fieldId: "course", operator: "is", values: [courseId] }] : [];
}

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

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        id: "course",
        label: "Course",
        icon: IconSchool,
        options: courses.map((c) => ({ value: c.id, label: displayTitle(c) })),
      },
      {
        id: "status",
        label: "Status",
        icon: IconCircleDot,
        options: ASSIGNMENT_STATUSES.map((s) => ({
          value: s.id,
          label: s.name,
          icon: <TaskStatusIcon status={s} kind={statusKindOf(s.id)} />,
        })),
      },
      {
        id: "due",
        label: "Due date",
        icon: IconCalendarEvent,
        options: DEADLINE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
      {
        id: "grade",
        label: "Grade",
        icon: IconStar,
        options: GRADE_FILTER.map((g) => ({ value: g.id, label: g.label })),
      },
      {
        id: "created",
        label: "Created",
        icon: IconClockPlus,
        options: AGE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
      {
        id: "updated",
        label: "Updated",
        icon: IconClockEdit,
        options: AGE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
      },
    ],
    [courses],
  );

  const visible = applyFilters(assignments, filters, (a, fieldId) => {
    if (fieldId === "course") return courseOf.get(a.entity.id)?.id ?? "";
    if (fieldId === "due") return deadlineBucket(a);
    if (fieldId === "grade") return a.grade === null ? "none" : "graded";
    if (fieldId === "created") return ageBucket(a.entity.createdAt);
    if (fieldId === "updated") return ageBucket(a.entity.updatedAt);
    return a.status;
  });
  const defs = assignmentGroupDefs(display.grouping, courses, courseOf);
  const subDefs = assignmentGroupDefs(display.subGrouping, courses, courseOf);
  const showEmpty = display.showEmpty[display.layout] && display.grouping !== "none";
  const groups = buildGroups(
    orderAssignments(visible, display.grouping, display.ordering),
    defs ?? [{ id: "all", name: "All assignments", match: () => true }],
    subDefs,
  ).filter((g) => showEmpty || g.items.length > 0);

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
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-border py-2 pr-2 pl-4">
        <div className="flex min-w-0 items-center gap-1">
          <h1
            className="flex h-8 items-center gap-2 text-sm font-medium"
            {...(view && entityTarget(view.entity))}
          >
            {view ? (
              <ViewIconButton entity={view.entity} />
            ) : (
              <IconClipboardCheck size={16} className="text-muted-foreground" />
            )}
            {view ? <EditableViewTitle entity={view.entity} /> : "Assignments"}
          </h1>
          <div className="flex-1" />
          <ViewPresetsButton
            spaceId={spaceId}
            module="assignments"
            presets={ASSIGNMENT_VIEW_PRESETS}
            fields={filterFields}
            describeDisplay={describeDisplay}
          />
          <FilterMenu
            fields={filterFields}
            filters={filters}
            onFiltersChange={setFilters}
            part="button"
          />
          <AssignmentDisplayMenu display={display} onChange={setDisplay} columns={groups} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="sm" className="ml-1 gap-1.5" onClick={startCreate}>
                <IconPlus />
                New assignment
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Create an assignment <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
        <FilterMenu
          fields={filterFields}
          filters={filters}
          onFiltersChange={setFilters}
          part="chips"
        />
      </header>
      <ViewSaveBar
        view={view}
        dirty={dirty}
        save={save}
        onDiscard={discard}
        spaceId={spaceId}
        module="assignments"
        filters={filters}
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
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">No assignments match these filters.</p>
          <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
            Clear filters
          </Button>
        </div>
      ) : display.layout === "board" ? (
        <GroupedBoard
          // Remount on regrouping so collapsed lanes start from their defaults.
          key={`${display.grouping}:${display.subGrouping}`}
          groups={groups.filter((g) => !display.hiddenColumns.includes(g.id))}
          getKey={(a) => a.entity.id}
          draggable={boardDraggable}
          onMove={onMove}
          renderOverlay={(a) => (
            <AssignmentCardBody
              assignment={a}
              course={courseOf.get(a.entity.id)}
              className="rotate-2 shadow-lg"
            />
          )}
          renderCard={(a, drag) => (
            <AssignmentCard
              assignment={a}
              course={courseOf.get(a.entity.id)}
              drag={drag}
              failed={failedId === a.entity.id}
              onOpen={() => open(a)}
            />
          )}
        />
      ) : (
        <GroupedList
          key={`${display.grouping}:${display.subGrouping}`}
          groups={groups}
          showHeaders={display.grouping !== "none"}
          getKey={(a) => a.entity.id}
          footer={<AssignmentColumnLabels />}
          renderRow={(a) => (
            <AssignmentRow
              assignment={a}
              course={courseOf.get(a.entity.id)}
              onOpen={() => open(a)}
            />
          )}
        />
      )}

      <CreateAssignmentDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

const assignmentSchema = z.object({
  title: z.string(),
  course: z.custom<Entity | null>().refine((c): boolean => c !== null, "Pick a course"),
  dueDate: z.string().nullable(),
});
type AssignmentValues = z.infer<typeof assignmentSchema>;
const emptyAssignment: AssignmentValues = { title: "", course: null, dueDate: null };

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
    mutationFn: ({ title, course: picked, dueDate }: AssignmentValues) => {
      if (!picked) throw new Error("pick a course");
      return createAssignment(
        spaceId,
        title.trim() || `${displayTitle(picked)} Assignment`,
        picked.id,
        dueDate,
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          titleRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center gap-1.5 px-4 pt-4 text-xs text-muted-foreground">
            {spaces ? (
              <Select
                value={spaceId}
                onValueChange={(next) => {
                  setSpaceId(next);
                  // A Course belongs to one Space.
                  form.resetField("course");
                }}
              >
                <SelectTrigger size="sm" className="h-6 w-auto gap-1.5" aria-label="Space">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <SpaceDot space={option} />
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="inline-flex h-6 items-center rounded-md border border-border px-2 font-medium text-foreground">
                {space?.name ?? "Assignments"}
              </span>
            )}
            <IconChevronRight size={12} />
            <span className="text-foreground">
              <DialogTitle className="text-xs font-normal">New assignment</DialogTitle>
            </span>
            <DialogDescription className="sr-only">
              Give the assignment a title, then pick its course and due date.
            </DialogDescription>
          </div>

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
                      aria-invalid={fieldMessage(field) ? true : undefined}
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
            <form.Field name="dueDate">
              {(field) => (
                <DueDatePicker value={field.state.value} onSelect={field.handleChange}>
                  <button type="button" className={PROPERTY_PILL} aria-label="Change Due Date">
                    {field.state.value ? (
                      <DueLabel day={field.state.value} tone={null} />
                    ) : (
                      <>
                        <IconCalendarEvent size={14} className="shrink-0" />
                        Due date
                      </>
                    )}
                  </button>
                </DueDatePicker>
              )}
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                id="create-more-assignments"
                checked={createMore}
                onCheckedChange={setCreateMore}
              />
              <label htmlFor="create-more-assignments" className="cursor-pointer">
                Create more
              </label>
            </div>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
