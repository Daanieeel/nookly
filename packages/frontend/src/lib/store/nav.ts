import { forgetScroll } from "#/hooks/use-remembered-scroll.ts";
import { create } from "zustand";
import { z } from "zod";
import { viewTarget } from "#/features/views/view-target.ts";
import type { ViewModule } from "#/lib/api/views.ts";
import { touchEntityOpened } from "#/lib/api/entities.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import { type Tab, makeTab } from "./tab-model.ts";
import * as groupModel from "./tab-groups.ts";
import {
  type GroupTarget,
  type TabGroup,
  type TabLayout,
  MAX_GROUPS,
  activeTab,
  clampSplitRatio,
  DEFAULT_SPLIT_RATIO,
  findTab,
  focusedGroup,
  makeGroup,
} from "./tab-groups.ts";

export { MODULE_KEYS, type ModuleKey } from "@nookly/shared/modules";
import { MODULE_KEYS, type ModuleKey } from "@nookly/shared/modules";

export type View =
  | { kind: "dashboard" }
  | { kind: "pinned" }
  | { kind: "calendar" }
  | { kind: "tasks"; viewId?: string }
  | { kind: "assignments"; viewId?: string }
  | { kind: "trash" }
  | { kind: "module"; spaceId: string; module: ModuleKey; filterCourseId?: string; viewId?: string }
  | { kind: "entity"; entityId: string; spaceId: string };

/// A stable name for a view, for anything that remembers something per view (where it was
/// scrolled). The same page gives the same key, whichever Space it is opened from.
export function viewKey(view: View): string {
  switch (view.kind) {
    case "tasks":
    case "assignments":
      return `${view.kind}:${view.viewId ?? ""}`;
    case "module":
      return `module:${view.spaceId}:${view.module}:${view.viewId ?? ""}:${view.filterCourseId ?? ""}`;
    case "entity":
      return `entity:${view.entityId}`;
    default:
      return view.kind;
  }
}

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

/// Every tab is listed flat in `tabs`, which is all a release from before split view
/// reads. `groups` then says which tab sits in which group; an older release drops it
/// when it saves, so its tabs load back into a single group.
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
  focusedGroupId: z.string().optional(),
  groups: z
    .array(z.object({ id: z.string(), tabIds: z.array(z.string()), activeTabId: z.string() }))
    .optional(),
});

export interface RecentEntry {
  entityId: string;
  spaceId: string;
  openedAt: number;
}

const MAX_RECENTS = 5;
/// How many steps Back can go, like a browser's history.
const MAX_HISTORY = 50;

/// Where to land once an entity's view has loaded: a block of a page to scroll into view
/// (a block level search result, consumed by `BlockEditor`), or a page of a file (a mention
/// like `[Slides (p. 12)]`, consumed by the PDF viewer).
export interface FocusBlock {
  entityId: string;
  blockId?: string;
  page?: number;
}

