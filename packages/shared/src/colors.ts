/// Sixteen evenly spread accent hues, shared by every color picker on the desktop and
/// the phone (Spaces, Labels, ...) so "add more colors" only ever needs one list.
export const ACCENT_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
];

/// A stable color per name, so the same word always gets the same hue.
export function labelColorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ACCENT_COLORS[hash % ACCENT_COLORS.length];
}

/// A status of a fixed set, shaped like a Task status so it draws the same way.
export interface FixedStatus {
  id: string;
  name: string;
  color: string;
  /// 0 open, 50 in progress, 100 finished.
  doneness: number;
  position: number;
}

/// The Exam statuses the desktop's `EXAM_STATUSES` (Rust) accepts.
export const EXAM_STATUSES: FixedStatus[] = [
  { id: "upcoming", name: "Upcoming", color: "#64748b", doneness: 0, position: 0 },
  { id: "studying", name: "Studying", color: "#3b82f6", doneness: 50, position: 1 },
  { id: "done", name: "Done", color: "#22c55e", doneness: 100, position: 2 },
];

/// The Assignment statuses the desktop's `ASSIGNMENT_STATUSES` (Rust) accepts.
export const ASSIGNMENT_STATUSES: FixedStatus[] = [
  { id: "not_started", name: "Not started", color: "#64748b", doneness: 0, position: 0 },
  { id: "in_progress", name: "In progress", color: "#3b82f6", doneness: 50, position: 1 },
  { id: "submitted", name: "Submitted", color: "#a855f7", doneness: 75, position: 2 },
  { id: "graded", name: "Graded", color: "#22c55e", doneness: 100, position: 3 },
];
