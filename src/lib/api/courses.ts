import { invoke } from "@tauri-apps/api/core";
import type { Entity, Semester } from "./types";

export function createCourse(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_course", { spaceId, title });
}

export function listCourses(spaceId: string): Promise<Entity[]> {
  return invoke("list_courses", { spaceId });
}

export function createSemester(
  spaceId: string,
  title: string,
  opts: {
    startDate?: string | null;
    endDate?: string | null;
    termType?: string | null;
    year?: number | null;
  } = {},
): Promise<Semester> {
  return invoke("create_semester", {
    spaceId,
    title,
    startDate: opts.startDate ?? null,
    endDate: opts.endDate ?? null,
    termType: opts.termType ?? null,
    year: opts.year ?? null,
  });
}

export function listSemesters(spaceId: string): Promise<Semester[]> {
  return invoke("list_semesters", { spaceId });
}

export function updateSemester(
  entityId: string,
  patch: { startDate?: string; endDate?: string; termType?: string; year?: number },
): Promise<void> {
  return invoke("update_semester", {
    entityId,
    startDate: patch.startDate ?? null,
    endDate: patch.endDate ?? null,
    termType: patch.termType ?? null,
    year: patch.year ?? null,
  });
}

/// Manual "this is the current semester" override — clears the flag on
/// every other Semester in the Space (data layer enforces at most one).
export function setCurrentSemester(spaceId: string, entityId: string): Promise<void> {
  return invoke("set_current_semester", { spaceId, entityId });
}

/// Persists a drag-reorder — `orderedIds` is the full new display order.
export function reorderSemesters(orderedIds: string[]): Promise<void> {
  return invoke("reorder_semesters", { orderedIds });
}

export function linkCourseToSemester(courseId: string, semesterId: string): Promise<void> {
  return invoke("link_course_to_semester", { courseId, semesterId });
}

/// Finds this Course's auto-created Course Notes page, creating it on first
/// request if one doesn't exist yet (e.g. a Course created before this feature).
export function getCourseNotes(courseId: string): Promise<Entity> {
  return invoke("get_course_notes", { courseId });
}
