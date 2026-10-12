import { IconClipboardCheck, IconMoodSmile } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { assignmentStatus, statusKindOf } from "#/features/assignments/assignment-model.ts";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
import { daysUntil } from "#/features/tasks/task-model.ts";
import { listAssignmentsAllSpaces } from "#/lib/api/assignments.ts";
import type { Assignment } from "#/lib/api/types.ts";
import { formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { requestFilters } from "#/features/views/pending-filters.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { parseDay } from "#/features/tasks/task-model.ts";
import { EmptyRow, LIST_LIMIT, Row, RowList, ShowMore, TabbedPanel } from "./DashboardPanel";
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

/// "Overdue", "Today" or the weekday within the coming week, from a due day.
export function dueText(day: string): DueText {
  const days = daysUntil(day);
  if (days < 0) return { text: `Overdue, ${formatShortDate(day)}`, overdue: true };
  if (days === 0) return { text: "Today", overdue: false };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  if (days < 7) return { text: formatWeekday(parseDay(day), "short"), overdue: false };
  return { text: formatShortDate(day), overdue: false };
}

function AssignmentRow({ assignment }: { assignment: Assignment }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { entity } = assignment;
  const status = assignmentStatus(assignment.status);
  const due = assignment.dueDate ? dueText(assignment.dueDate.slice(0, 10)) : null;
  return (
    <Row
      entityKey={entity.key}
      icon={<TaskStatusIcon status={status} kind={statusKindOf(status.id)} />}
      onClick={() => openEntity(entity.id, entity.spaceId)}
      {...entityTarget(entity)}
      meta={due && <span className={cn(due.overdue && "text-destructive")}>{due.text}</span>}
    >
      <span className="truncate">{displayTitle(entity)}</span>
    </Row>
  );
}

/// Open assignments by importance: the one tied to a session that is today first,
/// then the closest due date.
export function AssignmentsPanel({ today }: { today: string }) {
  const setView = useNavStore((s) => s.setView);
  const [tab, setTab] = useState<AssignmentTab>("today");
  const { data: all = [] } = useQuery({
    queryKey: qk.assignments.all,
    queryFn: listAssignmentsAllSpaces,
  });
  const tabs = TABS.map((t) => ({ ...t, count: assignmentsFor(t.id, all, today).length }));
  const items = assignmentsFor(tab, all, today);

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
        {items.slice(0, LIST_LIMIT).map((a) => (
          <AssignmentRow key={a.entity.id} assignment={a} />
        ))}
        <ShowMore
          count={items.length - LIST_LIMIT}
          onClick={() => {
            requestFilters(STORAGE_KEYS.assignmentsOverviewFilters, assignmentFilters(tab));
            setView({ kind: "assignments" });
          }}
        />
      </RowList>
    </TabbedPanel>
  );
}