interface NavState {
  view: View;
  /// The focused group's tabs. The active one's `view` and history live in `view`,
  /// `backStack` and `forwardStack` below, so read tabs through `currentTabs`.
  tabs: Tab[];
  activeTabId: string;
  /// Every tab group, left then right. The focused one's entry is only brought up to
  /// date when focus leaves it, so read groups through `tabGroups`.
  groups: TabGroup[];
  /// The group the sidebar, new tabs and tab shortcuts act on.
  focusedGroupId: string;
  focusGroup: (groupId: string) => void;
  /// Focuses the left (0) or right (1) group, when it exists.
  focusGroupAt: (index: number) => void;
  /// Opens a copy of a tab (the active one by default) in the group on the right.
  splitRight: (tabId?: string) => void;
  /// Moves a tab into another group, or a new one on the right, at `toIndex`.
  moveTabToGroup: (tabId: string, target: GroupTarget, toIndex?: number) => void;
  /// The left group's share of the width while split.
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  /// Opens a view in a new tab. Pass `activate: false` to leave it in the background.
  openInNewTab: (view?: View, options?: { activate?: boolean }) => void;
  switchTab: (id: string) => void;
  /// Steps to the next (1) or previous (-1) tab of the focused group, wrapping around.
  cycleTab: (step: 1 | -1) => void;
  closeTab: (id: string) => void;
  /// Closes every tab of the focused group except the active one and the pinned ones.
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
  settingsOpen: boolean;
  importOpen: boolean;
  whatsNewOpen: boolean;
  /// The open What's new dialog lists every version, not just what changed since the last one seen.
  whatsNewHistory: boolean;
  quickJotOpen: boolean;
  /// The session the open Quick Jot writes into; null for a plain Jot.
  focusBlock: FocusBlock | null;
  /// The group `focusBlock` was opened in, so the same page open in the other group
  /// doesn't scroll as well.
  focusBlockGroupId: string | null;
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
  /// `groupId` names the group showing it, when that is not the focused one.
  showBookmark: (entityId: string, spaceId: string, groupId?: string) => void;
  setBookmarkSheetId: (entityId: string | null) => void;
  /// Saved Views have no page of their own: an entity view opened for one becomes
  /// its module page with the View applied, replacing the entity view in history.
  showSavedView: (entityId: string, spaceId: string, module: ViewModule, groupId?: string) => void;
  setActiveSpace: (spaceId: string | null) => void;
  toggleExpandedSpace: (spaceId: string) => void;
  setPaletteOpen: (open: boolean) => void;
  setSwitcherOpen: (open: boolean) => void;
  setCommandsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  setWhatsNewOpen: (open: boolean, history?: boolean) => void;
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

/// The block or page of a file to land on, for a view in `groupId`: only the group it
/// was opened in scrolls there, not the same page open in the other group.
export function focusBlockIn(
  state: Pick<NavState, "focusBlock" | "focusBlockGroupId">,
  groupId: string,
): FocusBlock | null {
  return state.focusBlockGroupId === null || state.focusBlockGroupId === groupId
    ? state.focusBlock
    : null;
}

/// Every group with the focused one brought up to date from the live state.
export function tabGroups(
  state: Pick<
    NavState,
    "groups" | "focusedGroupId" | "tabs" | "activeTabId" | "view" | "backStack" | "forwardStack"
  >,
): TabGroup[] {
  return state.groups.map((group) =>
    group.id === state.focusedGroupId
      ? { id: group.id, tabs: currentTabs(state), activeTabId: state.activeTabId }
      : group,
  );
}

function layoutOf(state: NavState): TabLayout {
  return { groups: tabGroups(state), focusedGroupId: state.focusedGroupId };
}

function singleLayout(tabs: Tab[], activeTabId: string): TabLayout {
  const group = makeGroup(tabs, activeTabId);
  return { groups: [group], focusedGroupId: group.id };
}

/// Splits the saved flat tab list back into its groups. A tab no group lists (opened
/// in an older release) joins the focused group, so nothing is lost, and the group
/// holding the saved active tab is the focused one.
function layoutFromStored(stored: z.infer<typeof storedTabsSchema>): TabLayout {
  if (!stored.groups?.length) return singleLayout(stored.tabs, stored.activeTabId);
  const byId = new Map(stored.tabs.map((tab) => [tab.id, tab]));
  const placed = new Set<string>();
  const groups = stored.groups.slice(0, MAX_GROUPS).map((group) => {
    const tabs: Tab[] = [];
    for (const id of group.tabIds) {
      const tab = byId.get(id);
      if (tab && !placed.has(id)) {
        placed.add(id);
        tabs.push(tab);
      }
    }
    return { id: group.id, tabs, activeTabId: group.activeTabId };
  });
  const leftovers = stored.tabs.filter((tab) => !placed.has(tab.id));
  const home = groups.find((g) => g.id === stored.focusedGroupId) ?? groups[0];
  home.tabs.push(...leftovers);
  const kept = groups
    .filter((g) => g.tabs.length > 0)
    .map((g) =>
      g.tabs.some((t) => t.id === g.activeTabId) ? g : { ...g, activeTabId: g.tabs[0].id },
    );
  const focused = kept.find((g) => g.tabs.some((t) => t.id === stored.activeTabId)) ?? kept[0];
  return {
    groups: kept.map((g) => (g === focused ? { ...g, activeTabId: stored.activeTabId } : g)),
    focusedGroupId: focused.id,
  };
}

function readStoredTabs(): TabLayout {
  try {
    const raw = preferences.get(STORAGE_KEYS.tabs);
    if (raw) {
      const parsed = storedTabsSchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.tabs.some((t) => t.id === parsed.data.activeTabId)) {
        return layoutFromStored(parsed.data);
      }
    }
  } catch {
    // fall through to a single fresh tab
  }
  const tab = makeTab({ kind: "dashboard" });
  return singleLayout([tab], tab.id);
}

