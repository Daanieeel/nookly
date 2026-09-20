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
