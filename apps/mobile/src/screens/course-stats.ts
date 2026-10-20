import type { AssignmentRecord, ExamRecord, SessionRecord } from "@nookly/shared/data";
import { addDays } from "./dates.ts";

/// Assignments that no longer wait on the student: handed in or graded.
const HANDED_IN = new Set(["submitted", "graded"]);

export interface CourseStats {
  /// The next session that has not started, if any.
  nextSession: SessionRecord | null;
  assignments: { done: number; total: number; nextDue: string | null };
  exams: { done: number; total: number; next: string | null };
}

/// What a course's card says: its next session, how many assignments and exams are done, and
/// when the next one is due.
export function courseStats(
  courseId: string,
  sessions: SessionRecord[],
  exams: ExamRecord[],
  assignments: AssignmentRecord[],
  today: string,
  now = "00:00",
): CourseStats {
  const upcoming = sessions
    .filter(
      (s) =>
        s.courseId === courseId &&
        !s.cancelled &&
        (s.date > today || (s.date === today && s.endTime >= now)),
    )
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  const mine = assignments.filter((a) => a.courseId === courseId);
  const open = mine.filter((a) => !HANDED_IN.has(a.status));
  const myExams = exams.filter((e) => e.courseId === courseId);
  const coming = myExams.filter((e) => e.status !== "done" && e.examDate && e.examDate >= today);
  const first = (days: (string | null)[]) =>
    days.filter((d): d is string => d !== null).sort()[0] ?? null;
  return {
    nextSession: upcoming[0] ?? null,
    assignments: {
      done: mine.length - open.length,
      total: mine.length,
      nextDue: first(open.map((a) => a.dueDate)),
    },
    exams: {
      done: myExams.filter((e) => e.status === "done").length,
      total: myExams.length,
      next: first(coming.map((e) => e.examDate)),
    },
  };
}

/// "5d", "today", "overdue": how far off a day is.
export function inDays(day: string, today: string): string {
  if (day < today) return "overdue";
  if (day === today) return "today";
  let n = 0;
  for (let d = today; d < day && n < 3650; n += 1) d = addDays(d, 1);
  return `${n}d`;
}
