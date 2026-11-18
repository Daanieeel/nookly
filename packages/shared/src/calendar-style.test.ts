import { describe, expect, it } from "vitest";
import { allDayChipLook, blockLook, itemAccent, todayLook, withAlpha } from "./calendar-style.ts";

describe("tints", () => {
  it("writes a hex color with an opacity", () => {
    expect(withAlpha("#3b82f6", 0.3)).toBe("#3b82f64d");
    expect(withAlpha("#3b82f6", 1)).toBe("#3b82f6ff");
    expect(withAlpha("#3b82f6", 0)).toBe("#3b82f600");
    expect(withAlpha("#abc", 0.5)).toBe("#aabbcc80");
  });

  it("leaves a color that is not a plain hex as it is", () => {
    expect(withAlpha("rgb(1, 2, 3)", 0.5)).toBe("rgb(1, 2, 3)");
  });
});

describe("which color an item carries", () => {
  it("is its Space's, else the kind's own", () => {
    expect(itemAccent("session", "#22c55e")).toEqual({ color: "#22c55e" });
    expect(itemAccent("session", undefined)).toEqual({ token: "primary" });
    expect(itemAccent("calendar_entry", undefined)).toEqual({ token: "accent-purple" });
    expect(itemAccent("study_block", undefined)).toEqual({ token: "accent-purple" });
    expect(itemAccent("exam", undefined)).toEqual({ token: "destructive" });
  });
});

describe("how an item looks on the hours", () => {
  it("draws a session as an outline with a faint tint", () => {
    expect(blockLook("session")).toEqual({
      borderWidth: 2,
      borderAlpha: 1,
      leftBar: 0,
      fillAlpha: 0.06,
    });
  });

  it("draws a calendar entry, a study block and an exam with a bar on the left and a stronger tint", () => {
    expect(blockLook("calendar_entry")).toEqual({
      borderWidth: 1,
      borderAlpha: 0.6,
      leftBar: 4,
      fillAlpha: 0.3,
    });
    expect(blockLook("study_block")).toEqual(blockLook("calendar_entry"));
    expect(blockLook("exam")).toEqual({
      borderWidth: 1,
      borderAlpha: 0.6,
      leftBar: 4,
      fillAlpha: 0.2,
    });
  });

  it("draws one on the all day strip as a bar with a tint, a session as its outline", () => {
    expect(allDayChipLook("calendar_entry")).toEqual({
      borderWidth: 0,
      borderAlpha: 1,
      leftBar: 4,
      fillAlpha: 0.25,
    });
    expect(allDayChipLook("exam")).toEqual(allDayChipLook("calendar_entry"));
    expect(allDayChipLook("session")).toEqual({
      borderWidth: 2,
      borderAlpha: 1,
      leftBar: 0,
      fillAlpha: 0.06,
    });
  });
});

describe("how today is marked", () => {
  it("tints today's column by the color and intensity chosen", () => {
    expect(todayLook("primary", "default")).toMatchObject({ base: "primary", columnAlpha: 0.05 });
    expect(todayLook("primary", "low").columnAlpha).toBe(0.03);
    expect(todayLook("primary", "high").columnAlpha).toBe(0.15);
    expect(todayLook("neutral", "default")).toMatchObject({
      base: "foreground",
      columnAlpha: 0.06,
    });
    expect(todayLook("neutral", "high").columnAlpha).toBe(0.14);
  });
});
