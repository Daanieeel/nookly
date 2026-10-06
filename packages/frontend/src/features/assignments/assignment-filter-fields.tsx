import { IconCalendarEvent, IconCircleDot, IconSchool, IconStar } from "@tabler/icons-react";
import { entityFilterOption, type FilterField } from "#/components/filter-menu.tsx";
import { AGE_FILTER_FIELDS } from "#/features/tasks/shared-view-defs.tsx";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
import type { Assignment, Entity } from "#/lib/api/types.ts";
import {
  ASSIGNMENT_STATUSES,
  DEADLINE_BUCKETS,
  GRADE_FILTER,
  ageBucket,
  deadlineBucket,
  statusKindOf,
} from "./assignment-model";

/// The filter fields every Assignments page has, from Course to Updated, in menu
/// order. The cross-Space overview puts a Space field in front.
export function assignmentFilterFields(courses: Entity[]): FilterField[] {
  return [
    {
      id: "course",
      label: "Course",
      icon: IconSchool,
      options: courses.map(entityFilterOption),
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
    ...AGE_FILTER_FIELDS,
  ];
}

/// The value an assignment has under a filter field.
export function assignmentFilterValue(
  a: Assignment,
  fieldId: string,
  courseOf: Map<string, Entity>,
): string {
  if (fieldId === "space") return a.entity.spaceId;
  if (fieldId === "course") return courseOf.get(a.entity.id)?.id ?? "";
  if (fieldId === "due") return deadlineBucket(a);
  if (fieldId === "grade") return a.grade === null ? "none" : "graded";
  if (fieldId === "created") return ageBucket(a.entity.createdAt);
  if (fieldId === "updated") return ageBucket(a.entity.updatedAt);
  return a.status;
}
