import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { preferences } from "#/lib/preferences.ts";
import {
  readQuickFilters,
  sameFilter,
  toggleFavorite,
  toggleQuickFilter,
  useQuickFilters,
} from "./quick-filters.ts";

const KEY = "nookly:test-quick-filters:s1";
const course = (...values: string[]): ActiveFilter => ({
  fieldId: "course",
  operator: "is",
  values,
});
const pinned: ActiveFilter = { fieldId: "pinned", operator: "is", values: ["pinned"] };

beforeEach(() => preferences.remove(KEY));

describe("sameFilter", () => {
  it("compares the field, the operator and the values, in any order", () => {
    expect(sameFilter(course("a", "b"), course("b", "a"))).toBe(true);
    expect(sameFilter(course("a"), course("b"))).toBe(false);
    expect(sameFilter(course("a"), { ...course("a"), operator: "isNot" })).toBe(false);
    expect(sameFilter(course("a"), course("a", "b"))).toBe(false);
  });
});

describe("toggleQuickFilter", () => {
  it("turns a favourite on, next to the filters that are on", () => {
    expect(toggleQuickFilter([pinned], course("a"))).toEqual([pinned, course("a")]);
  });

  it("replaces the filter on the same field, so two courses do not stack", () => {
    expect(toggleQuickFilter([course("a"), pinned], course("b"))).toEqual([course("b"), pinned]);
  });

  it("turns it off again, leaving the others", () => {
    expect(toggleQuickFilter([course("a"), pinned], course("a"))).toEqual([pinned]);
  });
});

describe("toggleFavorite", () => {
  it("adds a filter once and takes it out when toggled again", () => {
    const added = toggleFavorite([], course("a"));
    expect(added).toEqual([course("a")]);
    expect(toggleFavorite(added, course("a"))).toEqual([]);
  });
});

describe("readQuickFilters", () => {
  it("is empty when nothing, or something unreadable, is saved", () => {
    expect(readQuickFilters(KEY)).toEqual([]);
    preferences.set(KEY, "not json");
    expect(readQuickFilters(KEY)).toEqual([]);
    preferences.set(KEY, JSON.stringify([{ fieldId: "course", operator: "maybe", values: [] }]));
    expect(readQuickFilters(KEY)).toEqual([]);
  });
});

describe("useQuickFilters", () => {
  it("saves the favourites as they change, and removes the key when none are left", () => {
    const { result } = renderHook(() => useQuickFilters(KEY));
    act(() => result.current.toggle(course("a")));
    expect(result.current.favorites).toEqual([course("a")]);
    expect(JSON.parse(preferences.get(KEY) ?? "null")).toEqual([course("a")]);
    act(() => result.current.toggle(course("a")));
    expect(preferences.get(KEY)).toBeNull();
  });

  it("starts from what was saved", () => {
    preferences.set(KEY, JSON.stringify([course("a")]));
    const { result } = renderHook(() => useQuickFilters(KEY));
    expect(result.current.favorites).toEqual([course("a")]);
  });
});
