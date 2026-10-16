import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import type { View } from "./nav.ts";

/// A fresh nav store, as the app builds it on launch from `stored` preferences.
async function loadNav(stored: Partial<Record<string, string>> = {}) {
  vi.resetModules();
  const { preferences } = await import("#/lib/preferences.ts");
  for (const [key, value] of Object.entries(stored)) {
    if (value !== undefined) preferences.set(key, value);
  }
  const nav = await import("./nav.ts");
  return { ...nav, preferences, store: nav.useNavStore };
}

const dashboard: View = { kind: "dashboard" };
const pinned: View = { kind: "pinned" };
const trash: View = { kind: "trash" };
const entity = (id: string): View => ({ kind: "entity", entityId: id, spaceId: "s1" });

afterEach(() => {
  vi.useRealTimers();
});

describe("split view, store", () => {
  it("starts with one group", async () => {
    const { store, tabGroups } = await loadNav();
    const groups = tabGroups(store.getState());
    expect(groups).toHaveLength(1);
    expect(groups[0].tabs).toEqual(store.getState().tabs);
    expect(store.getState().focusedGroupId).toBe(groups[0].id);
  });

  it("Split Right opens a copy of the tab, with its history, in a focused right group", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().setView(pinned);
    const leftTab = store.getState().activeTabId;
    store.getState().splitRight();
    const state = store.getState();
    const [left, right] = tabGroups(state);
    expect(left.tabs.map((t) => t.id)).toEqual([leftTab]);
    expect(right.tabs).toHaveLength(1);
    expect(right.tabs[0].id).not.toBe(leftTab);
    expect(state.focusedGroupId).toBe(right.id);
    expect(state.view).toEqual(pinned);
    expect(state.backStack).toEqual([dashboard]);
  });

  it("Split Left opens a copy of the tab in a focused left group", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().setView(pinned);
    const rightTab = store.getState().activeTabId;
    store.getState().splitLeft();
    const state = store.getState();
    const [left, right] = tabGroups(state);
    expect(right.tabs.map((t) => t.id)).toEqual([rightTab]);
    expect(left.tabs).toHaveLength(1);
    expect(left.tabs[0].id).not.toBe(rightTab);
    expect(state.focusedGroupId).toBe(left.id);
    expect(state.view).toEqual(pinned);
    expect(state.backStack).toEqual([dashboard]);
  });

  it("keeps history per group", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().splitRight();
    store.getState().setView(trash);
    const [left] = tabGroups(store.getState());
    store.getState().focusGroup(left.id);
    expect(store.getState().view).toEqual(dashboard);
    expect(store.getState().backStack).toEqual([]);
    store.getState().focusGroupAt(1);
    expect(store.getState().view).toEqual(trash);
    expect(store.getState().backStack).toEqual([dashboard]);
  });

  it("opens new tabs and Cmd clicks in the focused group", async () => {
    const { store, tabGroups, armNewTabIntent } = await loadNav();
    store.getState().splitRight();
    store.getState().openInNewTab(pinned);
    armNewTabIntent();
    store.getState().setView(trash);
    const [left, right] = tabGroups(store.getState());
    expect(left.tabs).toHaveLength(1);
    expect(right.tabs.map((t) => t.view)).toEqual([dashboard, pinned, trash]);
  });

  it("switching to a tab of the other group focuses it", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().splitRight();
    const [left] = tabGroups(store.getState());
    store.getState().switchTab(left.tabs[0].id);
    expect(store.getState().focusedGroupId).toBe(left.id);
  });

  it("closing the last tab of a group closes it", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().splitRight();
    store.getState().closeTab(store.getState().activeTabId);
    expect(tabGroups(store.getState())).toHaveLength(1);
  });

  it("moves a tab to a new right group and back", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().openInNewTab(pinned);
    const moved = store.getState().activeTabId;
    store.getState().moveTabToGroup(moved, "new-right");
    expect(tabGroups(store.getState()).map((g) => g.tabs.length)).toEqual([1, 1]);
    expect(store.getState().view).toEqual(pinned);
    const [left] = tabGroups(store.getState());
    store.getState().moveTabToGroup(moved, { groupId: left.id });
    const groups = tabGroups(store.getState());
    expect(groups).toHaveLength(1);
    expect(groups[0].tabs.map((t) => t.view)).toEqual([dashboard, pinned]);
  });

  it("aims a block to scroll to at the focused group", async () => {
    const { store } = await loadNav();
    store.getState().splitRight();
    store.getState().openEntity("e1", "s1", { entityId: "e1", blockId: "b1" });
    expect(store.getState().focusBlockGroupId).toBe(store.getState().focusedGroupId);
  });

  it("lands on the block only in the group it was opened in", async () => {
    const { store, tabGroups, focusBlockIn } = await loadNav();
    store.getState().splitRight();
    store.getState().openEntity("e1", "s1", { entityId: "e1", blockId: "b1" });
    const [left, right] = tabGroups(store.getState());
    expect(focusBlockIn(store.getState(), right.id)).toEqual({ entityId: "e1", blockId: "b1" });
    expect(focusBlockIn(store.getState(), left.id)).toBeNull();
  });

  it("turns a saved View into its page in a group that isn't focused", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().setView(entity("v1"));
    store.getState().splitRight();
    store.getState().setView(trash);
    const [left] = tabGroups(store.getState());
    store.getState().showSavedView("v1", "s1", "tasks", left.id);
    expect(tabGroups(store.getState())[0].tabs[0].view).toMatchObject({ module: "tasks" });
    expect(store.getState().view).toEqual(trash);
  });

  it("steps back from a Bookmark in a group that isn't focused", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().setView(pinned);
    store.getState().setView(entity("b1"));
    store.getState().splitRight();
    const [left] = tabGroups(store.getState());
    store.getState().setView(trash);
    store.getState().showBookmark("b1", "s1", left.id);
    const [leftAfter] = tabGroups(store.getState());
    expect(leftAfter.tabs[0].view).toEqual(pinned);
    expect(store.getState().view).toEqual(trash);
    expect(store.getState().bookmarkSheetId).toBe("b1");
  });

  it("clamps and remembers the split ratio", async () => {
    const { store, preferences } = await loadNav({ [STORAGE_KEYS.splitRatio]: "0.95" });
    expect(store.getState().splitRatio).toBe(0.8);
    store.getState().setSplitRatio(0.3);
    expect(preferences.get(STORAGE_KEYS.splitRatio)).toBe("0.3");
  });

  it("starts at an even split without a saved ratio", async () => {
    const { store } = await loadNav({ [STORAGE_KEYS.splitRatio]: "wide" });
    expect(store.getState().splitRatio).toBe(0.5);
  });
});