function readStoredSplitRatio(): number {
  const raw = preferences.get(STORAGE_KEYS.splitRatio);
  return raw === null ? DEFAULT_SPLIT_RATIO : clampSplitRatio(Number(raw));
}

const initialLayout = readStoredTabs();
const initialGroup = focusedGroup(initialLayout);
const initialTab = activeTab(initialGroup);

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
    focusBlockGroupId: null,
  };
}

/// What showing `layout` changes: the focused group's tabs become the live ones, and
/// its active tab's view and history too when another tab is now shown.
function applyLayout(state: NavState, layout: TabLayout): Partial<NavState> {
  const group = focusedGroup(layout);
  const tab = activeTab(group);
  const base = { groups: layout.groups, focusedGroupId: group.id, tabs: group.tabs };
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
  bookmarkSheetId: null,
};

export const useNavStore = create<NavState>((set, get) => ({
  view: initialTab.view,
  tabs: initialGroup.tabs,
  activeTabId: initialTab.id,
  activeSpaceId: readStoredActiveSpace(),
  expandedSpaceIds: readStoredExpandedSpaces(),
  paletteOpen: false,
  switcherOpen: false,
  commandsOpen: false,
  settingsOpen: false,
  importOpen: false,
  whatsNewOpen: false,
  whatsNewHistory: false,
  quickJotOpen: false,
  focusBlock: null,
  focusBlockGroupId: null,
  sidebarCollapsed: readStoredCollapsed(),
  rightSidebarCollapsed: readStoredRightSidebarCollapsed(),
  rightSidebarWidth: readStoredRightSidebarWidth(),
  recents: readStoredRecents(),
  backStack: initialTab.backStack,
  forwardStack: initialTab.forwardStack,
  groups: initialLayout.groups,
  focusedGroupId: initialLayout.focusedGroupId,
  splitRatio: readStoredSplitRatio(),
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
      return applyLayout(state, groupModel.splitRight(layout, id, copy));
    }),
  moveTabToGroup: (tabId, target, toIndex) =>
    set((state) =>
      applyLayout(state, groupModel.moveTabToGroup(layoutOf(state), tabId, target, toIndex)),
    ),
  openInNewTab: (view = { kind: "dashboard" }, { activate = true } = {}) =>
    set((state) => applyLayout(state, groupModel.addTab(layoutOf(state), makeTab(view), activate))),
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
  draggingTabId: null,
  setDraggingTabId: (draggingTabId) => set({ draggingTabId }),
  reorderTab: (id, toIndex) =>
    set((state) => applyLayout(state, groupModel.reorderTab(layoutOf(state), id, toIndex))),
  setView: (view) =>
    set((state) => {
      if (consumeNewTabIntent()) {
        return applyLayout(state, groupModel.addTab(layoutOf(state), makeTab(view), false));
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
      focusBlockGroupId: focus ? get().focusedGroupId : null,
      ...pushHistory(get(), view),
    });
  },
  bookmarkSheetId: null,
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
        return inOtherGroup(state, groupId, entityId, (tab) => ({ ...tab, view }));
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
  setSettingsOpen: (settingsOpen) =>
    set(settingsOpen ? { ...NO_OVERLAY, settingsOpen } : { settingsOpen }),
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
    state.groups === previous.groups &&
    state.focusedGroupId === previous.focusedGroupId &&
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
    const groups = tabGroups(latest);
    preferences.set(
      STORAGE_KEYS.tabs,
      JSON.stringify({
        activeTabId: latest.activeTabId,
        tabs: groups.flatMap((g) => g.tabs),
        focusedGroupId: latest.focusedGroupId,
        groups: groups.map((g) => ({
          id: g.id,
          tabIds: g.tabs.map((t) => t.id),
          activeTabId: g.activeTabId,
        })),
      }),
    );
  }, 300);
});
