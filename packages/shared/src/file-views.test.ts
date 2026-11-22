import { describe, expect, it } from "vitest";
import { UNSORTED_VIEW, isUnsortedView, needsUnsortedView } from "./file-views";

describe("the Unsorted view Files comes with", () => {
  it("filters to files in no course and with no label", () => {
    expect(JSON.parse(UNSORTED_VIEW.config)).toEqual({
      filters: [{ fieldId: "filing", operator: "is", values: ["unsorted"] }],
      display: {},
    });
  });

  it("is added only to a Space that has none like it", () => {
    expect(needsUnsortedView([])).toBe(true);
    expect(needsUnsortedView([{ title: "Maths", config: "{}" }])).toBe(true);
    expect(needsUnsortedView([{ title: "Unsorted", config: "{}" }])).toBe(false);
    // Whatever it is called, a view of just the unsorted files counts.
    expect(needsUnsortedView([{ title: "To file", config: UNSORTED_VIEW.config }])).toBe(false);
    expect(needsUnsortedView([{ title: "Broken", config: "not json" }])).toBe(true);
  });

  it("is recognised by its config, for a count in its tab", () => {
    expect(isUnsortedView(UNSORTED_VIEW.config)).toBe(true);
    expect(isUnsortedView('{"filters":[],"display":{}}')).toBe(false);
  });
});
