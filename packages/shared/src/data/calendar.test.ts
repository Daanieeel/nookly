import { beforeEach, describe, expect, it } from "vitest";
import {
  agenda,
  createCalendarEntry,
  getCalendarEntry,
  setCalendarEntryCancelled,
  updateCalendarEntry,
} from "./calendar.ts";
import { type LocalDb, first, rows } from "./db.ts";
import { createSpace } from "./entities.ts";
import {
  createOneOffSession,
  createStudyBlock,
  getSession,
  listSessions,
  listStudyBlocks,
  overrideSession,
  updateStudyBlock,
} from "./sessions.ts";
import { FIELD, TITLE_OVERRIDE, markOverride, validateDate, validateTimes } from "./series.ts";
import { createCourse, createExam, updateExam } from "./study.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
let space: string;

beforeEach(async () => {
  db = testDb();
  space = await createSpace(db, "Uni", "#3b82f6");
});

describe("what dates and times are accepted", () => {
  it("wants padded dates and times that end after they start", () => {
    expect(() => validateDate("The date", "2026-1-5")).toThrow("YYYY-MM-DD");
    expect(() => validateDate("The date", "2026-02-30")).toThrow("YYYY-MM-DD");
    expect(() => validateDate("The date", "2026-02-28")).not.toThrow();
    expect(() => validateTimes("A session", false, "10:00", "09:00")).toThrow(
      "A session has to end after it starts",
    );
    expect(() => validateTimes("A session", false, "9:00", "10:00")).toThrow("HH:MM");
    expect(() => validateTimes("A session", false, null, null)).toThrow("needed unless");
    expect(() => validateTimes("A calendar entry", true, null, null)).not.toThrow();
  });

  it("ends an override when a field goes back to its series, and keeps the rest", () => {
    expect(markOverride(0, FIELD.location, "B", "A", "A")).toBe(0);
    expect(markOverride(0, FIELD.location, "A", "B", "C")).toBe(FIELD.location);
    expect(markOverride(FIELD.location, FIELD.location, "B", "A", "A")).toBe(0);
    expect(markOverride(FIELD.startTime, FIELD.location, "A", "A", "A")).toBe(FIELD.startTime);
    expect(markOverride(0, FIELD.location, "A", "B", undefined)).toBe(FIELD.location);
  });
});

describe("calendar entries", () => {
  const entry = {
    title: "Dentist",
    date: "2026-10-20",
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    location: "Main Street",
  };

  it("makes a one off, even a multi day one, and refuses a bad one", async () => {
    const id = await createCalendarEntry(db, space, { ...entry, endDate: "2026-10-22" });
    const [row] = await rows(
      db,
      "SELECT date, end_date, start_time FROM calendar_entries WHERE entity_id = ?",
      id,
    );
    expect(row).toEqual({ date: "2026-10-20", end_date: "2026-10-22", start_time: "09:00" });
    await expect(createCalendarEntry(db, space, { ...entry, endTime: "08:00" })).rejects.toThrow(
      "has to end after",
    );
    await expect(
      createCalendarEntry(db, space, { ...entry, endDate: "2026-10-19" }),
    ).rejects.toThrow("can't end before");
  });

  it("marks what changed on one occurrence of a series, so the series leaves it be", async () => {
    // A series made on the desktop: its template and one occurrence.
    const template = await createCalendarEntry(db, space, entry);
    await db.driver.batch([
      {
        sql: "UPDATE entities SET type = 'calendar_entry_template' WHERE id = ?",
        params: [template],
      },
      { sql: "DELETE FROM calendar_entries WHERE entity_id = ?", params: [template] },
      {
        sql: "INSERT INTO calendar_entry_templates (entity_id, recurrence, start_time, end_time, all_day, location, anchor_date) VALUES (?, 'weekly', '09:00', '10:00', 0, 'Main Street', '2026-10-20')",
        params: [template],
      },
    ]);
    const occurrence = await createCalendarEntry(db, space, entry);
    await db.driver.batch([
      {
        sql: "UPDATE calendar_entries SET template_id = ? WHERE entity_id = ?",
        params: [template, occurrence],
      },
    ]);
    // Moved to the afternoon and given a new place, with a new title.
    await updateCalendarEntry(db, occurrence, {
      ...entry,
      title: "Dentist, rescheduled",
      startTime: "15:00",
      endTime: "16:00",
      location: "Elm Road",
    });
    const mask = Number(
      (
        await first(
          db,
          "SELECT overridden_fields AS m FROM calendar_entries WHERE entity_id = ?",
          occurrence,
        )
      )?.m,
    );
    expect(mask & FIELD.startTime).toBeTruthy();
    expect(mask & FIELD.endTime).toBeTruthy();
    expect(mask & FIELD.location).toBeTruthy();
    expect(mask & FIELD.allDay).toBeFalsy();
    expect(mask & TITLE_OVERRIDE).toBeTruthy();
    // Back to the series' place ends that override only.
    await updateCalendarEntry(db, occurrence, {
      ...entry,
      title: "Dentist, rescheduled",
      startTime: "15:00",
      endTime: "16:00",
      location: "Main Street",
    });
    const after = Number(
      (
        await first(
          db,
          "SELECT overridden_fields AS m FROM calendar_entries WHERE entity_id = ?",
          occurrence,
        )
      )?.m,
    );
    expect(after & FIELD.location).toBeFalsy();
    expect(after & FIELD.startTime).toBeTruthy();
  });

  it("reads an entry whole, cancelled or not", async () => {
    const id = await createCalendarEntry(db, space, {
      ...entry,
      endDate: "2026-10-21",
      description: "Bring the form",
    });
    await setCalendarEntryCancelled(db, id, true);
    expect(await getCalendarEntry(db, id)).toMatchObject({
      title: "Dentist",
      date: "2026-10-20",
      endDate: "2026-10-21",
      cancelled: true,
      templateId: null,
      description: "Bring the form",
    });
    expect(await getCalendarEntry(db, "missing")).toBeNull();
  });

  it("cancels and brings back, and a cancelled one leaves the agenda", async () => {
    const id = await createCalendarEntry(db, space, entry);
    expect((await agenda(db, "2026-10-20", "2026-10-20")).map((i) => i.id)).toEqual([id]);
    await setCalendarEntryCancelled(db, id, true);
    expect(await agenda(db, "2026-10-20", "2026-10-20")).toEqual([]);
    await setCalendarEntryCancelled(db, id, false);
    expect(await agenda(db, "2026-10-20", "2026-10-20")).toHaveLength(1);
  });
});

