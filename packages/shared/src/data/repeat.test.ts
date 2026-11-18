import { beforeEach, describe, expect, it } from "vitest";
import { agenda } from "./calendar.ts";
import { type LocalDb, rows } from "./db.ts";
import { createSpace } from "./entities.ts";
import {
  DEFAULT_REPEAT,
  createCalendarEntrySeries,
  createSessionSeries,
  repeatDays,
  repeatProblem,
} from "./repeat.ts";
import { listSessions } from "./sessions.ts";
import { createCourse } from "./study.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
let space: string;

beforeEach(async () => {
  db = testDb();
  space = await createSpace(db, "Uni", "#3b82f6");
});

describe("the days a repeat lands on", () => {
  it("counts from the first day, for a while or until a day, as the desktop does", () => {
    expect(repeatDays("2026-11-16", DEFAULT_REPEAT)).toEqual(["2026-11-16"]);
    expect(
      repeatDays("2026-11-16", {
        ...DEFAULT_REPEAT,
        cadence: "weekly",
        durationCount: 3,
        durationUnit: "weeks",
      }),
    ).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(
      repeatDays("2026-12-30", {
        ...DEFAULT_REPEAT,
        cadence: "daily",
        endMode: "until",
        until: "2027-01-01",
      }),
    ).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  // A month end stays a month end where it can, never drifting (Jan 31, Feb 28, Mar 31).
  it("keeps a month end from drifting", () => {
    expect(
      repeatDays("2027-01-31", {
        ...DEFAULT_REPEAT,
        cadence: "monthly",
        durationCount: 3,
        durationUnit: "months",
      }),
    ).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("says what is wrong with a repeat that can't be made", () => {
    const until = { ...DEFAULT_REPEAT, cadence: "daily" as const, endMode: "until" as const };
    expect(repeatProblem("2026-11-16", { ...until, until: "" })).toBe("Pick a day to repeat until");
    expect(repeatProblem("2026-11-16", { ...until, until: "2026-11-01" })).toBe(
      "Repeat until a day on or after the start",
    );
    expect(repeatProblem("2026-11-16", { ...until, until: "2026-11-20" })).toBeNull();
  });
});

describe("a weekly session", () => {
  it("is a series on the desktop's terms: one template, its weeks, each slot recorded", async () => {
    const course = await createCourse(db, space, "Algorithms");
    const ids = await createSessionSeries(
      db,
      space,
      {
        title: "Lecture",
        courseId: course,
        date: "2026-11-18",
        startTime: "10:00",
        endTime: "11:30",
        location: "Room 5",
      },
      { ...DEFAULT_REPEAT, cadence: "weekly", durationCount: 3, durationUnit: "weeks" },
    );
    expect(ids).toHaveLength(3);
    const [template] = await rows(
      db,
      "SELECT t.entity_id, t.weekday, t.anchor_date, t.location, e.type, e.key_prefix FROM session_templates t JOIN entities e ON e.id = t.entity_id",
    );
    // Wednesday, counted from Monday as 0.
    expect(template).toMatchObject({
      weekday: 2,
      anchor_date: "2026-11-18",
      location: "Room 5",
      type: "session_template",
      key_prefix: "SES",
    });
    const sessions = await listSessions(db, { spaceId: space });
    expect(sessions.map((s) => [s.date, s.templateId, s.courseId])).toEqual([
      ["2026-11-18", template.entity_id, course],
      ["2026-11-25", template.entity_id, course],
      ["2026-12-02", template.entity_id, course],
    ]);
    const slots = await rows(db, "SELECT slot_date FROM series_slots ORDER BY slot_date");
    expect(slots.map((s) => s.slot_date)).toEqual(["2026-11-18", "2026-11-25", "2026-12-02"]);
    const [link] = await rows(
      db,
      "SELECT to_entity_id FROM relationships WHERE from_entity_id = ? AND relationship_type = 'session-course'",
      template.entity_id,
    );
    expect(link.to_entity_id).toBe(course);
  });

  // The desktop makes daily and monthly sessions as single sessions, not a series.
  it("is single sessions when it repeats daily", async () => {
    const course = await createCourse(db, space, "Algorithms");
    await createSessionSeries(
      db,
      space,
      {
        title: "Lab",
        courseId: course,
        date: "2026-11-18",
        startTime: "10:00",
        endTime: "11:00",
        location: null,
      },
      { ...DEFAULT_REPEAT, cadence: "daily", durationCount: 2, durationUnit: "days" },
    );
    const sessions = await listSessions(db, { spaceId: space });
    expect(sessions.map((s) => [s.date, s.templateId])).toEqual([
      ["2026-11-18", null],
      ["2026-11-19", null],
    ]);
    expect(await rows(db, "SELECT 1 FROM session_templates")).toEqual([]);
  });
});

describe("a repeating calendar entry", () => {
  it("is a template with its occurrences", async () => {
    await createCalendarEntrySeries(
      db,
      space,
      {
        title: "Gym",
        date: "2026-11-16",
        startTime: "18:00",
        endTime: "19:00",
        allDay: false,
        location: null,
        description: "Legs",
      },
      { ...DEFAULT_REPEAT, cadence: "monthly", durationCount: 2, durationUnit: "months" },
    );
    const [template] = await rows(
      db,
      "SELECT t.entity_id, t.recurrence, t.anchor_date, t.description FROM calendar_entry_templates t",
    );
    expect(template).toMatchObject({
      recurrence: "monthly",
      anchor_date: "2026-11-16",
      description: "Legs",
    });
    const items = (await agenda(db, "2026-11-01", "2027-01-31")).filter(
      (i) => i.kind === "calendar_entry",
    );
    expect(items.map((i) => [i.date, i.title, i.description])).toEqual([
      ["2026-11-16", "Gym", "Legs"],
      ["2026-12-16", "Gym", "Legs"],
    ]);
    expect(await rows(db, "SELECT slot_date FROM series_slots ORDER BY slot_date")).toEqual([
      { slot_date: "2026-11-16" },
      { slot_date: "2026-12-16" },
    ]);
  });

  // An entry over several days never repeats, as on the desktop.
  it("over several days is one entry", async () => {
    await createCalendarEntrySeries(
      db,
      space,
      {
        title: "Trip",
        date: "2026-11-16",
        endDate: "2026-11-18",
        startTime: null,
        endTime: null,
        allDay: true,
        location: null,
      },
      { ...DEFAULT_REPEAT, cadence: "weekly" },
    );
    expect(await rows(db, "SELECT 1 FROM calendar_entry_templates")).toEqual([]);
    expect(await rows(db, "SELECT date, end_date FROM calendar_entries")).toEqual([
      { date: "2026-11-16", end_date: "2026-11-18" },
    ]);
  });
});
