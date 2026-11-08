import { IconClipboardCheck } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  assignmentFilterFields,
  assignmentFilterValue,
} from "#/features/assignments/assignment-filter-fields.tsx";
import {
  assignmentStatus,
  orderAssignments,
  statusKindOf,
} from "#/features/assignments/assignment-model.ts";
import { useCourseLookupAcross } from "#/features/courses/course-lookup.tsx";
import { weightPercent } from "#/features/exams/exam-model.ts";
import { listAssignments, listAssignmentsAllSpaces } from "#/lib/api/assignments.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Assignment, Entity, Space } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import {
  type BaseContext,
  dayField,
  keyField,
  numberField,
  relatedField,
  spaceField,
  statusField,
  timestampField,
  titleField,
} from "../fields.tsx";
import type { ViewField, ViewSource } from "../types.ts";

/// Assignments, as the view engine shows them. The fields mirror `ASSIGNMENT_FIELDS` in
/// `src-tauri/src/db/views.rs`.

export interface AssignmentContext extends BaseContext {
  /// The Course of each Assignment, through `assignment-course`, by the Assignment's id.
  courseOf: Map<string, Entity>;
  courses: Entity[];
}

export function assignmentContext(
  courses: Entity[],
  courseOf: Map<string, Entity>,
  spaces: Space[],
): AssignmentContext {
  return { courses, courseOf, spaces: new Map(spaces.map((s) => [s.id, s])) };
}

const entityOf = (a: Assignment) => a.entity;

export const ASSIGNMENT_FIELDS: ViewField<Assignment, AssignmentContext>[] = [
  keyField(entityOf),
  titleField(entityOf),
  statusField(
    (a) => ({ status: assignmentStatus(a.status), kind: statusKindOf(a.status) }),
    (a) => a.status,
  ),
  dayField("due", "Due date", (a) => a.dueDate),
  relatedField({
    id: "course",
    label: "Course",
    relationship: "assignment-course",
    lookup: (a, ctx) => {
      const course = ctx.courseOf.get(a.entity.id);
      return course ? [course] : [];
    },
  }),
  numberField("grade", "Grade", (a) => a.grade),
  numberField(
    "weight",
    "Weight",
    (a) => weightPercent(a.weight),
    (n) => `${n}%`,
  ),
  dayField("evaluatedAt", "Evaluated", (a) => a.evaluatedAt),
  spaceField(entityOf),
  timestampField("created", entityOf),
  timestampField("updated", entityOf),
];

/// A Space's Courses (every Space's for `null`) and the Course each of `type`'s items is
/// filed under through `relationship`.
export function useCoursesOf(spaceId: string | null, relationship: string) {
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceIds = useMemo(
    () => (spaceId ? [spaceId] : spaces.map((s) => s.id)),
    [spaceId, spaces],
  );
  return { spaces, ...useCourseLookupAcross(spaceIds, relationship) };
}

function useAssignmentData(spaceId: string | null) {
  const assignments = useQuery({
    queryKey: spaceId ? qk.assignments.bySpace(spaceId) : qk.assignments.all,
    queryFn: () => (spaceId ? listAssignments(spaceId) : listAssignmentsAllSpaces()),
  });
  const { spaces, courses, courseOf } = useCoursesOf(spaceId, "assignment-course");
  const ctx = useMemo(
    () => assignmentContext(courses, courseOf, spaces),
    [courses, courseOf, spaces],
  );
  return { items: assignments.data ?? [], ctx, isPending: assignments.isPending };
}

export const assignmentSource: ViewSource<Assignment, AssignmentContext> = {
  type: "assignment",
  label: "Assignments",
  itemLabel: "assignment",
  icon: IconClipboardCheck,
  entityOf,
  useData: useAssignmentData,
  fields: ASSIGNMENT_FIELDS,
  filterFields: (ctx) => assignmentFilterFields(ctx.courses),
  filterValue: (a, fieldId, ctx) => assignmentFilterValue(a, fieldId, ctx.courseOf),
  order: (items) => orderAssignments(items, "none", "due"),
  defaultColumns: ["key", "title", "status", "due", "course", "grade"],
};