describe("split view, restart", () => {
  it("round trips both groups, the focus and every history", async () => {
    vi.useFakeTimers();
    const first = await loadNav();
    first.store.getState().setView(pinned);
    first.store.getState().splitRight();
    first.store.getState().setView(trash);
    first.store.getState().openInNewTab(entity("e1"));
    first.store.getState().focusGroupAt(0);
    vi.advanceTimersByTime(300);
    const raw = first.preferences.get(STORAGE_KEYS.tabs) ?? "";
    const second = await loadNav({ [STORAGE_KEYS.tabs]: raw });
    const state = second.store.getState();
    const [left, right] = second.tabGroups(state);
    expect(left.tabs.map((t) => t.view)).toEqual([pinned]);
    expect(right.tabs.map((t) => t.view)).toEqual([trash, entity("e1")]);
    expect(right.tabs[0].backStack).toEqual([dashboard, pinned]);
    expect(state.focusedGroupId).toBe(left.id);
    expect(state.view).toEqual(pinned);
  });

  it("writes every tab in the shape the previous release reads", async () => {
    vi.useFakeTimers();
    const { store, preferences } = await loadNav();
    store.getState().splitRight();
    store.getState().setView(trash);
    vi.advanceTimersByTime(300);
    const saved = JSON.parse(preferences.get(STORAGE_KEYS.tabs) ?? "null");
    expect(saved.tabs.map((t: { view: View }) => t.view)).toEqual([dashboard, trash]);
    expect(saved.tabs.some((t: { id: string }) => t.id === saved.activeTabId)).toBe(true);
  });

  it("loads tabs saved by the previous release into one group, with nothing lost", async () => {
    const saved = {
      activeTabId: "b",
      tabs: [
        { id: "a", view: pinned, backStack: [], forwardStack: [], pinned: true },
        { id: "b", view: trash, backStack: [dashboard], forwardStack: [pinned], pinned: false },
      ],
    };
    const { store, tabGroups } = await loadNav({ [STORAGE_KEYS.tabs]: JSON.stringify(saved) });
    const groups = tabGroups(store.getState());
    expect(groups).toHaveLength(1);
    expect(groups[0].tabs).toEqual(saved.tabs);
    expect(store.getState().view).toEqual(trash);
    expect(store.getState().forwardStack).toEqual([pinned]);
  });

  it("keeps tabs opened in an older release that knew no groups", async () => {
    const saved = {
      activeTabId: "c",
      tabs: [
        { id: "a", view: pinned, backStack: [], forwardStack: [], pinned: false },
        { id: "b", view: trash, backStack: [], forwardStack: [], pinned: false },
        { id: "c", view: entity("e1"), backStack: [], forwardStack: [], pinned: false },
      ],
      focusedGroupId: "R",
      groups: [
        { id: "L", tabIds: ["a"], activeTabId: "a" },
        { id: "R", tabIds: ["b", "gone"], activeTabId: "gone" },
      ],
    };
    const { store, tabGroups } = await loadNav({ [STORAGE_KEYS.tabs]: JSON.stringify(saved) });
    const [left, right] = tabGroups(store.getState());
    expect(left.tabs.map((t) => t.id)).toEqual(["a"]);
    expect(right.tabs.map((t) => t.id)).toEqual(["b", "c"]);
    expect(store.getState().focusedGroupId).toBe("R");
    expect(store.getState().view).toEqual(entity("e1"));
  });

  it("drops a saved group whose tabs are all gone", async () => {
    const saved = {
      activeTabId: "a",
      tabs: [{ id: "a", view: pinned, backStack: [], forwardStack: [], pinned: false }],
      focusedGroupId: "R",
      groups: [
        { id: "L", tabIds: ["a"], activeTabId: "a" },
        { id: "R", tabIds: ["gone"], activeTabId: "gone" },
      ],
    };
    const { store, tabGroups } = await loadNav({ [STORAGE_KEYS.tabs]: JSON.stringify(saved) });
    expect(tabGroups(store.getState()).map((g) => g.id)).toEqual(["L"]);
    expect(store.getState().focusedGroupId).toBe("L");
    expect(store.getState().view).toEqual(pinned);
  });
});

