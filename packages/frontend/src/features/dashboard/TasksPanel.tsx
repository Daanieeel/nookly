import { IconMoodSmile, IconTargetArrow } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
import { sortStatuses, statusKind } from "#/features/tasks/task-model.ts";
import { listTaskStatuses, listTasksAll } from "#/lib/api/tasks.ts";
import type { Task, TaskStatus } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { requestFilters } from "#/features/views/pending-filters.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { dueText } from "./AssignmentsPanel";
import { EmptyRow, LIST_LIMIT, Row, RowList, ShowMore, TabbedPanel } from "./DashboardPanel";
import { type TaskTab, taskFilters, tasksFor } from "./dashboard-model";

const TABS: { id: TaskTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "inProgress", label: "In progress" },
  { id: "upcoming", label: "Upcoming" },
  { id: "noDate", label: "No date" },
];

function TaskRow({ task, statuses }: { task: Task; statuses: TaskStatus[] }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { entity } = task;
  const status = statuses.find((s) => s.id === task.statusId);
  const due = task.dueDate ? dueText(task.dueDate.slice(0, 10)) : null;
  return (
    <Row
      entityKey={entity.key}
      icon={
        status ? (
          <TaskStatusIcon status={status} kind={statusKind(status, statuses)} />
        ) : (
          <IconTargetArrow size={14} />
        )
      }
      onClick={() => openEntity(entity.id, entity.spaceId)}
      {...entityTarget(entity)}
      meta={due && <span className={cn(due.overdue && "text-destructive")}>{due.text}</span>}
    >
      <span className="truncate">{displayTitle(entity)}</span>
    </Row>
  );
}

/// Open tasks that need attention, soonest due first.
export function TasksPanel({ today }: { today: string }) {
  const setView = useNavStore((s) => s.setView);
  const [tab, setTab] = useState<TaskTab>("today");
  const { data: all = [] } = useQuery({ queryKey: qk.tasks.all, queryFn: listTasksAll });
  const { data: rawStatuses = [] } = useQuery({
    queryKey: qk.tasks.statuses,
    queryFn: listTaskStatuses,
  });
  const statuses = sortStatuses(rawStatuses);
  const tabs = TABS.map((t) => ({ ...t, count: tasksFor(t.id, all, statuses, today).length }));
  const items = tasksFor(tab, all, statuses, today);

  return (
    <TabbedPanel icon={IconTargetArrow} title="Tasks" tabs={tabs} tab={tab} onTabChange={setTab}>
      <RowList>
        {items.length === 0 && (
          <EmptyRow icon={IconMoodSmile}>Nothing here. Enjoy the calm.</EmptyRow>
        )}
        {items.slice(0, LIST_LIMIT).map((t) => (
          <TaskRow key={t.entity.id} task={t} statuses={statuses} />
        ))}
        <ShowMore
          count={items.length - LIST_LIMIT}
          onClick={() => {
            requestFilters(STORAGE_KEYS.tasksOverviewFilters, taskFilters(tab, statuses));
            setView({ kind: "tasks" });
          }}
        />
      </RowList>
    </TabbedPanel>
  );
}
