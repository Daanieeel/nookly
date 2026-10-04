import { format } from "date-fns";
import { describe, expect, it } from "vitest";
import type { Repeat } from "#/components/repeat-chip.tsx";
import { DEFAULT_REPEAT, MAX_OCCURRENCES, repeatDates } from "./repeat.ts";

const day = (d: Date) => format(d, "yyyy-MM-dd");
const days = (start: string, repeat: Partial<Repeat>) =>
  repeatDates(new Date(`${start}T00:00:00`), { ...DEFAULT_REPEAT, ...repeat }).map(day);

describe("repeatDates", () => {
  it("returns only the start for a single item", () => {
    expect(days("2026-03-01", { cadence: "none" })).toEqual(["2026-03-01"]);
  });

  it("ignores the duration when it doesn't repeat", () => {
    expect(
      days("2026-03-01", { cadence: "none", durationCount: 50, durationUnit: "years" }),
    ).toEqual(["2026-03-01"]);
  });

  it("defaults to not repeating, for 16 weeks once it does", () => {
    expect(DEFAULT_REPEAT).toEqual({ cadence: "none", durationCount: 16, durationUnit: "weeks" });
  });

  it("repeats daily up to but not including the end", () => {
    expect(
      days("2026-03-01", { cadence: "daily", durationCount: 1, durationUnit: "weeks" }),
    ).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
    ]);
  });

  it("counts a duration in days", () => {
    expect(
      days("2026-03-01", { cadence: "daily", durationCount: 3, durationUnit: "days" }),
    ).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
  });

  it("repeats weekly on the same weekday", () => {
    expect(
      days("2026-03-02", { cadence: "weekly", durationCount: 4, durationUnit: "weeks" }),
    ).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"]);
  });

  it("counts a weekly series over months", () => {
    expect(
      days("2026-03-01", { cadence: "weekly", durationCount: 1, durationUnit: "months" }),
    ).toEqual(["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29"]);
  });

  it("repeats monthly on the same day of the month", () => {
    expect(
      days("2026-01-15", { cadence: "monthly", durationCount: 3, durationUnit: "months" }),
    ).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("clamps a month end to shorter months without drifting", () => {
    expect(
      days("2026-01-31", { cadence: "monthly", durationCount: 4, durationUnit: "months" }),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("lands on February 29 in a leap year", () => {
    expect(
      days("2028-01-31", { cadence: "monthly", durationCount: 2, durationUnit: "months" }),
    ).toEqual(["2028-01-31", "2028-02-29"]);
  });

  it("repeats monthly for a year", () => {
    const dates = days("2026-01-01", {
      cadence: "monthly",
      durationCount: 1,
      durationUnit: "years",
    });
    expect(dates).toHaveLength(12);
    expect(dates.at(-1)).toBe("2026-12-01");
  });

  it("repeats daily for a whole year", () => {
    expect(
      days("2026-01-01", { cadence: "daily", durationCount: 1, durationUnit: "years" }),
    ).toHaveLength(365);
  });

  it("keeps a series too short for a second step to the start only", () => {
    expect(
      days("2026-03-01", { cadence: "monthly", durationCount: 4, durationUnit: "weeks" }),
    ).toEqual(["2026-03-01"]);
  });

  it("returns nothing for a zero duration", () => {
    // The dialogs validate a duration of at least 1, so this never reaches the backend.
    expect(
      days("2026-03-01", { cadence: "daily", durationCount: 0, durationUnit: "days" }),
    ).toEqual([]);
  });

  it("stops one past the cap, so callers can tell a series is too long", () => {
    const dates = days("2026-01-01", { cadence: "daily", durationCount: 2, durationUnit: "years" });
    expect(dates).toHaveLength(MAX_OCCURRENCES + 1);
    expect(dates.length > MAX_OCCURRENCES).toBe(true);
  });

  it("allows exactly the cap", () => {
    expect(
      days("2026-01-01", { cadence: "daily", durationCount: 366, durationUnit: "days" }),
    ).toHaveLength(MAX_OCCURRENCES);
  });

  it("caps at 366 occurrences", () => {
    expect(MAX_OCCURRENCES).toBe(366);
  });
});
