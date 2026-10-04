import { create } from "zustand";
import { z } from "zod";
import { viewTarget } from "#/features/views/view-target.ts";
import type { ViewModule } from "#/lib/api/views.ts";
import { touchEntityOpened } from "#/lib/api/entities.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import { type Tab, makeTab, moveTab, pinnedFirst, tabAfterClose } from "./tab-model.ts";

export const MODULE_KEYS = [
  "tasks",
  "notes",
  "jots",
  "courses",
  "semesters",
  "sessions",
  "calendar",
  "exams",
  "decks",
  "assignments",
  "files",
  "bookmarks",
  "recipes",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type View =
  | { kind: "dashboard" }
  | { kind: "pinned" }
  | { kind: "calendar" }
  | { kind: "tasks"; viewId?: string }
  | { kind: "assignments"; viewId?: string }
  | { kind: "trash" }
  | { kind: "module"; spaceId: string; module: ModuleKey; filterCourseId?: string; viewId?: string }
  | { kind: "entity"; entityId: string; spaceId: string };

const viewSchema: z.ZodType<View> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dashboard") }),
  z.object({ kind: z.literal("pinned") }),
  z.object({ kind: z.literal("calendar") }),
  z.object({ kind: z.literal("tasks"), viewId: z.string().optional() }),
  z.object({ kind: z.literal("assignments"), viewId: z.string().optional() }),
  z.object({ kind: z.literal("trash") }),
  z.object({
    kind: z.literal("module"),
    spaceId: z.string(),
    module: z.enum(MODULE_KEYS),
    filterCourseId: z.string().optional(),
    viewId: z.string().optional(),
  }),
  z.object({ kind: z.literal("entity"), entityId: z.string(), spaceId: z.string() }),
]);

const storedTabsSchema = z.object({
  activeTabId: z.string(),
  tabs: z
    .array(
      z.object({
        id: z.string(),
        view: viewSchema,
        backStack: z.array(viewSchema),
        forwardStack: z.array(viewSchema),
        pinned: z.boolean(),
      }),
    )
    .min(1),
});

export interface RecentEntry {
  entityId: string;
  spaceId: string;
  openedAt: number;
}

const MAX_RECENTS = 5;
/// How many steps Back can go, like a browser's history.
const MAX_HISTORY = 50;

/// A block to scroll into view once its page's editor has hydrated, e.g. after
/// picking a block level search result. Consumed (cleared) by `BlockEditor`.
export interface FocusBlock {
  entityId: string;
  blockId: string;
}

interface NavState {
  view: View;
  /// Every open tab. The active one's `view` and history live in `view`, `backStack`
  /// and `forwardStack` below, so read tabs through `currentTabs`.
  tabs: Tab[];
  activeTabId: string;
  /// Opens a view in a new tab. Pass `activate: false` to leave it in the background.
  openInNewTab: (view?: View, options?: { activate?: boolean }) => void;
  switchTab: (id: string) => void;
  /// Steps to the next (1) or previous (-1) tab, wrapping around.
  cycleTab: (step: 1 | -1) => void;
  closeTab: (id: string) => void;
  /// Closes every tab except the active one and the pinned ones.
  closeOtherTabs: () => void;
  pinTab: (id: string, pinned: boolean) => void;
  reorderTab: (id: string, toIndex: number) => void;
  /// The tab being dragged in the tab bar.
  draggingTabId: string | null;
  setDraggingTabId: (id: string | null) => void;
  activeSpaceId: string | null;
  /// Spaces expanded in the sidebar. Several can be open at once, unlike
  /// `activeSpaceId`, which tracks the single Space the current view belongs to.
  expandedSpaceIds: string[];
  paletteOpen: boolean;
  switcherOpen: boolean;
  commandsOpen: boolean;
  quickJotOpen: boolean;
  focusBlock: FocusBlock | null;
  sidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  rightSidebarWidth: number;
  recents: RecentEntry[];
  /// Views to return to with Back, oldest first, and to redo with Forward, most
  /// recent last. Session only; a restart starts with empty history.
  backStack: View[];
  forwardStack: View[];
  setView: (view: View) => void;
  goBack: () => void;
  goForward: () => void;
  /// `focus` scrolls to a block once its page renders; its `entityId` is the
  /// page holding the block, which may be embedded in the opened entity.
  openEntity: (entityId: string, spaceId: string, focus?: FocusBlock) => void;
  /// The Bookmark shown in the details sheet, over whatever view is open.
  bookmarkSheetId: string | null;
  /// Bookmarks have no page of their own: an entity view opened for one steps
  /// back to where it came from (or the Bookmarks page) and opens the sheet.
  showBookmark: (entityId: string, spaceId: string) => void;
  setBookmarkSheetId: (entityId: string | null) => void;
  /// Saved Views have no page of their own: an entity view opened for one becomes
  /// its module page with the View applied, replacing the entity view in history.
  showSavedView: (entityId: string, spaceId: string, module: ViewModule) => void;
  setActiveSpace: (spaceId: string | null) => void;
  toggleExpandedSpace: (spaceId: string) => void;
  setPaletteOpen: (open: boolean) => void;
  setSwitcherOpen: (open: boolean) => void;
  setCommandsOpen: (open: boolean) => void;
  setQuickJotOpen: (open: boolean) => void;
  clearFocusBlock: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
}

