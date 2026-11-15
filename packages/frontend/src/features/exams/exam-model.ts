import { differenceInCalendarDays, parseISO } from "date-fns";
import { EXAM_STATUSES as SHARED_EXAM_STATUSES } from "@nookly/shared/colors";
import type { TaskStatus } from "#/lib/api/types.ts";
import type { StatusKind } from "#/features/tasks/task-model.ts";

/// The fixed Exam statuses, shaped like Task statuses so they draw with the same
/// Linear style glyphs and picker. The phone uses the same list.
export const EXAM_STATUSES: TaskStatus[] = SHARED_EXAM_STATUSES;

export function examStatus(id: string): TaskStatus {
  return EXAM_STATUSES.find((s) => s.id === id) ?? EXAM_STATUSES[0];
}

export function examStatusKind(id: string): StatusKind {
  if (id === "done") return "completed";
  if (id === "studying") return "started";
  return "unstarted";
}

export { weightPercent } from "@nookly/shared/data";

/// When an exam is, from today: soon, later, already behind, or not set yet.
export const EXAM_WHEN_BUCKETS: { id: string; label: string }[] = [
  { id: "week", label: "Next 7 days" },
  { id: "later", label: "Later" },
  { id: "past", label: "Past" },
  { id: "none", label: "No date" },
];

export function examWhen(examDate: string | null, now = new Date()): string {
  if (!examDate) return "none";
  const days = differenceInCalendarDays(parseISO(examDate), now);
  if (days < 0) return "past";
  return days <= 7 ? "week" : "later";
}
