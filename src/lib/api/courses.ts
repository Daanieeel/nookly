import { invoke } from "@tauri-apps/api/core";
import type { Entity } from "./types";

export function createCourse(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_course", { spaceId, title });
}

export function listCourses(spaceId: string): Promise<Entity[]> {
  return invoke("list_courses", { spaceId });
}

export function createSemester(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_semester", { spaceId, title });
}

export function listSemesters(spaceId: string): Promise<Entity[]> {
  return invoke("list_semesters", { spaceId });
}

export function linkCourseToSemester(courseId: string, semesterId: string): Promise<void> {
  return invoke("link_course_to_semester", { courseId, semesterId });
}
