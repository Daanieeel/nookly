import {
  AGE_OPTIONS,
  ENTITY_FILTERS_NONE,
  ageBucket,
  passesEntityFilters,
} from "./entity-filters.tsx";

// A Wednesday; weeks start on Monday.
const now = new Date(2026, 10, 18, 12);
const at = (d: number, h = 9) => new Date(2026, 10, d, h).toISOString();

describe("the filters every item has (D73)", () => {
  it("splits time as the desktop's Created and Updated do", () => {
    expect(AGE_OPTIONS.map((o) => o.label)).toEqual(["Today", "This week", "Last week", "Earlier"]);
    expect(ageBucket(at(18), 1, now)).toBe("today");
    expect(ageBucket(at(16), 1, now)).toBe("week");
    expect(ageBucket(at(15), 1, now)).toBe("last");
    // With weeks starting on Sunday, the Sunday before is this week.
    expect(ageBucket(at(15), 0, now)).toBe("week");
    expect(ageBucket(at(8), 1, now)).toBe("earlier");
  });

  it("keeps an item that passes every field picked, and everything when none is", () => {
    const item = { pinned: true, createdAt: at(2), updatedAt: at(18) };
    expect(passesEntityFilters(item, ENTITY_FILTERS_NONE, 1, now)).toBe(true);
    expect(passesEntityFilters(item, { ...ENTITY_FILTERS_NONE, pinned: ["pinned"] }, 1, now)).toBe(
      true,
    );
    expect(
      passesEntityFilters(item, { ...ENTITY_FILTERS_NONE, pinned: ["unpinned"] }, 1, now),
    ).toBe(false);
    expect(
      passesEntityFilters(item, { pinned: [], created: ["earlier"], updated: ["today"] }, 1, now),
    ).toBe(true);
    expect(passesEntityFilters(item, { ...ENTITY_FILTERS_NONE, created: ["week"] }, 1, now)).toBe(
      false,
    );
  });
});
