import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
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
const tasksIn = (spaceId: string): View => ({ kind: "module", spaceId, module: "tasks" });

afterEach(() => {
  vi.useRealTimers();
});

describe("nav store, launching", () => {
  it("opens one Dashboard tab without saved tabs", async () => {
    const { store } = await loadNav();
    const state = store.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.view).toEqual(dashboard);
    expect(state.activeTabId).toBe(state.tabs[0].id);
    expect(state.backStack).toEqual([]);
  });

  it.each([
    ["corrupt JSON", "{oops"],
    ["an empty string", ""],
    ["JSON null", "null"],
    ["no tabs", JSON.stringify({ activeTabId: "a", tabs: [] })],
    [
      "an unknown view kind",
      JSON.stringify({
        activeTabId: "a",
        tabs: [
          { id: "a", view: { kind: "graph" }, backStack: [], forwardStack: [], pinned: false },
        ],
      }),
    ],
    [
      "an active tab that doesn't exist",
      JSON.stringify({
        activeTabId: "missing",
        tabs: [{ id: "a", view: pinned, backStack: [], forwardStack: [], pinned: false }],
      }),
    ],
    [
      "a module that no longer exists",
      JSON.stringify({
        activeTabId: "a",
        tabs: [
          {
            id: "a",
            view: { kind: "module", spaceId: "s", module: "graphs" },
            backStack: [],
            forwardStack: [],
            pinned: false,
          },
        ],
      }),
    ],
  ])("falls back to one Dashboard tab for %s", async (_, raw) => {
    const { store } = await loadNav({ [STORAGE_KEYS.tabs]: raw });
    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().view).toEqual(dashboard);
  });

  it("restores saved tabs with their history", async () => {
    const saved = {
      activeTabId: "b",
      tabs: [
        { id: "a", view: pinned, backStack: [], forwardStack: [], pinned: true },
        {
          id: "b",
          view: tasksIn("s1"),
          backStack: [dashboard],
          forwardStack: [pinned],
          pinned: false,
        },
      ],
    };
    const { store } = await loadNav({ [STORAGE_KEYS.tabs]: JSON.stringify(saved) });
    const state = store.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["a", "b"]);
    expect(state.activeTabId).toBe("b");
    expect(state.view).toEqual(tasksIn("s1"));
    expect(state.backStack).toEqual([dashboard]);
    expect(state.forwardStack).toEqual([pinned]);
  });

  it("starts without recents when they can't be read", async () => {
    const { store } = await loadNav({ [STORAGE_KEYS.recents]: "[broken" });
    expect(store.getState().recents).toEqual([]);
  });

  it("restores saved recents", async () => {
    const recents = [{ entityId: "e1", spaceId: "s1", openedAt: 1 }];
    const { store } = await loadNav({ [STORAGE_KEYS.recents]: JSON.stringify(recents) });
    expect(store.getState().recents).toEqual(recents);
  });

  it("expands the last active Space when the expanded list can't be read", async () => {
    const { store } = await loadNav({
      [STORAGE_KEYS.expandedSpaces]: "not json",
      [STORAGE_KEYS.activeSpace]: "s1",
    });
    expect(store.getState().expandedSpaceIds).toEqual(["s1"]);
    expect(store.getState().activeSpaceId).toBe("s1");
  });

  it("expands the last active Space for a user from before multi expand", async () => {
    const { store } = await loadNav({ [STORAGE_KEYS.activeSpace]: "s1" });
    expect(store.getState().expandedSpaceIds).toEqual(["s1"]);
  });

  it("expands nothing on a fresh install", async () => {
    const { store } = await loadNav();
    expect(store.getState().expandedSpaceIds).toEqual([]);
    expect(store.getState().activeSpaceId).toBeNull();
  });

  it("reads the sidebar states", async () => {
    const { store } = await loadNav({
      [STORAGE_KEYS.sidebarCollapsed]: "1",
      [STORAGE_KEYS.rightSidebarCollapsed]: "0",
    });
    expect(store.getState().sidebarCollapsed).toBe(true);
    expect(store.getState().rightSidebarCollapsed).toBe(false);
  });

  it.each([
    ["missing", undefined, 320],
    ["not a number", "wide", 320],
    ["zero", "0", 320],
    ["too narrow", "100", 312],
    ["too wide", "2000", 480],
    ["in range", "400", 400],
  ])("reads a right sidebar width that is %s", async (_, raw, width) => {
    const { store } = await loadNav({ [STORAGE_KEYS.rightSidebarWidth]: raw });
    expect(store.getState().rightSidebarWidth).toBe(width);
  });
});

