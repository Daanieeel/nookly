import { invoke } from "@tauri-apps/api/core";
import type { Exam } from "./types";

export function createExam(
  spaceId: string,
  title: string,
  courseId: string,
  examDate: string | null,
  weight: number | null,
): Promise<Exam> {
  return invoke("create_exam", { spaceId, title, courseId, examDate, weight });
}

export function listExams(spaceId: string): Promise<Exam[]> {
  return invoke("list_exams", { spaceId });
}

export function listExamsAllSpaces(): Promise<Exam[]> {
  return invoke("list_exams_all_spaces");
}

export function updateExam(
  entityId: string,
  grade: number | null,
  status: string | null,
): Promise<void> {
  return invoke("update_exam", { entityId, grade, status });
}

export function updateExamDate(entityId: string, examDate: string | null): Promise<void> {
  return invoke("update_exam_date", { entityId, examDate });
}

/// `weight` as a fraction, like `0.2` for 20%.
export function updateExamWeight(entityId: string, weight: number | null): Promise<void> {
  return invoke("update_exam_weight", { entityId, weight });
}

/// Unlike `updateExam`, `null` clears the grade.
export function updateExamGrade(entityId: string, grade: number | null): Promise<void> {
  return invoke("update_exam_grade", { entityId, grade });
}

export function updateExamRoom(entityId: string, room: string | null): Promise<void> {
  return invoke("update_exam_room", { entityId, room });
}

/// Moves an exam to another Course, replacing its Course link.
export function setExamCourse(entityId: string, courseId: string): Promise<void> {
  return invoke("set_exam_course", { entityId, courseId });
}
