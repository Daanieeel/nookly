import { IconCircleDot, IconClipboardCheck, IconPlus, IconSchool } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusButtonContent, statusOf, useCloseAfterSuccess } from "@/components/action-feedback";
import { contextTarget } from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import { EntityPickerPopover, EntityPickerValue } from "@/components/entity-picker";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "@/components/filter-menu";
import { GroupedBoard } from "@/components/grouped-view/grouped-board";
import { GroupedList } from "@/components/grouped-view/grouped-list";
import { buildGroups } from "@/components/grouped-view/grouping";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCourseLookup } from "@/features/courses/course-lookup";
import { createRelationship, deleteRelationship, listRelationships } from "@/lib/api/relationships";
import { TaskStatusIcon } from "@/features/tasks/task-properties";
import { useCreateShortcut } from "@/hooks/use-create-shortcut";
import { createAssignment, listAssignments, updateAssignmentStatus } from "@/lib/api/assignments";
import type { Assignment, Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { AssignmentDisplayMenu } from "./AssignmentDisplayMenu";
import { assignmentGroupDefs } from "./assignment-groups";
import {
  ASSIGNMENT_STATUSES,
  type DisplayOptions,
  orderAssignments,
  readDisplay,
  statusKindOf,
  writeDisplay,
} from "./assignment-model";
import { AssignmentCard, AssignmentCardBody, AssignmentRow } from "./assignment-views";

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
}: {
  spaceId: string;
  filterCourseId?: string;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);
  const [display, setDisplayState] = useState<DisplayOptions>(readDisplay);
  const [filters, setFilters] = useState<ActiveFilter[]>(() => courseFilter(filterCourseId));

  useEffect(() => setFilters(courseFilter(filterCourseId)), [filterCourseId]);

  const { data: assignments = [], isPending } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  const { courses, courseOf } = useCourseLookup(spaceId, "assignment-course");

  const startCreate = useCallback(() => setCreateOpen(true), []);
  useCreateShortcut(startCreate);

  const setDisplay = (next: DisplayOptions) => {
    setDisplayState(next);
    writeDisplay(next);
  };

  /// A drop changes whatever the target column or swimlane stands for: a status,
  /// or the Course (swapping its one `assignment-course` link).
  const move = useMutation({
    mutationFn: async (vars: { assignment: Assignment; status?: string; courseId?: string }) => {
      const { assignment, status, courseId } = vars;
      if (status) await updateAssignmentStatus(assignment.entity.id, status, assignment.grade);
      if (courseId) {
        const links = await listRelationships(assignment.entity.id, "from");
        for (const link of links.filter((r) => r.relationshipType === "assignment-course")) {
          await deleteRelationship(link.id);
        }
        await createRelationship(assignment.entity.id, courseId, "assignment-course");
      }
    },
    onSuccess: (_, { assignment, courseId }) => {
      queryClient.invalidateQueries({ queryKey: ["assignments", spaceId] });
      if (courseId) {
        const previous = courseOf.get(assignment.entity.id);
        for (const id of [courseId, previous?.id]) {
          if (id) queryClient.invalidateQueries({ queryKey: ["relationships", id] });
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
    ],
    [courses],
  );

  const visible = applyFilters(assignments, filters, (a, fieldId) =>
    fieldId === "course" ? (courseOf.get(a.entity.id)?.id ?? "") : a.status,
  );
  const defs = assignmentGroupDefs(display.grouping, courses, courseOf);
  const subDefs = assignmentGroupDefs(display.subGrouping, courses, courseOf);
  const showEmpty = display.showEmpty[display.layout] && display.grouping !== "none";
  const groups = buildGroups(
    orderAssignments(visible, display.grouping),
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
      className="flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Assignment",
        create: startCreate,
      })}
    >
      <header className="flex shrink-0 flex-col gap-1 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex h-8 items-center gap-2 text-sm font-medium">
          <IconClipboardCheck size={16} className="text-muted-foreground" />
          Assignments
        </h1>
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
          </div>
          <AssignmentDisplayMenu display={display} onChange={setDisplay} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" className="ml-1 gap-1.5" onClick={startCreate}>
                <IconPlus />
                New assignment
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Create an assignment <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

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
          groups={groups}
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

function CreateAssignmentDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [course, setCourse] = useState<Entity | null>(null);
  const [dueDate, setDueDate] = useState("");

  const create = useMutation({
    mutationFn: () => {
      if (!course) throw new Error("pick a course");
      return createAssignment(
        spaceId,
        `${displayTitle(course)} Assignment`,
        course.id,
        dueDate || null,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments", spaceId] });
      if (course) queryClient.invalidateQueries({ queryKey: ["relationships", course.id] });
    },
  });
  const createStatus = statusOf(create);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setCourse(null);
      setDueDate("");
      create.reset();
    }
  }

  useCloseAfterSuccess(create, () => {
    const created = create.data;
    handleOpenChange(false);
    if (created) openEntity(created.entity.id, spaceId);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="course"
            trigger={
              <Button variant="secondary" size="sm" className="w-full justify-start">
                <EntityPickerValue entity={course} placeholder="Pick a course…" />
              </Button>
            }
            onSelect={setCourse}
          />
          <DateInput
            aria-label="Due date"
            placeholder="Due date…"
            value={dueDate || null}
            onChange={(day) => setDueDate(day ?? "")}
          />
          <p className="text-xs text-muted-foreground">
            Status and grade can be filled in afterward.
          </p>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={!course}
            onClick={() => (createStatus === "idle" || createStatus === "error") && create.mutate()}
          >
            <StatusButtonContent
              status={createStatus}
              label="Create"
              successLabel="Created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