describe("clampRightSidebarWidth", () => {
  it("rounds and clamps", async () => {
    const { clampRightSidebarWidth } = await loadNav();
    expect(clampRightSidebarWidth(350.6)).toBe(351);
    expect(clampRightSidebarWidth(-5)).toBe(312);
    expect(clampRightSidebarWidth(10_000)).toBe(480);
  });
});

describe("nav store, history", () => {
  it("pushes the current view onto Back and clears Forward", async () => {
    const { store } = await loadNav();
    store.getState().setView(pinned);
    store.getState().goBack();
    expect(store.getState().forwardStack).toEqual([pinned]);
    store.getState().setView({ kind: "trash" });
    expect(store.getState().backStack).toEqual([dashboard]);
    expect(store.getState().forwardStack).toEqual([]);
  });

  it("leaves history alone when the view doesn't change", async () => {
    const { store } = await loadNav();
    store.getState().setView(dashboard);
    expect(store.getState().backStack).toEqual([]);
  });

  it("steps back and forward", async () => {
    const { store } = await loadNav();
    store.getState().setView(pinned);
    store.getState().setView({ kind: "trash" });
    store.getState().goBack();
    expect(store.getState().view).toEqual(pinned);
    store.getState().goBack();
    expect(store.getState().view).toEqual(dashboard);
    expect(store.getState().forwardStack).toEqual([{ kind: "trash" }, pinned]);
    store.getState().goForward();
    expect(store.getState().view).toEqual(pinned);
    expect(store.getState().backStack).toEqual([dashboard]);
  });

  it("does nothing at either end of history", async () => {
    const { store } = await loadNav();
    const before = store.getState();
    store.getState().goBack();
    store.getState().goForward();
    expect(store.getState().view).toBe(before.view);
  });

  it("keeps at most 50 steps of Back", async () => {
    const { store } = await loadNav();
    for (let i = 0; i < 60; i++) store.getState().setView(tasksIn(`s${i}`));
    const { backStack } = store.getState();
    expect(backStack).toHaveLength(50);
    expect(backStack.at(-1)).toEqual(tasksIn("s58"));
  });

  it("makes a Space's page active and expanded, and remembers both", async () => {
    const { store, preferences } = await loadNav();
    store.getState().setView(tasksIn("s1"));
    expect(store.getState().activeSpaceId).toBe("s1");
    expect(store.getState().expandedSpaceIds).toEqual(["s1"]);
    expect(preferences.get(STORAGE_KEYS.activeSpace)).toBe("s1");
    expect(preferences.get(STORAGE_KEYS.expandedSpaces)).toBe(JSON.stringify(["s1"]));
  });

  it("keeps the active Space on a page outside any Space", async () => {
    const { store } = await loadNav();
    store.getState().setView(tasksIn("s1"));
    store.getState().setView({ kind: "calendar" });
    expect(store.getState().activeSpaceId).toBe("s1");
  });

  it("doesn't expand a Space twice", async () => {
    const { store } = await loadNav();
    store.getState().setView(tasksIn("s1"));
    store.getState().setView({ kind: "entity", entityId: "e1", spaceId: "s1" });
    expect(store.getState().expandedSpaceIds).toEqual(["s1"]);
  });

  it("restores the active Space when going back", async () => {
    const { store } = await loadNav();
    store.getState().setView(tasksIn("s1"));
    store.getState().setView(tasksIn("s2"));
    store.getState().goBack();
    expect(store.getState().activeSpaceId).toBe("s1");
  });
});

