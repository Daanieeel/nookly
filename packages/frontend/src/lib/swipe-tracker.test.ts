import { describe, expect, it } from "vitest";
import { createSwipeTracker } from "./swipe-tracker.ts";

describe("swipe tracker", () => {
  it("steps forward once a swipe to the left has travelled far enough", () => {
    const track = createSwipeTracker();
    expect(track(30, 0, 0)).toBe(0);
    expect(track(30, 0, 10)).toBe(0);
    expect(track(30, 0, 20)).toBe(1);
  });

  it("steps back for a swipe to the right", () => {
    const track = createSwipeTracker();
    expect(track(-90, 0, 0)).toBe(-1);
  });

  it("ignores a mostly vertical scroll, and forgets what it gathered", () => {
    const track = createSwipeTracker();
    expect(track(40, 0, 0)).toBe(0);
    expect(track(5, 60, 10)).toBe(0);
    expect(track(40, 0, 20)).toBe(0);
  });

  it("does not repeat while the trackpad keeps gliding, but does after it settled", () => {
    const track = createSwipeTracker();
    expect(track(90, 0, 0)).toBe(1);
    expect(track(90, 0, 50)).toBe(0);
    expect(track(90, 0, 300)).toBe(0);
    expect(track(90, 0, 1000)).toBe(1);
  });

  it("forgets a swipe that paused halfway", () => {
    const track = createSwipeTracker();
    expect(track(50, 0, 0)).toBe(0);
    expect(track(50, 0, 1000)).toBe(0);
  });
});