function readStoredCollapsed(): boolean {
  return preferences.get(STORAGE_KEYS.sidebarCollapsed) === "1";
}

/// Bounds for the resizable right sidebar. The minimum fits its widest property
/// row in full: the 6rem label, a number stepper with its unit, the clear button
/// and the save status slot (`NumberProperty`), plus the `p-3` padding.
export const RIGHT_SIDEBAR_MIN_WIDTH = 312;
export const RIGHT_SIDEBAR_MAX_WIDTH = 480;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;

export function clampRightSidebarWidth(width: number): number {
  return Math.min(RIGHT_SIDEBAR_MAX_WIDTH, Math.max(RIGHT_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readStoredRightSidebarWidth(): number {
  const stored = Number(preferences.get(STORAGE_KEYS.rightSidebarWidth));
  return stored ? clampRightSidebarWidth(stored) : RIGHT_SIDEBAR_DEFAULT_WIDTH;
}

function readStoredRightSidebarCollapsed(): boolean {
  return preferences.get(STORAGE_KEYS.rightSidebarCollapsed) === "1";
}

function readStoredActiveSpace(): string | null {
  return preferences.get(STORAGE_KEYS.activeSpace);
}

function writeStoredActiveSpace(spaceId: string | null) {
  if (spaceId) preferences.set(STORAGE_KEYS.activeSpace, spaceId);
  else preferences.remove(STORAGE_KEYS.activeSpace);
}

/// Falls back to the last single active Space (pre multi-expand behavior) so
/// upgrading doesn't collapse whatever a returning user already had open.
function readStoredExpandedSpaces(): string[] {
  try {
    const raw = preferences.get(STORAGE_KEYS.expandedSpaces);
    if (raw) {
      // SAFETY: this key is only ever written by `writeStoredExpandedSpaces` below,
      // with the exact `string[]` shape — never user-editable or written elsewhere.
      return JSON.parse(raw) as string[];
    }
  } catch {
    // fall through to the pre multi-expand default below
  }
  const previousSingle = readStoredActiveSpace();
  return previousSingle ? [previousSingle] : [];
}

function writeStoredExpandedSpaces(ids: string[]) {
  preferences.set(STORAGE_KEYS.expandedSpaces, JSON.stringify(ids));
}

/// Adds `spaceId` to `ids` if it isn't already expanded, so navigating into a
/// Space's entity or module always reveals it in the sidebar.
function withSpaceExpanded(ids: string[], spaceId: string): string[] {
  return ids.includes(spaceId) ? ids : [...ids, spaceId];
}

/// The active and expanded Spaces after showing `view`, persisting whichever changed.
function spaceStateFor(
  state: Pick<NavState, "activeSpaceId" | "expandedSpaceIds">,
  view: View,
): Pick<NavState, "activeSpaceId" | "expandedSpaceIds"> {
  const activeSpaceId = "spaceId" in view ? view.spaceId : state.activeSpaceId;
  if (activeSpaceId !== state.activeSpaceId) writeStoredActiveSpace(activeSpaceId);
  const expandedSpaceIds =
    "spaceId" in view
      ? withSpaceExpanded(state.expandedSpaceIds, view.spaceId)
      : state.expandedSpaceIds;
  if (expandedSpaceIds !== state.expandedSpaceIds) writeStoredExpandedSpaces(expandedSpaceIds);
  return { activeSpaceId, expandedSpaceIds };
}

function readStoredRecents(): RecentEntry[] {
  try {
    const raw = preferences.get(STORAGE_KEYS.recents);
    // SAFETY: this key is only ever written by `writeStoredRecents` below, with the
    // exact `RecentEntry[]` shape — never user-editable or written by anything else.
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStoredRecents(recents: RecentEntry[]) {
  preferences.set(STORAGE_KEYS.recents, JSON.stringify(recents));
}

function sameView(a: View, b: View): boolean {
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
  return { backStack: [...state.backStack, state.view].slice(-MAX_HISTORY), forwardStack: [] };
}

/// The tabs with the active one brought up to date from the live view and history.
export function currentTabs(
  state: Pick<NavState, "tabs" | "activeTabId" | "view" | "backStack" | "forwardStack">,
): Tab[] {
  return state.tabs.map((tab) =>
    tab.id === state.activeTabId
      ? { ...tab, view: state.view, backStack: state.backStack, forwardStack: state.forwardStack }
      : tab,
  );
}

interface StoredTabs {
  tabs: Tab[];
  activeTabId: string;
}

function readStoredTabs(): StoredTabs {
  try {
    const raw = preferences.get(STORAGE_KEYS.tabs);
    if (raw) {
      const parsed = storedTabsSchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.tabs.some((t) => t.id === parsed.data.activeTabId)) {
        return parsed.data;
      }
    }
  } catch {
    // fall through to a single fresh tab
  }
  const tab = makeTab({ kind: "dashboard" });
  return { tabs: [tab], activeTabId: tab.id };
}

const initialTabs = readStoredTabs();
const initialTab =
  initialTabs.tabs.find((t) => t.id === initialTabs.activeTabId) ?? initialTabs.tabs[0];

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
  const { activeSpaceId, expandedSpaceIds } = spaceStateFor(state, tab.view);
  return {
    activeTabId: tab.id,
    view: tab.view,
    backStack: tab.backStack,
    forwardStack: tab.forwardStack,
    activeSpaceId,
    expandedSpaceIds,
    focusBlock: null,
  };
}

/// The Bookmark sheet is modal too, so a palette opening over it closes it.
const NO_OVERLAY = {
  paletteOpen: false,
  switcherOpen: false,
  commandsOpen: false,
  bookmarkSheetId: null,
};

export const useNavStore = create<NavState>((set, get) => ({
  view: initialTab.view,
  tabs: initialTabs.tabs,
  activeTabId: initialTab.id,
  activeSpaceId: readStoredActiveSpace(),
  expandedSpaceIds: readStoredExpandedSpaces(),
  paletteOpen: false,
  switcherOpen: false,
  commandsOpen: false,
  quickJotOpen: false,
  focusBlock: null,
  sidebarCollapsed: readStoredCollapsed(),
  rightSidebarCollapsed: readStoredRightSidebarCollapsed(),
  rightSidebarWidth: readStoredRightSidebarWidth(),
  recents: readStoredRecents(),
  backStack: initialTab.backStack,
  forwardStack: initialTab.forwardStack,
  openInNewTab: (view = { kind: "dashboard" }, { activate = true } = {}) =>
    set((state) => {
      const tab = makeTab(view);
      const tabs = [...currentTabs(state), tab];
      return activate ? { tabs, ...showTab(state, tab) } : { tabs };
    }),
  switchTab: (id) =>
    set((state) => {
      if (id === state.activeTabId) return {};
      const tabs = currentTabs(state);
      const tab = tabs.find((t) => t.id === id);
      return tab ? { tabs, ...showTab(state, tab) } : {};
    }),
  cycleTab: (step) =>
    set((state) => {
      const tabs = currentTabs(state);
      if (tabs.length < 2) return {};
      const index = tabs.findIndex((t) => t.id === state.activeTabId);
      return { tabs, ...showTab(state, tabs[(index + step + tabs.length) % tabs.length]) };
    }),
  closeTab: (id) =>
    set((state) => {
      const tabs = currentTabs(state);
      if (!tabs.some((t) => t.id === id)) return {};
      // Closing the last tab leaves a fresh Dashboard one behind.
      if (tabs.length === 1) {
        const tab = makeTab({ kind: "dashboard" });
        return { tabs: [tab], ...showTab(state, tab) };
      }
      const remaining = tabs.filter((t) => t.id !== id);
      if (id !== state.activeTabId) return { tabs: remaining };
      const next = tabAfterClose(tabs, id) ?? remaining[0];
      return { tabs: remaining, ...showTab(state, next) };
    }),
  closeOtherTabs: () =>
    set((state) => {
      const tabs = currentTabs(state).filter((t) => t.id === state.activeTabId || t.pinned);
      return { tabs };
    }),
  pinTab: (id, pinned) =>
    set((state) => ({
      tabs: pinnedFirst(currentTabs(state).map((t) => (t.id === id ? { ...t, pinned } : t))),
    })),
  draggingTabId: null,
  setDraggingTabId: (draggingTabId) => set({ draggingTabId }),
  reorderTab: (id, toIndex) => set((state) => ({ tabs: moveTab(currentTabs(state), id, toIndex) })),
  setView: (view) =>
    set((state) => {
      if (consumeNewTabIntent()) {
        return { tabs: [...currentTabs(state), makeTab(view)] };
      }
      const { activeSpaceId, expandedSpaceIds } = spaceStateFor(state, view);
      return { view, activeSpaceId, expandedSpaceIds, ...pushHistory(state, view) };
    }),
  goBack: () =>
    set((state) => {
      const view = state.backStack.at(-1);
      if (!view) return {};
      const { activeSpaceId, expandedSpaceIds } = spaceStateFor(state, view);
      return {
        view,
        activeSpaceId,
        expandedSpaceIds,
        focusBlock: null,
        backStack: state.backStack.slice(0, -1),
        forwardStack: [...state.forwardStack, state.view],
      };
    }),
  goForward: () =>
    set((state) => {
      const view = state.forwardStack.at(-1);
      if (!view) return {};
      const { activeSpaceId, expandedSpaceIds } = spaceStateFor(state, view);
      return {
        view,
        activeSpaceId,
        expandedSpaceIds,
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
    touchEntityOpened(entityId).catch(() => {});
    const entry: RecentEntry = { entityId, spaceId, openedAt: Date.now() };
    const recents = [entry, ...get().recents.filter((r) => r.entityId !== entityId)].slice(
      0,
      MAX_RECENTS,
    );
    writeStoredRecents(recents);
    if (spaceId !== get().activeSpaceId) writeStoredActiveSpace(spaceId);
    const expandedSpaceIds = withSpaceExpanded(get().expandedSpaceIds, spaceId);
    if (expandedSpaceIds !== get().expandedSpaceIds) writeStoredExpandedSpaces(expandedSpaceIds);
    const view: View = { kind: "entity", entityId, spaceId };
    set({
      view,
      activeSpaceId: spaceId,
      expandedSpaceIds,
      recents,
      focusBlock: focus ?? null,
      ...pushHistory(get(), view),
    });
  },
  bookmarkSheetId: null,
  showBookmark: (entityId, spaceId) =>
    set((state) => {
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
  showSavedView: (entityId, spaceId, module) =>
    set((state) => {
      const view = viewTarget(module, spaceId, entityId);
      // Only the entity view opened for this View is replaced, so an effect running
      // twice can't clobber whatever was navigated to since.
      if (state.view.kind !== "entity" || state.view.entityId !== entityId) return {};
      return { view };
    }),
  setActiveSpace: (spaceId) => {
    writeStoredActiveSpace(spaceId);
    set({ activeSpaceId: spaceId });
  },
  toggleExpandedSpace: (spaceId) =>
    set((state) => {
      const expandedSpaceIds = state.expandedSpaceIds.includes(spaceId)
        ? state.expandedSpaceIds.filter((id) => id !== spaceId)
        : [...state.expandedSpaceIds, spaceId];
      writeStoredExpandedSpaces(expandedSpaceIds);
      return { expandedSpaceIds };
    }),
  // The overlays never stack: opening one closes the others.
  setPaletteOpen: (paletteOpen) =>
    set(paletteOpen ? { ...NO_OVERLAY, paletteOpen } : { paletteOpen }),
  setSwitcherOpen: (switcherOpen) =>
    set(switcherOpen ? { ...NO_OVERLAY, switcherOpen } : { switcherOpen }),
  setCommandsOpen: (commandsOpen) =>
    set(commandsOpen ? { ...NO_OVERLAY, commandsOpen } : { commandsOpen }),
  // Never closed by another overlay opening, since it may hold unsaved text.
  setQuickJotOpen: (quickJotOpen) =>
    set(quickJotOpen ? { ...NO_OVERLAY, quickJotOpen } : { quickJotOpen }),
  clearFocusBlock: () => set({ focusBlock: null }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    preferences.set(STORAGE_KEYS.sidebarCollapsed, sidebarCollapsed ? "1" : "0");
    set({ sidebarCollapsed });
  },
  setRightSidebarCollapsed: (rightSidebarCollapsed) => {
    preferences.set(STORAGE_KEYS.rightSidebarCollapsed, rightSidebarCollapsed ? "1" : "0");
    set({ rightSidebarCollapsed });
  },
  setRightSidebarWidth: (width) => {
    const rightSidebarWidth = clampRightSidebarWidth(width);
    preferences.set(STORAGE_KEYS.rightSidebarWidth, String(rightSidebarWidth));
    set({ rightSidebarWidth });
  },
}));

// Open tabs and their history are remembered across restarts.
let tabsWriteTimer: ReturnType<typeof setTimeout> | undefined;
useNavStore.subscribe((state, previous) => {
  if (
    state.tabs === previous.tabs &&
    state.activeTabId === previous.activeTabId &&
    state.view === previous.view &&
    state.backStack === previous.backStack &&
    state.forwardStack === previous.forwardStack
  ) {
    return;
  }
  clearTimeout(tabsWriteTimer);
  tabsWriteTimer = setTimeout(() => {
    const latest = useNavStore.getState();
    preferences.set(
      STORAGE_KEYS.tabs,
      JSON.stringify({ activeTabId: latest.activeTabId, tabs: currentTabs(latest) }),
    );
  }, 300);
});
