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
});
