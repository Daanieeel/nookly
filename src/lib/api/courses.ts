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
  startDate: string | null = null,
  endDate: string | null = null,
): Promise<Semester> {
  return invoke("create_semester", { spaceId, title, startDate, endDate });
}

export function listSemesters(spaceId: string): Promise<Semester[]> {
  return invoke("list_semesters", { spaceId });
}

export function updateSemester(
  entityId: string,
  patch: { startDate?: string; endDate?: string },
): Promise<void> {
  return invoke("update_semester", {
    entityId,
    startDate: patch.startDate ?? null,
    endDate: patch.endDate ?? null,
  });
}

export function linkCourseToSemester(courseId: string, semesterId: string): Promise<void> {
  return invoke("link_course_to_semester", { courseId, semesterId });
}

/// Finds this Course's auto-created Course Notes page, creating it on first
/// request if one doesn't exist yet (e.g. a Course created before this feature).
export function getCourseNotes(courseId: string): Promise<Entity> {
  return invoke("get_course_notes", { courseId });
}