describe("nav store, opening entities", () => {
  it("opens the entity, records it as recent and tells the backend", async () => {
    mockCommand("touch_entity_opened", null);
    const { store, preferences } = await loadNav();
    store.getState().openEntity("e1", "s1");
    const state = store.getState();
    expect(state.view).toEqual({ kind: "entity", entityId: "e1", spaceId: "s1" });
    expect(state.backStack).toEqual([dashboard]);
    expect(state.recents.map((r) => r.entityId)).toEqual(["e1"]);
    expect(state.activeSpaceId).toBe("s1");
    expect(preferences.get(STORAGE_KEYS.recents)).toContain('"entityId":"e1"');
    await vi.waitFor(() => expect(callsOf("touch_entity_opened")).toEqual([{ id: "e1" }]));
  });

  it("still navigates when the backend can't record the open", async () => {
    // No reply is mocked, so the touch call rejects.
    const { store } = await loadNav();
    store.getState().openEntity("e1", "s1");
    expect(store.getState().view).toEqual({ kind: "entity", entityId: "e1", spaceId: "s1" });
  });

  it("keeps the five most recent entities, newest first, without duplicates", async () => {
    const { store } = await loadNav();
    for (const id of ["a", "b", "c", "d", "e", "f", "c"]) store.getState().openEntity(id, "s1");
    expect(store.getState().recents.map((r) => r.entityId)).toEqual(["c", "f", "e", "d", "b"]);
  });

  it("remembers a block to scroll to", async () => {
    const { store } = await loadNav();
    store.getState().openEntity("e1", "s1", { entityId: "e1", blockId: "b1" });
    expect(store.getState().focusBlock).toEqual({ entityId: "e1", blockId: "b1" });
    store.getState().clearFocusBlock();
    expect(store.getState().focusBlock).toBeNull();
  });

  it("remembers a page of a file to scroll to", async () => {
    const { store } = await loadNav();
    store.getState().openEntity("f1", "s1", { entityId: "f1", page: 12 });
    expect(store.getState().focusBlock).toEqual({ entityId: "f1", page: 12 });
    expect(store.getState().view).toEqual({ kind: "entity", entityId: "f1", spaceId: "s1" });
  });

  it("opens in a background tab after a Cmd click", async () => {
    const { store, armNewTabIntent } = await loadNav();
    armNewTabIntent();
    store.getState().openEntity("e1", "s1");
    const state = store.getState();
    expect(state.view).toEqual(dashboard);
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1].view).toEqual({ kind: "entity", entityId: "e1", spaceId: "s1" });
  });

  it("only uses a Cmd click once", async () => {
    const { store, armNewTabIntent } = await loadNav();
    armNewTabIntent();
    store.getState().setView(pinned);
    store.getState().setView({ kind: "trash" });
    expect(store.getState().tabs).toHaveLength(2);
    expect(store.getState().view).toEqual({ kind: "trash" });
  });
});

describe("nav store, Bookmarks and saved Views", () => {
  it("steps back from a Bookmark's entity view and opens its sheet", async () => {
    const { store } = await loadNav();
    store.getState().setView(pinned);
    store.getState().setView({ kind: "entity", entityId: "b1", spaceId: "s1" });
    store.getState().showBookmark("b1", "s1");
    expect(store.getState().view).toEqual(pinned);
    expect(store.getState().bookmarkSheetId).toBe("b1");
  });

  it("falls back to the Bookmarks page without history", async () => {
    const { store } = await loadNav({
      [STORAGE_KEYS.tabs]: JSON.stringify({
        activeTabId: "a",
        tabs: [
          {
            id: "a",
            view: { kind: "entity", entityId: "b1", spaceId: "s1" },
            backStack: [],
            forwardStack: [],
            pinned: false,
          },
        ],
      }),
    });
    store.getState().showBookmark("b1", "s1");
    expect(store.getState().view).toEqual({ kind: "module", spaceId: "s1", module: "bookmarks" });
  });

  it("doesn't step back twice when the sheet opens again", async () => {
    const { store } = await loadNav();
    store.getState().setView(pinned);
    store.getState().setView({ kind: "entity", entityId: "b1", spaceId: "s1" });
    store.getState().showBookmark("b1", "s1");
    store.getState().showBookmark("b1", "s1");
    expect(store.getState().view).toEqual(pinned);
  });

  it("turns a saved View's entity view into its module page", async () => {
    const { store } = await loadNav();
    store.getState().setView({ kind: "entity", entityId: "v1", spaceId: "s1" });
    store.getState().showSavedView("v1", "s1", "tasks");
    expect(store.getState().view).toEqual({
      kind: "module",
      spaceId: "s1",
      module: "tasks",
      viewId: "v1",
    });
  });

  it("opens an overview View on its cross Space page", async () => {
    const { store } = await loadNav();
    store.getState().setView({ kind: "entity", entityId: "v1", spaceId: "s1" });
    store.getState().showSavedView("v1", "s1", "tasks-overview");
    expect(store.getState().view).toEqual({ kind: "tasks", viewId: "v1" });
  });

  it("leaves a view navigated to since alone", async () => {
    const { store } = await loadNav();
    store.getState().setView(pinned);
    store.getState().showSavedView("v1", "s1", "tasks");
    expect(store.getState().view).toEqual(pinned);
  });
});

