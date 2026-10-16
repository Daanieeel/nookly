import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { readQuickFilters, toggleFavorite, useQuickFilters } from "./quick-filters.ts";

const KEY = "nookly:test-quick-filters:s1";

beforeEach(() => preferences.remove(KEY));

describe("toggleFavorite", () => {
  it("adds a field once and takes it out when toggled again", () => {
    const added = toggleFavorite(["pinned"], "course");
    expect(added).toEqual(["pinned", "course"]);
    expect(toggleFavorite(added, "course")).toEqual(["pinned"]);
  });
});

describe("readQuickFilters", () => {
  it("is empty when nothing, or something unreadable, is saved", () => {
    expect(readQuickFilters(KEY)).toEqual([]);
    preferences.set(KEY, "not json");
    expect(readQuickFilters(KEY)).toEqual([]);
    preferences.set(KEY, JSON.stringify([{ nope: true }, 3]));
    expect(readQuickFilters(KEY)).toEqual([]);
  });

  it("reads the fields that were saved", () => {
    preferences.set(KEY, JSON.stringify(["course", "label"]));
    expect(readQuickFilters(KEY)).toEqual(["course", "label"]);
  });

  it("keeps the field of a favourite saved as a whole filter by an earlier version", () => {
    preferences.set(
      KEY,
      JSON.stringify([
        { fieldId: "course", operator: "is", values: ["c1"] },
        { fieldId: "course", operator: "isNot", values: ["c2"] },
        { fieldId: "label", operator: "is", values: ["l1"] },
      ]),
    );
    expect(readQuickFilters(KEY)).toEqual(["course", "label"]);
  });
});

describe("useQuickFilters", () => {
  it("saves the favourites as they change, and removes the key when none are left", () => {
    const { result } = renderHook(() => useQuickFilters(KEY));
    act(() => result.current.toggle("course"));
    expect(result.current.favorites).toEqual(["course"]);
    expect(JSON.parse(preferences.get(KEY) ?? "null")).toEqual(["course"]);
    act(() => result.current.toggle("course"));
    expect(preferences.get(KEY)).toBeNull();
  });

  it("starts from what was saved", () => {
    preferences.set(KEY, JSON.stringify(["course"]));
    const { result } = renderHook(() => useQuickFilters(KEY));
    expect(result.current.favorites).toEqual(["course"]);
  });
});
