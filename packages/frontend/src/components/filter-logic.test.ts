import { describe, expect, it } from "vitest";
import { type ActiveFilter, filterGroups, matchesFilters } from "./filter-menu.tsx";

const f = (fieldId: string, join?: "or"): ActiveFilter => ({
  fieldId,
  operator: "is",
  values: ["x"],
  ...(join && { join }),
});

describe("matchesFilters", () => {
  const passing =
    (...ids: string[]) =>
    (filter: ActiveFilter) =>
      ids.includes(filter.fieldId);

  it("passes without filters", () => {
    expect(matchesFilters([], passing())).toBe(true);
  });

  it("needs every filter to pass when none is joined with or", () => {
    expect(matchesFilters([f("a"), f("b")], passing("a", "b"))).toBe(true);
    expect(matchesFilters([f("a"), f("b")], passing("a"))).toBe(false);
  });

  it("passes when either filter of an or pair does", () => {
    const filters = [f("a"), f("b", "or")];
    expect(matchesFilters(filters, passing("a"))).toBe(true);
    expect(matchesFilters(filters, passing("b"))).toBe(true);
    expect(matchesFilters(filters, passing())).toBe(false);
  });

  it("keeps and between groups: (a or b) and c", () => {
    const filters = [f("a"), f("b", "or"), f("c")];
    expect(matchesFilters(filters, passing("b", "c"))).toBe(true);
    expect(matchesFilters(filters, passing("a", "b"))).toBe(false);
  });

  it("chains or: a or b or c", () => {
    const filters = [f("a"), f("b", "or"), f("c", "or")];
    expect(matchesFilters(filters, passing("c"))).toBe(true);
    expect(matchesFilters(filters, passing())).toBe(false);
  });

  it("ignores the join of the first filter", () => {
    expect(matchesFilters([f("a", "or"), f("b")], passing("b"))).toBe(false);
  });
});

describe("filterGroups", () => {
  it("collects filters linked by or", () => {
    const groups = filterGroups([f("a"), f("b", "or"), f("c"), f("d", "or"), f("e", "or")]);
    expect(groups.map((g) => g.map((x) => x.fieldId))).toEqual([
      ["a", "b"],
      ["c", "d", "e"],
    ]);
  });
});
