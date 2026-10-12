import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dueText } from "./AssignmentsPanel";

describe("dueText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12, 10));
  });
  afterEach(() => vi.useRealTimers());

  it("always carries the date", () => {
    expect(dueText("2026-10-08")).toEqual({ text: "Overdue, Oct 8", overdue: true });
    expect(dueText("2026-10-12").text).toBe("Today, Oct 12");
    expect(dueText("2026-10-13").text).toBe("Tomorrow, Oct 13");
    expect(dueText("2026-10-16").text).toBe("Fri, Oct 16");
    expect(dueText("2026-10-30").text).toBe("Oct 30");
  });
});
