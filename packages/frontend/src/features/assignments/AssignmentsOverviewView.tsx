import {
  IconCalendarEvent,
  IconCircleDot,
  IconClipboardCheck,
  IconClockEdit,
  IconClockPlus,
  IconFolder,
  IconPlus,
  IconSchool,
  IconStar,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { EmptyState } from "#/components/empty-state.tsx";
import { type FilterField, FilterMenu, applyFilters } from "#/components/filter-menu.tsx";
import { GroupedBoard } from "#/components/grouped-view/grouped-board.tsx";
import { GroupedList } from "#/components/grouped-view/grouped-list.tsx";
import { buildGroups } from "#/components/grouped-view/grouping.ts";
import { SpaceDot } from "#/components/space-chip.tsx";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";
import { useCourseLookupAcross } from "#/features/courses/course-lookup.tsx";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
import { EditableViewTitle } from "#/features/views/EditableViewTitle.tsx";
import { useViewPage } from "#/features/views/use-view-page.ts";
import { ViewSaveBar } from "#/features/views/ViewActions.tsx";
import { ViewIconButton } from "#/features/views/ViewIconButton.tsx";
import { ViewPresetsButton } from "#/features/views/ViewPresetsButton.tsx";
import { listAssignmentsAllSpaces, updateAssignmentStatus } from "#/lib/api/assignments.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { ASSIGNMENTS_OVERVIEW } from "#/lib/api/views.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { CreateAssignmentDialog } from "./AssignmentsListView";
import { AssignmentDisplayMenu } from "./AssignmentDisplayMenu";
import { assignmentGroupDefs } from "./assignment-groups";
import {
  AGE_BUCKETS,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_VIEW_PRESETS,
  DEADLINE_BUCKETS,
  GRADE_FILTER,
  ageBucket,
  deadlineBucket,
  describeDisplay,
  normalizeDisplay,
  orderAssignments,
  readOverviewDisplay,
  statusKindOf,
  writeOverviewDisplay,
} from "./assignment-model";
import {
  AssignmentCard,
  AssignmentCardBody,
  AssignmentColumnLabels,
  AssignmentRow,
  refreshAssignments,
} from "./assignment-views";

/// The seventh cross-Space exception (`docs/04-navigation-spaces.md`): every Space's
/// assignments in one list or board, below Tasks in the sidebar. Each row and card
/// carries its Space's color. Filters, groups, orders and edits in place like a
/// Space's own Assignments page; creating one still happens inside its Space.
export function AssignmentsOverviewView({ viewId }: { viewId?: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { display, setDisplay, filters, setFilters, view, dirty, save, discard } = useViewPage({
    // A cross-Space page has no Space of its own; a View's own is read from it.
    spaceId: "",
    module: ASSIGNMENTS_OVERVIEW,
    viewId,
    readDisplay: readOverviewDisplay,
    normalizeDisplay,
    remember: writeOverviewDisplay,
    filtersKey: STORAGE_KEYS.assignmentsOverviewFilters,
    defaultFilters: [],
  });

  const { data: assignments = [], isPending } = useQuery({
    queryKey: qk.assignments.all,
    queryFn: listAssignmentsAllSpaces,
  });
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const { courses, courseOf } = useCourseLookupAcross(
    spaces.map((s) => s.id),
    "assignment-course",
  );
  // A new View starts in the Space being worked in, else the first.
  const saveSpaceId = spaces.find((s) => s.id === activeSpaceId)?.id ?? spaces[0]?.id ?? "";
  const [createOpen, setCreateOpen] = useState(false);
  const startCreate = useCallback(() => setCreateOpen(true), []);
  useCreateShortcut(startCreate);

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        id: "space",
        label: "Space",
        icon: IconFolder,
        options: spaces.map((space) => ({
          value: space.id,
          label: space.name,
          icon: <SpaceDot space={space} />,
        })),
      },
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
    [spaces, courses],
  );

  const visible = applyFilters(assignments, filters, (a, fieldId) => {
    if (fieldId === "space") return a.entity.spaceId;
    if (fieldId === "course") return courseOf.get(a.entity.id)?.id ?? "";
    if (fieldId === "due") return deadlineBucket(a);
    if (fieldId === "grade") return a.grade === null ? "none" : "graded";
    if (fieldId === "created") return ageBucket(a.entity.createdAt);
    if (fieldId === "updated") return ageBucket(a.entity.updatedAt);
    return a.status;
  });
  const defs = assignmentGroupDefs(display.grouping, courses, courseOf, spaces);
  const subDefs = assignmentGroupDefs(display.subGrouping, courses, courseOf, spaces);
  const showEmpty = display.showEmpty[display.layout] && display.grouping !== "none";
  const groups = buildGroups(
    orderAssignments(visible, display.grouping, display.ordering),
    defs ?? [{ id: "all", name: "All assignments", match: () => true }],
    subDefs,
  ).filter((g) => showEmpty || g.items.length > 0);

  const move = useMutation({
    mutationFn: ({ assignment, status }: { assignment: Assignment; status: string }) =>
      updateAssignmentStatus(assignment.entity.id, status, assignment.grade),
    onSuccess: (_, { assignment }) => refreshAssignments(queryClient, assignment.entity.spaceId),
  });
  const failedId = move.isError ? move.variables?.assignment.entity.id : undefined;

  /// Only status can change by dropping a card: a Course is picked within one Space,
  /// and a Space is where the assignment lives.
  const boardDraggable = display.grouping === "status" || display.subGrouping === "status";
  const onMove = (assignment: Assignment, columnId: string, laneId: string | null) => {
    const status = display.grouping === "status" ? columnId : laneId;
    if (status && status !== assignment.status) move.mutate({ assignment, status });
  };
  const open = (a: Assignment) => openEntity(a.entity.id, a.entity.spaceId);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-border py-2 pr-2 pl-4">
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="flex h-8 items-center gap-2 text-sm font-medium">
            {view ? (
              <ViewIconButton entity={view.entity} />
            ) : (
              <IconClipboardCheck size={16} className="text-muted-foreground" />
            )}
            {view ? <EditableViewTitle entity={view.entity} /> : "Assignments"}
          </h1>
          <div className="flex-1" />
          <ViewPresetsButton
            spaceId={saveSpaceId}
            spaces={spaces}
            module={ASSIGNMENTS_OVERVIEW}
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
          <AssignmentDisplayMenu
            display={display}
            onChange={setDisplay}
            columns={groups}
            crossSpace
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="ml-1 gap-1.5"
                disabled={spaces.length === 0}
                onClick={startCreate}
              >
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
        spaceId={saveSpaceId}
        spaces={spaces}
        module={ASSIGNMENTS_OVERVIEW}
        filters={filters}
        display={display}
      />

      {!isPending && assignments.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={IconClipboardCheck}
            title="No assignments yet"
            description="Assignments from every Space show up here. Create them inside a Space."
          />
        </div>
      ) : groups.every((g) => g.items.length === 0) ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">No assignments match these filters.</p>
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
              space={spaceById.get(a.entity.spaceId)}
              className="rotate-2 shadow-lg"
            />
          )}
          renderCard={(a, drag) => (
            <AssignmentCard
              assignment={a}
              course={courseOf.get(a.entity.id)}
              space={spaceById.get(a.entity.spaceId)}
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
              space={spaceById.get(a.entity.spaceId)}
              onOpen={() => open(a)}
            />
          )}
        />
      )}

      <CreateAssignmentDialog
        spaceId={saveSpaceId}
        spaces={spaces}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