describe("split view, details sidebar", () => {
  it("collapses the details sidebar of the focused group only", async () => {
    const { store, tabGroups, rightSidebarCollapsedIn } = await loadNav();
    store.getState().splitRight();
    const [left, right] = tabGroups(store.getState());
    store.getState().setRightSidebarCollapsed(true);
    expect(rightSidebarCollapsedIn(store.getState(), right.id)).toBe(true);
    expect(rightSidebarCollapsedIn(store.getState(), left.id)).toBe(false);
  });

  it("expands one group's details sidebar while the other stays collapsed", async () => {
    const { store, tabGroups, rightSidebarCollapsedIn } = await loadNav({
      [STORAGE_KEYS.rightSidebarCollapsed]: "1",
    });
    store.getState().splitRight();
    const [left, right] = tabGroups(store.getState());
    store.getState().setRightSidebarCollapsed(false, left.id);
    expect(rightSidebarCollapsedIn(store.getState(), left.id)).toBe(false);
    expect(rightSidebarCollapsedIn(store.getState(), right.id)).toBe(true);
  });

  it("remembers the choice for next launch only while not split", async () => {
    const { store, preferences } = await loadNav();
    store.getState().splitRight();
    store.getState().setRightSidebarCollapsed(true);
    expect(preferences.get(STORAGE_KEYS.rightSidebarCollapsed)).toBeNull();
  });
});

describe("split view, zoom", () => {
  it("does nothing with one group", async () => {
    const { store } = await loadNav();
    store.getState().toggleGroupZoom();
    expect(store.getState().groupZoomed).toBe(false);
  });

  it("toggles between zoomed and both groups", async () => {
    const { store } = await loadNav();
    store.getState().splitRight();
    store.getState().toggleGroupZoom();
    expect(store.getState().groupZoomed).toBe(true);
    store.getState().toggleGroupZoom();
    expect(store.getState().groupZoomed).toBe(false);
  });

  it("stays zoomed when focus moves to the other group", async () => {
    const { store } = await loadNav();
    store.getState().splitRight();
    store.getState().toggleGroupZoom();
    store.getState().focusGroupAt(0);
    expect(store.getState().groupZoomed).toBe(true);
  });

  it("ends when the other group closes, so a later split shows both groups", async () => {
    const { store, tabGroups } = await loadNav();
    store.getState().splitRight();
    store.getState().toggleGroupZoom();
    store.getState().closeTab(tabGroups(store.getState())[1].tabs[0].id);
    expect(tabGroups(store.getState())).toHaveLength(1);
    expect(store.getState().groupZoomed).toBe(false);
    store.getState().splitRight();
    expect(store.getState().groupZoomed).toBe(false);
  });

  it("ends when a tab is split or moved, so the result is visible", async () => {
    const { store } = await loadNav();
    store.getState().splitRight();
    store.getState().toggleGroupZoom();
    store.getState().splitLeft();
    expect(store.getState().groupZoomed).toBe(false);
  });
});
