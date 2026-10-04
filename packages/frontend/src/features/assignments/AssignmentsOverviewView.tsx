import { IconClipboardCheck } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { EmptyState } from "#/components/empty-state.tsx";
import { type FilterField, applyFilters } from "#/components/filter-menu.tsx";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";
import { useCourseLookupAcross } from "#/features/courses/course-lookup.tsx";
import { useViewPage } from "#/features/views/use-view-page.ts";
import { ViewPresetsButton } from "#/features/views/ViewPresetsButton.tsx";
import { listAssignmentsAllSpaces, updateAssignmentStatus } from "#/lib/api/assignments.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { ASSIGNMENTS_OVERVIEW } from "#/lib/api/views.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { CreateAssignmentDialog } from "./AssignmentsListView";
import { AssignmentDisplayMenu } from "./AssignmentDisplayMenu";
import { assignmentGroupDefs } from "./assignment-groups";
import {
  ASSIGNMENT_VIEW_PRESETS,
  describeDisplay,
  normalizeDisplay,
  orderAssignments,
  readOverviewDisplay,
  writeOverviewDisplay,
} from "./assignment-model";
import { refreshAssignments } from "./assignment-views";
import { ModuleViewHeader, NoMatchesNotice } from "#/components/module-view-header.tsx";
import { buildVisibleGroups } from "#/components/grouped-view/visible-groups.ts";
import { spaceFilterField } from "#/features/tasks/shared-view-defs.tsx";
import { AssignmentGroups } from "./AssignmentGroups";
import { assignmentFilterFields, assignmentFilterValue } from "./assignment-filter-fields";

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
    () => [spaceFilterField(spaces), ...assignmentFilterFields(courses)],
    [spaces, courses],
  );

  const visible = applyFilters(assignments, filters, (a, fieldId) =>
    assignmentFilterValue(a, fieldId, courseOf),
  );
  const groups = buildVisibleGroups(
    orderAssignments(visible, display.grouping, display.ordering),
    assignmentGroupDefs(display.grouping, courses, courseOf, spaces),
    assignmentGroupDefs(display.subGrouping, courses, courseOf, spaces),
    "All assignments",
    display.showEmpty[display.layout] && display.grouping !== "none",
  );

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
      <ModuleViewHeader
        icon={IconClipboardCheck}
        title="Assignments"
        view={view}

        presets={
          <ViewPresetsButton
            spaceId={saveSpaceId}
            spaces={spaces}
            module={ASSIGNMENTS_OVERVIEW}
            presets={ASSIGNMENT_VIEW_PRESETS}
            fields={filterFields}
            describeDisplay={describeDisplay}
          />
        }
        displayMenu={
          <AssignmentDisplayMenu
            display={display}
            onChange={setDisplay}
            columns={groups}
            crossSpace
          />
        }
        create={{
          label: "New assignment",
          tooltip: "Create an assignment",
          onClick: startCreate,
          disabled: spaces.length === 0,
        }}
        filterFields={filterFields}
        filters={filters}
        onFiltersChange={setFilters}
        dirty={dirty}
        save={save}
        onDiscard={discard}
        spaceId={saveSpaceId}
        module={ASSIGNMENTS_OVERVIEW}
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
        <NoMatchesNotice text="No assignments match these filters." />
      ) : (
        <AssignmentGroups
          groups={groups}
          display={display}
          courseOf={courseOf}
          spaceById={spaceById}
          boardDraggable={boardDraggable}
          onMove={onMove}
          failedId={failedId}
          onOpen={open}
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
