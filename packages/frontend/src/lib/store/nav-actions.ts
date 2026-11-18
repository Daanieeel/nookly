import { forgetScroll } from "#/hooks/use-remembered-scroll.ts";
import type { StoreApi } from "zustand";
import { viewTarget } from "#/features/views/view-target.ts";
import { touchEntityOpened } from "#/lib/api/entities.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import { type Tab, makeTab } from "./tab-model.ts";
import * as groupModel from "./tab-groups.ts";
import { type TabLayout, activeTab, clampSplitRatio, findTab, focusedGroup } from "./tab-groups.ts";
import { ignoreError } from "#/lib/log.ts";
import {
  clampRightSidebarWidth,
  writeStoredActiveSpace,
  writeStoredRecents,
} from "./nav-storage.ts";
import { layoutOf } from "./nav-selectors.ts";
import type { NavState, RecentEntry, View } from "./nav-types.ts";

const MAX_RECENTS = 5;
/// How many steps Back can go, like a browser's history.
const MAX_HISTORY = 50;

/// The active Space after showing `view`, persisting it when it changed.
function activeSpaceFor(state: Pick<NavState, "activeSpaceId">, view: View): string | null {
  const activeSpaceId = "spaceId" in view ? view.spaceId : state.activeSpaceId;
  if (activeSpaceId !== state.activeSpaceId) writeStoredActiveSpace(activeSpaceId);
  return activeSpaceId;
}

export function sameView(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/// The history change for moving from `state.view` to `next`: the current view
/// joins Back and Forward is cleared, unless nothing actually changes.
function pushHistory(
  state: Pick<NavState, "view" | "backStack" | "forwardStack">,
  next: View,
): Pick<NavState, "backStack" | "forwardStack"> {
  if (sameView(state.view, next)) {
    return { backStack: state.backStack, forwardStack: state.forwardStack };
  }
  return {
    backStack: [...state.backStack, state.view].slice(-MAX_HISTORY),
    forwardStack: [],
  };
}

/// Set by a Cmd or middle click (`useNewTabClicks`) so the navigation that click triggers
/// opens in a new tab. It clears itself right after the click has been handled.
let newTabIntent = false;
export function armNewTabIntent() {
  newTabIntent = true;
  setTimeout(() => {
    newTabIntent = false;
  }, 0);
}
function consumeNewTabIntent(): boolean {
  const armed = newTabIntent;
  newTabIntent = false;
  return armed;
}

/// What switching to `tab` changes: its view and history become the live ones.
function showTab(state: NavState, tab: Tab): Partial<NavState> {
  return {
    activeTabId: tab.id,
    view: tab.view,
    backStack: tab.backStack,
    forwardStack: tab.forwardStack,
    activeSpaceId: activeSpaceFor(state, tab.view),
    focusBlock: null,
    focusBlockGroupId: null,
  };
}

/// What showing `layout` changes: the focused group's tabs become the live ones, and
/// its active tab's view and history too when another tab is now shown.
function applyLayout(state: NavState, layout: TabLayout): Partial<NavState> {
  const group = focusedGroup(layout);
  const tab = activeTab(group);
  const base = {
    groups: layout.groups,
    focusedGroupId: group.id,
    tabs: group.tabs,
    groupZoomed: layout.groups.length > 1 && state.groupZoomed,
  };
  return tab.id === state.activeTabId ? base : { ...base, ...showTab(state, tab) };
}

/// Forgets where the tabs `before` had and `after` lacks were scrolled.
function forgetClosedScroll(before: TabLayout, after: TabLayout) {
  const kept = new Set(after.groups.flatMap((g) => g.tabs.map((t) => t.id)));
  for (const group of before.groups) {
    for (const tab of group.tabs) if (!kept.has(tab.id)) forgetScroll(`tab:${tab.id}:`);
  }
}

/// Changes the active tab of a group that isn't focused, while it still shows the
/// entity view of `entityId`, so an effect running twice changes it once.
function inOtherGroup(
  state: NavState,
  groupId: string,
  entityId: string,
  update: (tab: Tab) => Tab,
): Partial<NavState> {
  const layout = layoutOf(state);
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group) return {};
  const tab = activeTab(group);
  if (tab.view.kind !== "entity" || tab.view.entityId !== entityId) return {};
  return applyLayout(state, groupModel.updateTab(layout, tab.id, update));
}

/// A Bookmark's entity view steps back to where it came from, or the Bookmarks page.
function stepBackFromBookmark(spaceId: string): (tab: Tab) => Tab {
  return (tab) => {
    const previous = tab.backStack.at(-1);
    return {
      ...tab,
      view: previous ?? { kind: "module", spaceId, module: "bookmarks" },
      backStack: previous ? tab.backStack.slice(0, -1) : tab.backStack,
    };
  };
}

/// The Bookmark sheet is modal too, so a palette opening over it closes it.
const NO_OVERLAY = {
  paletteOpen: false,
  switcherOpen: false,
  commandsOpen: false,
  settingsOpen: false,
  importOpen: false,
  whatsNewOpen: false,
  newTask: null,
  newAssignmentOpen: false,
  bookmarkSheetId: null,
};

