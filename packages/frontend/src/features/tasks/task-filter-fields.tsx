import {
  IconBolt,
  IconCalendarCheck,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCircleDot,
} from "@tabler/icons-react";
import type { FilterField } from "#/components/filter-menu.tsx";
import type { TaskStatus } from "#/lib/api/types.ts";
import { EFFORT_STEPS, effortLabel } from "#/lib/effort.ts";
import { CREATED_FILTER_FIELD, UPDATED_FILTER_FIELD } from "./shared-view-defs";
import {
  COMPLETED_BUCKETS,
  DUE_BUCKETS,
  NO_EFFORT,
  START_BUCKETS,
  type StatusKind,
} from "./task-model";
import { TaskStatusIcon } from "./task-properties";

/// The filter fields every Tasks page has, from Status to Effort, in menu order.
export function taskFilterFields(
  statuses: TaskStatus[],
  kindOf: (statusId: string) => StatusKind,
  effortScale: Parameters<typeof effortLabel>[1],
): FilterField[] {
  return [
    {
      id: "status",
      label: "Status",
      icon: IconCircleDot,
      options: statuses.map((s) => ({
        value: s.id,
        label: s.name,
        icon: <TaskStatusIcon status={s} kind={kindOf(s.id)} />,
      })),
    },
    {
      id: "due",
      label: "Due date",
      icon: IconCalendarEvent,
      options: DUE_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
    },
    {
      id: "start",
      label: "Start date",
      icon: IconCalendarPlus,
      options: START_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
    },
    CREATED_FILTER_FIELD,
    UPDATED_FILTER_FIELD,
    {
      id: "completed",
      label: "Completed",
      icon: IconCalendarCheck,
      options: COMPLETED_BUCKETS.map((b) => ({ value: b.id, label: b.label })),
    },
    {
      id: "effort",
      label: "Effort",
      icon: IconBolt,
      options: [
        ...EFFORT_STEPS.map((s) => ({
          value: String(s.value),
          label: effortLabel(s.value, effortScale),
        })),
        { value: NO_EFFORT, label: "No estimate" },
      ],
    },
  ];
}
