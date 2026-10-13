import { beforeEach, describe, expect, it } from "vitest";
import { preferences } from "./preferences.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import { readHiddenSidebarItems, useSidebarHidden } from "./sidebar-items.ts";

beforeEach(() => {
  preferences.remove(STORAGE_KEYS.sidebarHidden);
  useSidebarHidden.setState({ hidden: [] });
});

describe("hiding the fixed sidebar entries", () => {
  it("shows everything until something is hidden", () => {
    expect(readHiddenSidebarItems()).toEqual([]);
  });

  it("hides and shows Trash again, and keeps the choice", () => {
    useSidebarHidden.getState().toggle("trash");
    expect(useSidebarHidden.getState().hidden).toEqual(["trash"]);
    expect(preferences.get(STORAGE_KEYS.sidebarHidden)).toBe('["trash"]');
    expect(readHiddenSidebarItems()).toEqual(["trash"]);
    useSidebarHidden.getState().toggle("trash");
    expect(useSidebarHidden.getState().hidden).toEqual([]);
    expect(readHiddenSidebarItems()).toEqual([]);
  });

  it("ignores ids it does not know, repeats and anything that is not a list", () => {
    preferences.set(STORAGE_KEYS.sidebarHidden, '["trash","from-the-future","trash"]');
    expect(readHiddenSidebarItems()).toEqual(["trash"]);
    preferences.set(STORAGE_KEYS.sidebarHidden, "not json");
    expect(readHiddenSidebarItems()).toEqual([]);
    preferences.set(STORAGE_KEYS.sidebarHidden, '{"trash":true}');
    expect(readHiddenSidebarItems()).toEqual([]);
  });
});