describe("nav store, tabs", () => {
  it("opens a new tab and switches to it", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab(pinned);
    const state = store.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(state.tabs[1].id);
    expect(state.view).toEqual(pinned);
    expect(state.backStack).toEqual([]);
  });

  it("opens a Dashboard tab by default", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab();
    expect(store.getState().view).toEqual(dashboard);
  });

  it("opens a background tab without leaving the current one", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab(pinned, { activate: false });
    expect(store.getState().view).toEqual(dashboard);
    expect(store.getState().tabs[1].view).toEqual(pinned);
  });

  it("keeps each tab's own history", async () => {
    const { store } = await loadNav();
    const first = store.getState().activeTabId;
    store.getState().setView(pinned);
    store.getState().openInNewTab({ kind: "trash" });
    store.getState().switchTab(first);
    expect(store.getState().view).toEqual(pinned);
    expect(store.getState().backStack).toEqual([dashboard]);
  });

  it("ignores switching to an unknown tab", async () => {
    const { store } = await loadNav();
    const before = store.getState().activeTabId;
    store.getState().switchTab("nope");
    expect(store.getState().activeTabId).toBe(before);
  });

  it("cycles through tabs and wraps around", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab(pinned);
    store.getState().openInNewTab({ kind: "trash" });
    store.getState().cycleTab(1);
    expect(store.getState().view).toEqual(dashboard);
    store.getState().cycleTab(-1);
    expect(store.getState().view).toEqual({ kind: "trash" });
  });

  it("doesn't cycle a single tab", async () => {
    const { store } = await loadNav();
    store.getState().cycleTab(1);
    expect(store.getState().tabs).toHaveLength(1);
  });

  it("shows the tab to the right after closing the active one", async () => {
    const { store } = await loadNav();
    const first = store.getState().activeTabId;
    store.getState().openInNewTab(pinned, { activate: false });
    store.getState().closeTab(first);
    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().view).toEqual(pinned);
  });

  it("keeps the current view when closing a background tab", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab(pinned, { activate: false });
    store.getState().closeTab(store.getState().tabs[1].id);
    expect(store.getState().view).toEqual(dashboard);
    expect(store.getState().tabs).toHaveLength(1);
  });

  it("leaves a fresh Dashboard tab when closing the last one", async () => {
    const { store } = await loadNav();
    store.getState().setView(pinned);
    const only = store.getState().activeTabId;
    store.getState().closeTab(only);
    const state = store.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).not.toBe(only);
    expect(state.view).toEqual(dashboard);
    expect(state.backStack).toEqual([]);
  });

  it("closes every other tab but the pinned ones", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab(pinned, { activate: false });
    store.getState().openInNewTab({ kind: "trash" }, { activate: false });
    store.getState().pinTab(store.getState().tabs[2].id, true);
    store.getState().closeOtherTabs();
    expect(store.getState().tabs.map((t) => t.view.kind)).toEqual(["trash", "dashboard"]);
  });

  it("moves pinned tabs to the front", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab(pinned, { activate: false });
    store.getState().pinTab(store.getState().tabs[1].id, true);
    expect(store.getState().tabs.map((t) => [t.view.kind, t.pinned])).toEqual([
      ["pinned", true],
      ["dashboard", false],
    ]);
  });

  it("reorders tabs", async () => {
    const { store } = await loadNav();
    store.getState().openInNewTab(pinned, { activate: false });
    store.getState().openInNewTab({ kind: "trash" }, { activate: false });
    store.getState().reorderTab(store.getState().tabs[2].id, 0);
    expect(store.getState().tabs.map((t) => t.view.kind)).toEqual(["trash", "dashboard", "pinned"]);
  });

  it("saves the tabs shortly after they change", async () => {
    vi.useFakeTimers();
    const { store, preferences } = await loadNav();
    store.getState().setView(pinned);
    expect(preferences.get(STORAGE_KEYS.tabs)).toBeNull();
    vi.advanceTimersByTime(300);
    const saved = JSON.parse(preferences.get(STORAGE_KEYS.tabs) ?? "null");
    expect(saved.activeTabId).toBe(store.getState().activeTabId);
    expect(saved.tabs[0].view).toEqual(pinned);
    expect(saved.tabs[0].backStack).toEqual([dashboard]);
  });

  it("round trips saved tabs through a restart", async () => {
    vi.useFakeTimers();
    const first = await loadNav();
    first.store.getState().setView(tasksIn("s1"));
    first.store.getState().openInNewTab(pinned);
    vi.advanceTimersByTime(300);
    const raw = first.preferences.get(STORAGE_KEYS.tabs) ?? "";
    const second = await loadNav({ [STORAGE_KEYS.tabs]: raw });
    expect(second.store.getState().tabs.map((t) => t.view)).toEqual([tasksIn("s1"), pinned]);
    expect(second.store.getState().view).toEqual(pinned);
  });
});

