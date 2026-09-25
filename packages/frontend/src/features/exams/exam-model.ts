import type { TaskStatus } from "#/lib/api/types.ts";
import type { StatusKind } from "#/features/tasks/task-model.ts";

/// The fixed Exam statuses, shaped like Task statuses so they draw with the same
/// Linear style glyphs and picker.
export const EXAM_STATUSES: TaskStatus[] = [
  { id: "upcoming", name: "Upcoming", color: "#64748b", doneness: 0, position: 0 },
  { id: "studying", name: "Studying", color: "#3b82f6", doneness: 50, position: 1 },
  { id: "done", name: "Done", color: "#22c55e", doneness: 100, position: 2 },
];

export function examStatus(id: string): TaskStatus {
  return EXAM_STATUSES.find((s) => s.id === id) ?? EXAM_STATUSES[0];
}

export function examStatusKind(id: string): StatusKind {
  if (id === "done") return "completed";
  if (id === "studying") return "started";
  return "unstarted";
}

/// Weight is stored as a fraction (`0.2`); older whole numbers are percentages.
export function weightPercent(weight: number | null): number | null {
  if (weight === null) return null;
  return Math.round(weight <= 1 ? weight * 100 : weight);
}
