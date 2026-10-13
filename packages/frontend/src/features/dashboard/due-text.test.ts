import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dueText } from "./AssignmentsPanel";

describe("dueText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 10));
  });
  afterEach(() => vi.useRealTimers());

  it("reads relative up to 10 days out, then as a date", () => {
    expect(dueText("2026-10-08")).toEqual({ text: "Overdue, Oct 8", overdue: true });
    expect(dueText("2026-10-12").text).toBe("Today");
    expect(dueText("2026-10-13").text).toBe("Tomorrow");
    expect(dueText("2026-10-16").text).toBe("in 4 days");
    expect(dueText("2026-10-22").text).toBe("in 10 days");
    expect(dueText("2026-10-23").text).toBe("Oct 23");
  });

  // Reported (#132): a handed in assignment is not late, so it never reads as overdue.
  it("reads a finished item past its date as plain relative text, never overdue", () => {
    expect(dueText("2026-10-08", true)).toEqual({ text: "4 days ago", overdue: false });
    expect(dueText("2026-10-11", true)).toEqual({ text: "Yesterday", overdue: false });
    expect(dueText("2026-10-08", false).overdue).toBe(true);
  });

  it("reads the days ahead and today the same for a finished item", () => {
    expect(dueText("2026-10-12", true).text).toBe("Today");
    expect(dueText("2026-10-16", true).text).toBe("in 4 days");
  });
});
