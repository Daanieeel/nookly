import { describe, expect, it } from "vitest";
import { findCurrentSession, findNextSession, hasStarted } from "./next-session.ts";

function s(date: string, startTime: string, cancelled = false) {
  return { date, startTime, cancelled };
}

// Local time, so the helper must not parse the date as UTC.
const now = new Date(2026, 3, 6, 10, 30);

describe("hasStarted", () => {
  it("is true for earlier days and earlier or equal times today", () => {
    expect(hasStarted(s("2026-04-05", "23:00"), now)).toBe(true);
    expect(hasStarted(s("2026-04-06", "10:00"), now)).toBe(true);
    expect(hasStarted(s("2026-04-06", "10:30"), now)).toBe(true);
  });
  it("is false for later today and later days", () => {
    expect(hasStarted(s("2026-04-06", "10:31"), now)).toBe(false);
    expect(hasStarted(s("2026-04-07", "00:00"), now)).toBe(false);
  });
});

describe("findNextSession", () => {
  it("skips a session today that already started or finished", () => {
    const next = findNextSession(
      [s("2026-04-06", "08:00"), s("2026-04-06", "10:30"), s("2026-04-08", "09:00")],
      now,
    );
    expect(next?.date).toBe("2026-04-08");
  });
  it("picks a later session today", () => {
    const next = findNextSession([s("2026-04-08", "09:00"), s("2026-04-06", "14:00")], now);
    expect(next).toEqual(s("2026-04-06", "14:00"));
  });
  it("skips cancelled sessions and returns undefined when none remain", () => {
    expect(findNextSession([s("2026-04-06", "14:00", true)], now)).toBeUndefined();
    expect(findNextSession([], now)).toBeUndefined();
  });
});

describe("findCurrentSession", () => {
  const run = (date: string, startTime: string, endTime: string, cancelled = false) => ({
    date,
    startTime,
    endTime,
    cancelled,
  });
  it("finds the session that is running now", () => {
    const current = run("2026-04-06", "10:00", "11:00");
    expect(findCurrentSession([run("2026-04-06", "08:00", "09:00"), current], now)).toBe(current);
  });
  it("ignores ended, upcoming, other day and cancelled sessions", () => {
    expect(
      findCurrentSession(
        [
          run("2026-04-06", "09:00", "10:30"),
          run("2026-04-06", "10:31", "12:00"),
          run("2026-04-07", "10:00", "11:00"),
          run("2026-04-06", "10:00", "11:00", true),
        ],
        now,
      ),
    ).toBeUndefined();
  });
});
