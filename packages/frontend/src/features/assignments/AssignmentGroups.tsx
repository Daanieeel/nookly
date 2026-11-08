import { GroupedBoard } from "#/components/grouped-view/grouped-board.tsx";
import { GroupedList } from "#/components/grouped-view/grouped-list.tsx";
import type { ViewGroup } from "#/components/grouped-view/grouping.ts";
import type { Assignment, Entity, Space } from "#/lib/api/types.ts";
import {
  assignmentContext,
  assignmentSource,
} from "#/features/views/engine/sources/assignments.tsx";
import { ViewTable, groupsForTable } from "#/features/views/engine/ViewTable.tsx";
import type { DisplayOptions } from "./assignment-model";
import {
  AssignmentCard,
  AssignmentCardBody,
  AssignmentColumnLabels,
  AssignmentRow,
} from "./assignment-views";

/// A Space's own page has no use for a Space column.
const SPACE_HIDDEN_FIELDS = ["space"];

/// The board, the grouped list or the table of an Assignments page. `spaceById` is set on the
/// cross-Space overview, where each row and card carries its Space.
export function AssignmentGroups({
  groups,
  display,
  onDisplayChange,
  courseOf,
  spaceById,
  boardDraggable,
  onMove,
  failedId,
  onOpen,
}: {
  groups: ViewGroup<Assignment>[];
  display: DisplayOptions;
  onDisplayChange: (display: DisplayOptions) => void;
  courseOf: Map<string, Entity>;
  spaceById?: Map<string, Space>;
  boardDraggable: boolean;
  onMove: (assignment: Assignment, columnId: string, laneId: string | null) => void;
  failedId: string | undefined;
  onOpen: (assignment: Assignment) => void;
}) {
  const spaceOf = (a: Assignment) => spaceById?.get(a.entity.spaceId);
  // Remount on regrouping so collapsed lanes start from their defaults.
  const key = `${display.grouping}:${display.subGrouping}`;
  if (display.layout === "table") {
    return (
      <ViewTable
        source={assignmentSource}
        items={[...new Set(groups.flatMap((g) => g.items))]}
        ctx={assignmentContext([], courseOf, [...(spaceById?.values() ?? [])])}
        table={display.table}
        onTableChange={(table) => onDisplayChange({ ...display, table })}
        onOpen={onOpen}
        groups={groupsForTable(groups, display.grouping)}
        hiddenFields={spaceById ? undefined : SPACE_HIDDEN_FIELDS}
      />
    );
  }
  return display.layout === "board" ? (
    <GroupedBoard
      key={key}
      groups={groups}
      hiddenColumns={display.hiddenColumns}
      onHiddenColumnsChange={(hiddenColumns) => onDisplayChange({ ...display, hiddenColumns })}
      getKey={(a) => a.entity.id}
      draggable={boardDraggable}
      onMove={onMove}
      renderOverlay={(a) => (
        <AssignmentCardBody
          assignment={a}
          course={courseOf.get(a.entity.id)}
          space={spaceOf(a)}
          className="rotate-2 shadow-lg"
        />
      )}
      renderCard={(a, drag) => (
        <AssignmentCard
          assignment={a}
          course={courseOf.get(a.entity.id)}
          space={spaceOf(a)}
          drag={drag}
          failed={failedId === a.entity.id}
          onOpen={() => onOpen(a)}
        />
      )}
    />
  ) : (
    <GroupedList
      key={key}
      groups={groups}
      showHeaders={display.grouping !== "none"}
      getKey={(a) => a.entity.id}
      footer={<AssignmentColumnLabels />}
      renderRow={(a) => (
        <AssignmentRow
          assignment={a}
          course={courseOf.get(a.entity.id)}
          space={spaceOf(a)}
          onOpen={() => onOpen(a)}
        />
      )}
    />
  );
}