type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => void ? K : never;
}[keyof T];
export type NavActions = Pick<NavState, FunctionKeys<NavState>>;

export function createNavActions(
  set: StoreApi<NavState>["setState"],
  get: StoreApi<NavState>["getState"],
): NavActions {
  return {
    toggleGroupZoom: () =>
      set((state) => (state.groups.length > 1 ? { groupZoomed: !state.groupZoomed } : {})),
    setSplitRatio: (ratio) => {
      const splitRatio = clampSplitRatio(ratio);
      preferences.set(STORAGE_KEYS.splitRatio, String(splitRatio));
      set({ splitRatio });
    },
    focusGroup: (groupId) =>
      set((state) => applyLayout(state, groupModel.focusGroup(layoutOf(state), groupId))),
    focusGroupAt: (index) => {
      const group = get().groups[index];
      if (group) get().focusGroup(group.id);
    },
    splitRight: (tabId) =>
      set((state) => {
        const layout = layoutOf(state);
        const id = tabId ?? state.activeTabId;
        const tab = findTab(layout, id);
        if (!tab) return {};
        const copy: Tab = { ...tab, id: crypto.randomUUID(), pinned: false };
        return {
          ...applyLayout(state, groupModel.splitRight(layout, id, copy)),
          groupZoomed: false,
        };
      }),
    splitLeft: (tabId) =>
      set((state) => {
        const layout = layoutOf(state);
        const id = tabId ?? state.activeTabId;
        const tab = findTab(layout, id);
        if (!tab) return {};
        const copy: Tab = { ...tab, id: crypto.randomUUID(), pinned: false };
        return {
          ...applyLayout(state, groupModel.splitLeft(layout, id, copy)),
          groupZoomed: false,
        };
      }),
    moveTabToGroup: (tabId, target, toIndex) =>
      set((state) => ({
        ...applyLayout(state, groupModel.moveTabToGroup(layoutOf(state), tabId, target, toIndex)),
        groupZoomed: false,
      })),
    openInNewTab: (view = { kind: "dashboard" }, { activate = true } = {}) =>
      set((state) =>
        applyLayout(state, groupModel.addTab(layoutOf(state), makeTab(view), activate)),
      ),
    switchTab: (id) =>
      set((state) => {
        if (id === state.activeTabId) return {};
        return applyLayout(state, groupModel.activateTab(layoutOf(state), id));
      }),
    cycleTab: (step) =>
      set((state) => applyLayout(state, groupModel.cycleTab(layoutOf(state), step))),
    closeTab: (id) =>
      set((state) => {
        const before = layoutOf(state);
        const after = groupModel.closeTab(before, id, () => makeTab({ kind: "dashboard" }));
        if (after === before) return {};
        forgetClosedScroll(before, after);
        return applyLayout(state, after);
      }),
    closeOtherTabs: () =>
      set((state) => {
        const before = layoutOf(state);
        const after = groupModel.closeOtherTabs(before, state.activeTabId);
        forgetClosedScroll(before, after);
        return applyLayout(state, after);
      }),
    pinTab: (id, pinned) =>
      set((state) => applyLayout(state, groupModel.pinTab(layoutOf(state), id, pinned))),
    setDraggingTabId: (draggingTabId) => set({ draggingTabId }),
    reorderTab: (id, toIndex) =>
      set((state) => applyLayout(state, groupModel.reorderTab(layoutOf(state), id, toIndex))),
    setView: (view) =>
      set((state) => {
        if (consumeNewTabIntent()) {
          return applyLayout(state, groupModel.addTab(layoutOf(state), makeTab(view), false));
        }
        return {
          view,
          activeSpaceId: activeSpaceFor(state, view),
          ...pushHistory(state, view),
        };
      }),
    goBack: () =>
      set((state) => {
        const view = state.backStack.at(-1);
        if (!view) return {};
        return {
          view,
          activeSpaceId: activeSpaceFor(state, view),
          focusBlock: null,
          backStack: state.backStack.slice(0, -1),
          forwardStack: [...state.forwardStack, state.view],
        };
      }),
    goForward: () =>
      set((state) => {
        const view = state.forwardStack.at(-1);
        if (!view) return {};
        return {
          view,
          activeSpaceId: activeSpaceFor(state, view),
          focusBlock: null,
          backStack: [...state.backStack, state.view],
          forwardStack: state.forwardStack.slice(0, -1),
        };
      }),
    openEntity: (entityId, spaceId, focus) => {
      if (consumeNewTabIntent()) {
        get().openInNewTab({ kind: "entity", entityId, spaceId }, { activate: false });
        return;
      }
      // Fire-and-forget (§ prep for a future 'reclaim space' feature): never
      // awaited, and a failure here must never block navigation.
      touchEntityOpened(entityId).catch(ignoreError("recording the last opened time"));
      const entry: RecentEntry = { entityId, spaceId, openedAt: Date.now() };
      const recents = [entry, ...get().recents.filter((r) => r.entityId !== entityId)].slice(
        0,
        MAX_RECENTS,
      );
      writeStoredRecents(recents);
      if (spaceId !== get().activeSpaceId) writeStoredActiveSpace(spaceId);
      const view: View = { kind: "entity", entityId, spaceId };
      set({
        view,
        activeSpaceId: spaceId,
        recents,
        focusBlock: focus ?? null,
        focusBlockGroupId: focus ? get().focusedGroupId : null,
        ...pushHistory(get(), view),
      });
    },
    showBookmark: (entityId, spaceId, groupId) =>
      set((state) => {
        if (groupId && groupId !== state.focusedGroupId) {
          return {
            ...inOtherGroup(state, groupId, entityId, stepBackFromBookmark(spaceId)),
            bookmarkSheetId: entityId,
          };
        }
        // Only the entity view opened for this Bookmark steps back. A second call
        // (an effect running twice) must not pop the history again, or it lands
        // on whatever was open before, like the last File page.
        if (state.view.kind !== "entity" || state.view.entityId !== entityId) {
          return { bookmarkSheetId: entityId };
        }
        const previous = state.backStack.at(-1);
        const fallback: View = { kind: "module", spaceId, module: "bookmarks" };
        return {
          view: previous ?? fallback,
          backStack: previous ? state.backStack.slice(0, -1) : state.backStack,
          bookmarkSheetId: entityId,
        };
      }),
    setBookmarkSheetId: (bookmarkSheetId) => set({ bookmarkSheetId }),
    showSavedView: (entityId, spaceId, module, groupId) =>
      set((state) => {
        const view = viewTarget(module, spaceId, entityId);
        if (groupId && groupId !== state.focusedGroupId) {
          return inOtherGroup(state, groupId, entityId, (tab) => ({
            ...tab,
            view,
          }));
        }
        // Only the entity view opened for this View is replaced, so an effect running
        // twice can't clobber whatever was navigated to since.
        if (state.view.kind !== "entity" || state.view.entityId !== entityId) return {};
        return { view };
      }),
    setActiveSpace: (spaceId) => {
      writeStoredActiveSpace(spaceId);
      set({ activeSpaceId: spaceId });
    },
    // The overlays never stack: opening one closes the others.
    setPaletteOpen: (paletteOpen) =>
      set(paletteOpen ? { ...NO_OVERLAY, paletteOpen } : { paletteOpen }),
    setSwitcherOpen: (switcherOpen) =>
      set(switcherOpen ? { ...NO_OVERLAY, switcherOpen } : { switcherOpen }),
    setCommandsOpen: (commandsOpen) =>
      set(commandsOpen ? { ...NO_OVERLAY, commandsOpen } : { commandsOpen }),
    setSettingsOpen: (settingsOpen) =>
      set(settingsOpen ? { ...NO_OVERLAY, settingsOpen } : { settingsOpen }),
    openSettingsAt: (settingsPage) => set({ ...NO_OVERLAY, settingsOpen: true, settingsPage }),
    clearSettingsPage: () => set({ settingsPage: null }),
    setImportOpen: (importOpen) => set(importOpen ? { ...NO_OVERLAY, importOpen } : { importOpen }),
    setWhatsNewOpen: (whatsNewOpen, whatsNewHistory = false) =>
      set(
        whatsNewOpen
          ? { ...NO_OVERLAY, whatsNewOpen, whatsNewHistory }
          : { whatsNewOpen, whatsNewHistory: false },
      ),
    // Never closed by another overlay opening, since it may hold unsaved text.
    setQuickJotOpen: (quickJotOpen) =>
      set(quickJotOpen ? { ...NO_OVERLAY, quickJotOpen } : { quickJotOpen }),
    setNewAssignmentOpen: (newAssignmentOpen) =>
      set(newAssignmentOpen ? { ...NO_OVERLAY, newAssignmentOpen } : { newAssignmentOpen }),
    setNewTask: (newTask) => set(newTask ? { ...NO_OVERLAY, newTask } : { newTask }),
    clearFocusBlock: () => set({ focusBlock: null }),
    setSidebarCollapsed: (sidebarCollapsed) => {
      preferences.set(STORAGE_KEYS.sidebarCollapsed, sidebarCollapsed ? "1" : "0");
      set({ sidebarCollapsed });
    },
    setRightSidebarCollapsed: (collapsed, groupId) => {
      const state = get();
      const byGroup = {
        ...state.rightSidebarCollapsedByGroup,
        [groupId ?? state.focusedGroupId]: collapsed,
      };
      // While split, the other group keeps following the remembered default, so only
      // a single group's choice becomes it.
      if (state.groups.length > 1) {
        set({ rightSidebarCollapsedByGroup: byGroup });
        return;
      }
      preferences.set(STORAGE_KEYS.rightSidebarCollapsed, collapsed ? "1" : "0");
      set({
        rightSidebarCollapsed: collapsed,
        rightSidebarCollapsedByGroup: byGroup,
      });
    },
    setRightSidebarWidth: (width) => {
      const rightSidebarWidth = clampRightSidebarWidth(width);
      preferences.set(STORAGE_KEYS.rightSidebarWidth, String(rightSidebarWidth));
      set({ rightSidebarWidth });
    },
  };
}
