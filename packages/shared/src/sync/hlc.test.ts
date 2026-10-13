import { describe, expect, it } from "vitest";
import { HybridClock, clockWall, compareClocks, makeClock } from "./hlc.ts";

describe("clocks", () => {
  it("order by wall time, then counter, then device", () => {
    const clocks = [
      makeClock(2, 0, "a"),
      makeClock(1, 5, "b"),
      makeClock(1, 5, "a"),
      makeClock(1, 0, "z"),
    ];
    expect([...clocks].sort(compareClocks)).toEqual([
      makeClock(1, 0, "z"),
      makeClock(1, 5, "a"),
      makeClock(1, 5, "b"),
      makeClock(2, 0, "a"),
    ]);
  });

  it("sort as plain strings the same way", () => {
    const a = makeClock(999, 1, "dev");
    const b = makeClock(1000, 0, "dev");
    expect(a < b).toBe(true);
    expect(compareClocks(a, b)).toBe(-1);
  });

  it("read their wall time back", () => {
    expect(clockWall(makeClock(1791979200123, 7, "d"))).toBe(1791979200123);
  });
});

describe("the hybrid clock", () => {
  it("stamps an edit at its own time, never repeating a clock", () => {
    const clock = new HybridClock("d");
    const first = clock.stamp(100);
    const second = clock.stamp(100);
    expect(first).not.toBe(second);
    expect(compareClocks(first, second)).toBe(-1);
    expect(clockWall(first)).toBe(100);
  });

  it("keeps an edit's own date, even below the floor seen since", () => {
    const clock = new HybridClock("d");
    clock.observe(makeClock(5000, 0, "other"));
    expect(clockWall(clock.stamp(100))).toBe(100);
  });

  it("raises its floor past every clock it sees, so later edits count as later", () => {
    const clock = new HybridClock("slow");
    clock.observe(makeClock(5000, 3, "fast"));
    expect(clock.floor()).toBe(5001);
  });

  it("never lowers its floor", () => {
    const clock = new HybridClock("d", 9000);
    clock.observe(makeClock(10, 0, "x"));
    expect(clock.floor()).toBe(9000);
  });

  it("refuses a device id that would break the order", () => {
    expect(() => new HybridClock("")).toThrow();
    expect(() => new HybridClock("a-b")).toThrow();
  });
});