describe("sessions", () => {
  it("makes a one off session of a course, which the calendar shows and which can be moved or cancelled", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const id = await createOneOffSession(db, space, {
      title: "Lecture 1",
      courseId: course,
      date: "2026-10-21",
      startTime: "10:00",
      endTime: "11:30",
      location: "Room 5",
    });
    expect(await getSession(db, id)).toMatchObject({
      courseTitle: "Algorithms",
      location: "Room 5",
      cancelled: false,
    });
    await overrideSession(db, id, {
      date: "2026-10-22",
      location: "Room 7",
      notes: "Bring a laptop",
    });
    expect(await getSession(db, id)).toMatchObject({
      date: "2026-10-22",
      location: "Room 7",
      notes: "Bring a laptop",
    });
    expect((await agenda(db, "2026-10-22", "2026-10-22")).map((i) => [i.kind, i.title])).toEqual([
      ["session", "Lecture 1"],
    ]);
    await overrideSession(db, id, { cancelled: true });
    expect(await agenda(db, "2026-10-22", "2026-10-22")).toEqual([]);
    expect((await listSessions(db, { courseId: course })).map((s) => s.cancelled)).toEqual([true]);
    await expect(overrideSession(db, id, { startTime: "12:00" })).rejects.toThrow(
      "has to end after",
    );
    await expect(
      createOneOffSession(db, space, {
        title: "x",
        courseId: "nope",
        date: "2026-10-21",
        startTime: "10:00",
        endTime: "11:00",
      }),
    ).rejects.toThrow("Pick a course");
  });

  it("marks a changed time on a series' session, and not the other fields", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const template = await createOneOffSession(db, space, {
      title: "Lecture",
      courseId: course,
      date: "2026-10-21",
      startTime: "10:00",
      endTime: "11:00",
      location: "Room 5",
    });
    await db.driver.batch([
      { sql: "UPDATE entities SET type = 'session_template' WHERE id = ?", params: [template] },
      { sql: "DELETE FROM sessions WHERE entity_id = ?", params: [template] },
      {
        sql: "INSERT INTO session_templates (entity_id, weekday, start_time, end_time, location, anchor_date) VALUES (?, 2, '10:00', '11:00', 'Room 5', '2026-10-21')",
        params: [template],
      },
    ]);
    const session = await createOneOffSession(db, space, {
      title: "Lecture",
      courseId: course,
      date: "2026-10-28",
      startTime: "10:00",
      endTime: "11:00",
      location: "Room 5",
    });
    await db.driver.batch([
      {
        sql: "UPDATE sessions SET template_id = ? WHERE entity_id = ?",
        params: [template, session],
      },
    ]);
    await overrideSession(db, session, { startTime: "14:00", endTime: "15:00" });
    const mask = Number(
      (await first(db, "SELECT overridden_fields AS m FROM sessions WHERE entity_id = ?", session))
        ?.m,
    );
    expect(mask).toBe(FIELD.startTime | FIELD.endTime);
  });
});

describe("study blocks and the agenda", () => {
  it("sets time aside for an exam, which shows with the exam on the calendar", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const exam = await createExam(db, space, "Final", course);
    await updateExam(db, exam, { examDate: "2026-12-10", examTime: "09:00" });
    const block = await createStudyBlock(db, space, {
      title: "Revise graphs",
      examId: exam,
      date: "2026-12-05",
      startTime: "14:00",
      endTime: "16:00",
    });
    expect((await listStudyBlocks(db, { examId: exam })).map((b) => b.entity.id)).toEqual([block]);
    const days = await agenda(db, "2026-12-01", "2026-12-31");
    expect(days.map((i) => [i.date, i.kind, i.title])).toEqual([
      ["2026-12-05", "study_block", "Revise graphs"],
      ["2026-12-10", "exam", "Final"],
    ]);
    await updateStudyBlock(db, block, { date: "2026-12-06", startTime: "15:00" });
    expect((await listStudyBlocks(db))[0]).toMatchObject({
      date: "2026-12-06",
      startTime: "15:00",
      endTime: "16:00",
    });
    await expect(updateStudyBlock(db, block, { endTime: "14:00" })).rejects.toThrow(
      "has to end after",
    );
    await expect(
      createStudyBlock(db, space, {
        title: "x",
        examId: "nope",
        date: "2026-12-05",
        startTime: "14:00",
        endTime: "16:00",
      }),
    ).rejects.toThrow("Pick an exam");
  });
});
