import { afterEach, describe, expect, it, vi } from "vitest";
import { pendingFilters, requestFilters } from "./pending-filters";

describe("pending filters", () => {
  afterEach(() => vi.useRealTimers());

  it("hands a request to the page that reads it, more than once", () => {
    requestFilters("k", [{ fieldId: "due", operator: "is", values: ["today"] }]);
    expect(pendingFilters("k")).toHaveLength(1);
    expect(pendingFilters("k")).toHaveLength(1);
    expect(pendingFilters("other")).toBeUndefined();
  });

  it("lets a request go stale", () => {
    vi.useFakeTimers();
    requestFilters("k", []);
    vi.advanceTimersByTime(5000);
    expect(pendingFilters("k")).toBeUndefined();
  });
});
