import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relativeDue } from "./due-columns";

describe("relativeDue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 10));
  });
  afterEach(() => vi.useRealTimers());

  it("calls an open item past its date overdue, in red", () => {
    expect(relativeDue("2026-10-09", false)).toEqual({
      text: "3d overdue",
      tone: "text-destructive",
    });
  });

  // Reported (#132): finished work was late by no one, so it never reads as overdue.
  it("reads a finished item past its date as a plain relative date, with no tone", () => {
    expect(relativeDue("2026-10-09", true)).toEqual({ text: "3 days ago", tone: null });
    expect(relativeDue("2026-10-11", true)).toEqual({ text: "Yesterday", tone: null });
  });

  it("reads the days ahead the same for open and finished items", () => {
    expect(relativeDue("2026-10-13", false)).toEqual({ text: "Tomorrow", tone: null });
    expect(relativeDue("2026-10-13", true)).toEqual({ text: "Tomorrow", tone: null });
    expect(relativeDue("2026-10-15", true)).toEqual({ text: "in 3 days", tone: null });
  });
});
