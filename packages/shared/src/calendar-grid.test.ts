import { describe, expect, it } from "vitest";
import {
  addDaysTo,
  addMonthsTo,
  automaticWeekStart,
  monthGrid,
  resolveWeekStart,
  sameMonth,
  startOfWeek,
  weekDays,
} from "./calendar-grid.ts";

describe("weeks and months", () => {
  it("starts the week where the setting says, American dates on Sunday by default", () => {
    expect(resolveWeekStart("auto", automaticWeekStart("american"))).toBe(0);
    expect(resolveWeekStart("auto", automaticWeekStart("european"))).toBe(1);
    expect(resolveWeekStart("saturday", 1)).toBe(6);
  });

  it("finds the first day and the seven days of a week", () => {
    // 2026-10-15 is a Thursday.
    expect(startOfWeek("2026-10-15", 1)).toBe("2026-10-12");
    expect(startOfWeek("2026-10-15", 0)).toBe("2026-10-11");
    expect(startOfWeek("2026-10-12", 1)).toBe("2026-10-12");
    expect(weekDays("2026-10-15", 1)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("walks across months and years", () => {
    expect(addDaysTo("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysTo("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonthsTo("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonthsTo("2026-01-31", -1)).toBe("2025-12-01");
  });

  it("lays a month in whole weeks", () => {
    const october = monthGrid("2026-10-15", 1);
    expect(october).toHaveLength(5);
    expect(october[0][0]).toBe("2026-09-28");
    expect(october.at(-1)?.[6]).toBe("2026-11-01");
    expect(october.every((week) => week.length === 7)).toBe(true);
    // February 2026 fits four rows, August needs six.
    expect(monthGrid("2026-02-10", 0)).toHaveLength(4);
    expect(monthGrid("2026-08-10", 0)).toHaveLength(6);
    expect(sameMonth("2026-10-01", "2026-10-31")).toBe(true);
    expect(sameMonth("2026-10-31", "2026-11-01")).toBe(false);
  });
});
