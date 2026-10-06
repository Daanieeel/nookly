import { invoke } from "@tauri-apps/api/core";
import type { Assignment } from "./types";

export function createAssignment(
  spaceId: string,
  title: string,
  courseId: string,
  dueDate: string | null,
): Promise<Assignment> {
  return invoke("create_assignment", { spaceId, title, courseId, dueDate });
}

export function listAssignments(spaceId: string): Promise<Assignment[]> {
  return invoke("list_assignments", { spaceId });
}

export function listAssignmentsAllSpaces(): Promise<Assignment[]> {
  return invoke("list_assignments_all_spaces");
}

export function updateAssignmentStatus(
  entityId: string,
  status: string,
  grade: number | null,
): Promise<void> {
  return invoke("update_assignment_status", { entityId, status, grade });
}

export function updateAssignmentDueDate(entityId: string, dueDate: string | null): Promise<void> {
  return invoke("update_assignment_due_date", { entityId, dueDate });
}

/// Due this many days before the Course's next session; `null` goes back to the fixed date.
export function updateAssignmentDueBeforeSession(
  entityId: string,
  offsetDays: number | null,
): Promise<void> {
  return invoke("update_assignment_due_before_session", { entityId, offsetDays });
}

/// Its share of the course's grade, as a fraction; `null` clears it.
export function updateAssignmentWeight(entityId: string, weight: number | null): Promise<void> {
  return invoke("update_assignment_weight", { entityId, weight });
}

/// Moves an assignment to another Course, replacing its Course link.
export function setAssignmentCourse(entityId: string, courseId: string): Promise<void> {
  return invoke("set_assignment_course", { entityId, courseId });
}
