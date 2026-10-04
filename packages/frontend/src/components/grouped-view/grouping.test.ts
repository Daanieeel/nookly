import { describe, expect, it } from "vitest";
import { type GroupDef, buildGroups, isCollapsed, toggleId } from "./grouping.ts";
import { buildVisibleGroups } from "./visible-groups.ts";

const even: GroupDef<number> = { id: "even", name: "Even", match: (n) => n % 2 === 0 };
const odd: GroupDef<number> = { id: "odd", name: "Odd", match: (n) => n % 2 === 1 };
const big: GroupDef<number> = { id: "big", name: "Big", match: (n) => n >= 3 };
const small: GroupDef<number> = { id: "small", name: "Small", match: (n) => n < 3 };
const never: GroupDef<number> = {
  id: "never",
  name: "Never",
  match: () => false,
  defaultCollapsed: true,
};

describe("buildGroups", () => {
  it("splits items by the groups, keeping their order", () => {
    const groups = buildGroups([4, 1, 2, 3], [even, odd], null);
    expect(groups.map((g) => [g.id, g.items])).toEqual([
      ["even", [4, 2]],
      ["odd", [1, 3]],
    ]);
    expect(groups[0].subgroups).toBeNull();
  });

  it("puts an item matching several groups in each", () => {
    const groups = buildGroups([4], [even, big], null);
    expect(groups.map((g) => g.items)).toEqual([[4], [4]]);
  });

  it("keeps empty groups and their collapsed default", () => {
    const groups = buildGroups([1], [never], null);
    expect(groups[0]).toMatchObject({ id: "never", items: [], defaultCollapsed: true });
  });

  it("splits each group again, keeping empty sub-groups so lanes line up", () => {
    const groups = buildGroups([1, 2, 3, 4], [even, odd], [small, big]);
    expect(groups.map((g) => [g.id, g.subgroups?.map((s) => [s.id, s.items])])).toEqual([
      [
        "even",
        [
          ["small", [2]],
          ["big", [4]],
        ],
      ],
      [
        "odd",
        [
          ["small", [1]],
          ["big", [3]],
        ],
      ],
    ]);
  });
});

describe("buildVisibleGroups", () => {
  it("falls back to one named group without a grouping", () => {
    const groups = buildVisibleGroups([1, 2], null, null, "All tasks", false);
    expect(groups.map((g) => [g.id, g.name, g.items])).toEqual([["all", "All tasks", [1, 2]]]);
  });

  it("hides empty groups unless asked to show them", () => {
    expect(buildVisibleGroups([1], [even, odd], null, "All", false).map((g) => g.id)).toEqual([
      "odd",
    ]);
    expect(buildVisibleGroups([1], [even, odd], null, "All", true).map((g) => g.id)).toEqual([
      "even",
      "odd",
    ]);
  });

  it("keeps the single fallback group even when empty and hidden", () => {
    expect(buildVisibleGroups([], null, null, "All", true)).toHaveLength(1);
    expect(buildVisibleGroups([], null, null, "All", false)).toHaveLength(0);
  });
});

describe("collapsed groups", () => {
  it("starts from each group's default and flips on toggle", () => {
    const none = new Set<string>();
    expect(isCollapsed(none, "a", undefined)).toBe(false);
    expect(isCollapsed(none, "done", true)).toBe(true);
    const toggled = toggleId(none, "done");
    expect(isCollapsed(toggled, "done", true)).toBe(false);
    expect(isCollapsed(toggleId(toggled, "done"), "done", true)).toBe(true);
  });

  it("never changes the set it was given", () => {
    const start = new Set(["a"]);
    const next = toggleId(start, "b");
    expect([...start]).toEqual(["a"]);
    expect([...next]).toEqual(["a", "b"]);
    expect([...toggleId(next, "a")]).toEqual(["b"]);
  });
});
