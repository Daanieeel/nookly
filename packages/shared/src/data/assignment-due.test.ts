import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace } from "./entities.ts";
import { createOneOffSession, overrideSession } from "./sessions.ts";
import {
  createAssignment,
  createCourse,
  getAssignment,
  listAssignments,
  setAssignmentDueBeforeSession,
  setAssignmentDueDate,
} from "./study.ts";
import { trashEntity } from "./entities.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
let space: string;
let course: string;
beforeEach(async () => {
  db = testDb();
  space = await createSpace(db, "Uni", "#3b82f6");
  course = await createCourse(db, space, "Algorithms");
});

const session = (date: string, start = "10:00") =>
  createOneOffSession(db, space, {
    title: "Lecture",
    courseId: course,
    date,
    startTime: start,
    endTime: "11:30",
  });

const due = async (id: string) => (await getAssignment(db, id))?.dueDate;

describe("an assignment due before a session of its course", () => {
  it("is due that many days before the next session that has not started", async () => {
    const past = await session("2000-01-10");
    const next = await session("2999-03-10");
    await session("2999-03-17");
    const a = await createAssignment(db, space, "Sheet 1", course, "2026-01-01");
    await setAssignmentDueBeforeSession(db, a, 2, null);
    expect(await due(a)).toBe("2999-03-08");
    expect((await getAssignment(db, a))?.dueSessionOffsetDays).toBe(2);
    // The next session moving or being cancelled moves the day with it.
    await overrideSession(db, next, { cancelled: true });
    expect(await due(a)).toBe("2999-03-15");
    await overrideSession(db, past, { date: "2999-03-01" });
    expect(await due(a)).toBe("2999-02-27");
  });

  it("stays on the last session there is, so cancelling the only one keeps a day", async () => {
    const only = await session("2999-03-10");
    const a = await createAssignment(db, space, "Sheet 1", course, null);
    await setAssignmentDueBeforeSession(db, a, 1, null);
    await overrideSession(db, only, { cancelled: true });
    expect(await due(a)).toBe("2999-03-09");
  });

  it("has no day for a course without sessions", async () => {
    const a = await createAssignment(db, space, "Sheet 1", course, "2026-01-01");
    await setAssignmentDueBeforeSession(db, a, 3, null);
    expect(await due(a)).toBeNull();
  });

  it("follows one session picked, and moves on to the next when it is cancelled, coming back with it", async () => {
    const first = await session("2999-03-10");
    await session("2999-03-17");
    await session("2999-03-24");
    const a = await createAssignment(db, space, "Sheet 1", course, null);
    await setAssignmentDueBeforeSession(db, a, 1, first);
    expect(await due(a)).toBe("2999-03-09");
    await overrideSession(db, first, { cancelled: true });
    expect(await due(a)).toBe("2999-03-16");
    await overrideSession(db, first, { cancelled: false });
    expect(await due(a)).toBe("2999-03-09");
    await trashEntity(db, first);
    expect(await due(a)).toBe("2999-03-16");
  });

  it("only takes a session of its own course, and a sensible number of days", async () => {
    const other = await createCourse(db, space, "Networks");
    const s = await createOneOffSession(db, space, {
      title: "L",
      courseId: other,
      date: "2999-01-01",
      startTime: "10:00",
      endTime: "11:00",
    });
    const a = await createAssignment(db, space, "Sheet 1", course, null);
    await expect(setAssignmentDueBeforeSession(db, a, 1, s)).rejects.toThrow(
      "of the assignment's course",
    );
    await expect(setAssignmentDueBeforeSession(db, a, 400, null)).rejects.toThrow("0 and 365");
    await expect(setAssignmentDueBeforeSession(db, a, null, s)).rejects.toThrow("needs");
  });

  it("goes back to a fixed day when one is picked, and lists in due order with the resolved days", async () => {
    await session("2999-03-10");
    const later = await createAssignment(db, space, "Later", course, "2999-05-01");
    const follows = await createAssignment(db, space, "Follows", course, null);
    await setAssignmentDueBeforeSession(db, follows, 0, null);
    expect((await listAssignments(db)).map((x) => [x.entity.title, x.dueDate])).toEqual([
      ["Follows", "2999-03-10"],
      ["Later", "2999-05-01"],
    ]);
    await setAssignmentDueDate(db, follows, "2999-07-01");
    expect((await getAssignment(db, follows))?.dueSessionOffsetDays).toBeNull();
    expect(await due(follows)).toBe("2999-07-01");
    expect(later).toBeTruthy();
  });
});