describe("nav store, overlays and sidebars", () => {
  it("closes the other overlays and the Bookmark sheet when one opens", async () => {
    const { store } = await loadNav();
    store.getState().setSwitcherOpen(true);
    store.getState().setBookmarkSheetId("b1");
    store.getState().setPaletteOpen(true);
    const state = store.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.switcherOpen).toBe(false);
    expect(state.bookmarkSheetId).toBeNull();
  });

  it("never closes the quick jot when another overlay opens", async () => {
    const { store } = await loadNav();
    store.getState().setQuickJotOpen(true);
    store.getState().setCommandsOpen(true);
    expect(store.getState().quickJotOpen).toBe(true);
    expect(store.getState().commandsOpen).toBe(true);
  });

  it("binds the quick jot to a session and forgets it on close or a plain open", async () => {
    const { store } = await loadNav();
    store.getState().openQuickJotForSession("session-1");
    expect(store.getState().quickJotOpen).toBe(true);
    expect(store.getState().quickJotSessionId).toBe("session-1");
    store.getState().setQuickJotOpen(false);
    expect(store.getState().quickJotSessionId).toBeNull();
    store.getState().openQuickJotForSession("session-1");
    store.getState().setQuickJotOpen(true);
    expect(store.getState().quickJotSessionId).toBeNull();
  });

  it("closes only the overlay asked to close", async () => {
    const { store } = await loadNav();
    store.getState().setSwitcherOpen(true);
    store.getState().setPaletteOpen(false);
    expect(store.getState().switcherOpen).toBe(true);
  });

  it("toggles and remembers expanded Spaces", async () => {
    const { store, preferences } = await loadNav();
    store.getState().toggleExpandedSpace("s1");
    store.getState().toggleExpandedSpace("s2");
    store.getState().toggleExpandedSpace("s1");
    expect(store.getState().expandedSpaceIds).toEqual(["s2"]);
    expect(preferences.get(STORAGE_KEYS.expandedSpaces)).toBe(JSON.stringify(["s2"]));
  });

  it("forgets the active Space when cleared", async () => {
    const { store, preferences } = await loadNav({ [STORAGE_KEYS.activeSpace]: "s1" });
    store.getState().setActiveSpace(null);
    expect(preferences.get(STORAGE_KEYS.activeSpace)).toBeNull();
  });

  it("remembers the sidebar states and a clamped width", async () => {
    const { store, preferences } = await loadNav();
    store.getState().setSidebarCollapsed(true);
    store.getState().setRightSidebarCollapsed(true);
    store.getState().setRightSidebarWidth(9999);
    expect(preferences.get(STORAGE_KEYS.sidebarCollapsed)).toBe("1");
    expect(preferences.get(STORAGE_KEYS.rightSidebarCollapsed)).toBe("1");
    expect(store.getState().rightSidebarWidth).toBe(480);
    expect(preferences.get(STORAGE_KEYS.rightSidebarWidth)).toBe("480");
  });
});
