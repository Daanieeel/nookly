import { IconClipboardCheck, IconMoodSmile } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { assignmentStatus, isDone, statusKindOf } from "#/features/assignments/assignment-model.ts";
import { pastDayText } from "#/components/due-columns.tsx";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
import { daysUntil } from "#/features/tasks/task-model.ts";
import { listAssignmentsAllSpaces } from "#/lib/api/assignments.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { requestFilters } from "#/features/views/pending-filters.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { SpaceChip } from "#/components/space-chip.tsx";
import type { Space } from "#/lib/api/types.ts";
import {
  EmptyRow,
  useSpaceById,
  useListLimit,
  Row,
  RowList,
  ShowMore,
  TabbedPanel,
} from "./DashboardPanel";
import { type AssignmentTab, assignmentFilters, assignmentsFor } from "./dashboard-model";

const TABS: { id: AssignmentTab; label: string }[] = [
  { id: "today", label: "For today" },
  { id: "dueToday", label: "Due today" },
  { id: "week", label: "Next 7 days" },
];

export interface DueText {
  text: string;
  overdue: boolean;
}

/// Days ahead up to which a due date reads as relative.
const RELATIVE_DAYS = 10;

/// "Overdue, Oct 8", then "Today", "Tomorrow" and "in 4 days" up to 10 days out, and a
/// short date beyond that. Finished work is never overdue: a past date reads "3 days ago".
export function dueText(day: string, done = false): DueText {
  const days = daysUntil(day);
  if (days < 0 && done) return { text: pastDayText(-days), overdue: false };
  if (days < 0) return { text: `Overdue, ${formatShortDate(day)}`, overdue: true };
  if (days === 0) return { text: "Today", overdue: false };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  if (days <= RELATIVE_DAYS) return { text: `in ${days} days`, overdue: false };
  return { text: formatShortDate(day), overdue: false };
}

function AssignmentRow({
  assignment,
  space,
}: {
  assignment: Assignment;
  space: Space | undefined;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { entity } = assignment;
  const status = assignmentStatus(assignment.status);
  const due = assignment.dueDate
    ? dueText(assignment.dueDate.slice(0, 10), isDone(assignment))
    : null;
  return (
    <Row
      entityKey={entity.key}
      icon={<TaskStatusIcon status={status} kind={statusKindOf(status.id)} />}
      onClick={() => openEntity(entity.id, entity.spaceId)}
      {...entityTarget(entity)}
      meta={
        <>
          {space && <SpaceChip space={space} />}
          {due && <span className={cn(due.overdue && "text-destructive")}>{due.text}</span>}
        </>
      }
    >
      <span className="truncate">{displayTitle(entity)}</span>
    </Row>
  );
}

/// Open assignments by importance: the one tied to a session that is today first,
/// then the closest due date.
export function AssignmentsPanel({ today }: { today: string }) {
  const setView = useNavStore((s) => s.setView);
  const spaces = useSpaceById();
  const [tab, setTab] = useState<AssignmentTab>("today");
  const { data: all = [] } = useQuery({
    queryKey: qk.assignments.all,
    queryFn: listAssignmentsAllSpaces,
  });
  const tabs = TABS.map((t) => ({ ...t, count: assignmentsFor(t.id, all, today).length }));
  const items = assignmentsFor(tab, all, today);
  const limit = useListLimit();

  return (
    <TabbedPanel
      icon={IconClipboardCheck}
      title="Assignments"
      tabs={tabs}
      tab={tab}
      onTabChange={setTab}
    >
      <RowList>
        {items.length === 0 && (
          <EmptyRow icon={IconMoodSmile}>Nothing here. Enjoy the calm.</EmptyRow>
        )}
        {items.slice(0, limit).map((a) => (
          <AssignmentRow key={a.entity.id} assignment={a} space={spaces.get(a.entity.spaceId)} />
        ))}
        <ShowMore
          count={items.length - limit}
          onClick={() => {
            requestFilters(STORAGE_KEYS.assignmentsOverviewFilters, assignmentFilters(tab));
            setView({ kind: "assignments" });
          }}
        />
      </RowList>
    </TabbedPanel>
  );
}
