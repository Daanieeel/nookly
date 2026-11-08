import { IconCircleDot, IconSchool, IconTargetArrow } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { entityFilterOption } from "#/components/filter-menu.tsx";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
import {
  EXAM_STATUSES,
  examStatus,
  examStatusKind,
  weightPercent,
} from "#/features/exams/exam-model.ts";
import { listExams, listExamsAllSpaces } from "#/lib/api/exams.ts";
import type { Entity, Exam } from "#/lib/api/types.ts";
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
import { useCoursesOf } from "./assignments.tsx";

/// Exams, as the view engine shows them: the first type without a module page of Views,
/// shown where a page embeds one.

export interface ExamContext extends BaseContext {
  /// The Course of each Exam, through `exam-course`, by the Exam's id.
  courseOf: Map<string, Entity>;
  courses: Entity[];
}

const entityOf = (exam: Exam) => exam.entity;

const textOrNull = (text: string | null) => (text?.trim() ? text : null);

const EXAM_FIELDS: ViewField<Exam, ExamContext>[] = [
  keyField(entityOf),
  titleField(entityOf),
  statusField(
    (exam) => ({ status: examStatus(exam.status), kind: examStatusKind(exam.status) }),
    (exam) => exam.status,
  ),
  dayField("date", "Date", (exam) => exam.examDate),
  { id: "time", label: "Time", kind: "text", fit: true, value: (exam) => exam.examTime },
  { id: "room", label: "Room", kind: "text", value: (exam) => textOrNull(exam.room) },
  relatedField({
    id: "course",
    label: "Course",
    relationship: "exam-course",
    lookup: (exam, ctx) => {
      const course = ctx.courseOf.get(exam.entity.id);
      return course ? [course] : [];
    },
  }),
  numberField("grade", "Grade", (exam) => exam.grade),
  numberField(
    "weight",
    "Weight",
    (exam) => weightPercent(exam.weight),
    (n) => `${n}%`,
  ),
  spaceField(entityOf),
  timestampField("created", entityOf),
  timestampField("updated", entityOf),
];

function useExamData(spaceId: string | null) {
  const exams = useQuery({
    queryKey: spaceId ? qk.exams.bySpace(spaceId) : qk.exams.all,
    queryFn: () => (spaceId ? listExams(spaceId) : listExamsAllSpaces()),
  });
  const { spaces, courses, courseOf } = useCoursesOf(spaceId, "exam-course");
  const ctx = useMemo<ExamContext>(
    () => ({ courses, courseOf, spaces: new Map(spaces.map((s) => [s.id, s])) }),
    [courses, courseOf, spaces],
  );
  return { items: exams.data ?? [], ctx, isPending: exams.isPending };
}

export const examSource: ViewSource<Exam, ExamContext> = {
  type: "exam",
  label: "Exams",
  itemLabel: "exam",
  icon: IconTargetArrow,
  entityOf,
  useData: useExamData,
  fields: EXAM_FIELDS,
  filterFields: (ctx) => [
    {
      id: "status",
      label: "Status",
      icon: IconCircleDot,
      options: EXAM_STATUSES.map((s) => ({
        value: s.id,
        label: s.name,
        icon: <TaskStatusIcon status={s} kind={examStatusKind(s.id)} />,
      })),
    },
    {
      id: "course",
      label: "Course",
      icon: IconSchool,
      options: ctx.courses.map(entityFilterOption),
    },
  ],
  filterValue: (exam, fieldId, ctx) => {
    if (fieldId === "course") return ctx.courseOf.get(exam.entity.id)?.id ?? "";
    if (fieldId === "space") return exam.entity.spaceId;
    return exam.status;
  },
  // Soonest first, undated last.
  order: (exams) =>
    [...exams].sort((a, b) => (a.examDate ?? "9999").localeCompare(b.examDate ?? "9999")),
  defaultColumns: ["key", "title", "status", "date", "course", "grade"],
};
