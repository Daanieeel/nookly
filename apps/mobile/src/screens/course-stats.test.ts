import type { AssignmentRecord, ExamRecord, SessionRecord } from "@nookly/shared/data";
import { courseStats, inDays } from "./course-stats.ts";

// SAFETY: a fixture with only the fields the function under test reads.
const session = (over: Partial<SessionRecord>): SessionRecord =>
  ({
    courseId: "c1",
    cancelled: false,
    date: "2026-10-21",
    startTime: "10:00",
    endTime: "11:00",
    ...over,
  }) as SessionRecord;
// SAFETY: a fixture with only the fields the function under test reads.
const exam = (over: Partial<ExamRecord>): ExamRecord =>
  ({ courseId: "c1", status: "upcoming", examDate: "2026-11-19", ...over }) as ExamRecord;
// SAFETY: a fixture with only the fields the function under test reads.
const assignment = (over: Partial<AssignmentRecord>): AssignmentRecord =>
  ({ courseId: "c1", status: "not_started", dueDate: "2026-10-26", ...over }) as AssignmentRecord;

describe("a course's card", () => {
  it("names the next session that has not ended, skipping cancelled ones and other courses", () => {
    const stats = courseStats(
      "c1",
      [
        session({ date: "2026-10-20" }),
        session({ date: "2026-10-22", cancelled: true }),
        session({ date: "2026-10-23", courseId: "c2" }),
        session({ date: "2026-10-24", startTime: "09:00" }),
        session({ date: "2026-10-21", startTime: "08:00", endTime: "09:00" }),
      ],
      [],
      [],
      "2026-10-21",
      "09:30",
    );
    expect(stats.nextSession?.date).toBe("2026-10-24");
  });

  it("counts handed in work as done and names the soonest open due day", () => {
    const stats = courseStats(
      "c1",
      [],
      [],
      [
        assignment({ status: "graded", dueDate: "2026-10-01" }),
        assignment({ dueDate: "2026-11-02" }),
        assignment({ dueDate: "2026-10-26" }),
        assignment({ courseId: "c2" }),
      ],
      "2026-10-21",
    );
    expect(stats.assignments).toEqual({ done: 1, total: 3, nextDue: "2026-10-26" });
  });

  it("counts finished exams and names the next one still to come", () => {
    const stats = courseStats(
      "c1",
      [],
      [
        exam({ status: "done", examDate: "2026-10-01" }),
        exam({ examDate: "2026-12-01" }),
        exam({ examDate: "2026-11-19" }),
      ],
      [],
      "2026-10-21",
    );
    expect(stats.exams).toEqual({ done: 1, total: 3, next: "2026-11-19" });
  });

  it("says how far off a day is", () => {
    expect(inDays("2026-10-26", "2026-10-21")).toBe("5d");
    expect(inDays("2026-10-21", "2026-10-21")).toBe("today");
    expect(inDays("2026-10-20", "2026-10-21")).toBe("overdue");
  });
});
