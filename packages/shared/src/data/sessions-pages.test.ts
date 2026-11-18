import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace, getEntity, trashEntity } from "./entities.ts";
import { createSessionPage, createOneOffSession, sessionPage } from "./sessions.ts";
import { createCourse } from "./study.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
beforeEach(() => {
  db = testDb();
});

async function session() {
  const space = await createSpace(db, "Uni", "#000000");
  const course = await createCourse(db, space, "Algorithms");
  const id = await createOneOffSession(db, space, {
    title: "Lecture 1",
    courseId: course,
    date: "2026-10-21",
    startTime: "10:00",
    endTime: "11:30",
  });
  return { space, id };
}

describe("the Jot and Note of a session", () => {
  it("makes one of each, titled after the course and day, and gives the same back after", async () => {
    const { id } = await session();
    expect(await sessionPage(db, id, "jot")).toBeNull();
    const jot = await createSessionPage(db, id, "jot");
    const note = await createSessionPage(db, id, "note");
    expect((await getEntity(db, jot))?.title).toBe("Algorithms, 2026-10-21");
    expect((await sessionPage(db, id, "jot"))?.id).toBe(jot);
    expect((await sessionPage(db, id, "note"))?.id).toBe(note);
    expect(await createSessionPage(db, id, "jot")).toBe(jot);
  });

  it("makes a fresh one when the old one is in the Trash", async () => {
    const { id } = await session();
    const first = await createSessionPage(db, id, "note");
    await trashEntity(db, first);
    expect(await sessionPage(db, id, "note")).toBeNull();
    expect(await createSessionPage(db, id, "note")).not.toBe(first);
  });
});
