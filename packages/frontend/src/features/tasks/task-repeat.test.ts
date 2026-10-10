import { describe, expect, it } from "vitest";
import { MAX_REPEAT_EVERY, REPEAT_PRESETS, repeatLabel, sameRepeat } from "./task-repeat.ts";

describe("repeatLabel", () => {
  it.each([
    [{ every: 1, unit: "day" }, "Daily"],
    [{ every: 1, unit: "week" }, "Weekly"],
    [{ every: 1, unit: "month" }, "Monthly"],
    [{ every: 3, unit: "day" }, "Every 3 days"],
    [{ every: 2, unit: "week" }, "Every 2 weeks"],
    [{ every: 6, unit: "month" }, "Every 6 months"],
  ] as const)("names %j %s", (rule, label) => {
    expect(repeatLabel(rule)).toBe(label);
  });
});

describe("sameRepeat", () => {
  it("compares the rule, not the object", () => {
    expect(sameRepeat({ every: 1, unit: "day" }, { every: 1, unit: "day" })).toBe(true);
    expect(sameRepeat({ every: 1, unit: "day" }, { every: 2, unit: "day" })).toBe(false);
    expect(sameRepeat({ every: 1, unit: "day" }, { every: 1, unit: "week" })).toBe(false);
    expect(sameRepeat(null, null)).toBe(true);
    expect(sameRepeat(null, { every: 1, unit: "day" })).toBe(false);
  });
});

describe("the presets", () => {
  it("are daily, weekly and monthly", () => {
    expect(REPEAT_PRESETS.map((p) => p.label)).toEqual(["Daily", "Weekly", "Monthly"]);
    expect(REPEAT_PRESETS.map((p) => repeatLabel(p.rule))).toEqual(["Daily", "Weekly", "Monthly"]);
  });

  it("stay within what the backend accepts", () => {
    expect(MAX_REPEAT_EVERY).toBe(365);
  });
});
