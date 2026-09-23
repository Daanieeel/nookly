import { create } from "zustand";
import { STORAGE_KEYS } from "@/lib/storage-keys";

export const MODULE_KEYS = [
  "tasks",
  "notes",
  "jots",
  "courses",
  "semesters",
  "sessions",
  "exams",
  "assignments",
  "files",
  "bookmarks",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type View =
  | { kind: "dashboard" }
  | { kind: "pinned" }
  | { kind: "recents" }
  | { kind: "trash" }
  | { kind: "module"; spaceId: string; module: ModuleKey; filterCourseId?: string }
  | { kind: "entity"; entityId: string; spaceId: string };

export interface RecentEntry {
  entityId: string;
  spaceId: string;
  openedAt: number;
}

const MAX_RECENTS = 5;

/// A block to scroll into view once its page's editor has hydrated, e.g. after
/// picking a block level search result. Consumed (cleared) by `BlockEditor`.
export interface FocusBlock {
  entityId: string;
  blockId: string;
}

interface NavState {
  view: View;
  activeSpaceId: string | null;
  paletteOpen: boolean;
  switcherOpen: boolean;
  commandsOpen: boolean;
  quickJotOpen: boolean;
  focusBlock: FocusBlock | null;
  sidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  rightSidebarWidth: number;
  recents: RecentEntry[];
  setView: (view: View) => void;
  /// `focus` scrolls to a block once its page renders; its `entityId` is the
  /// page holding the block, which may be embedded in the opened entity.
  openEntity: (entityId: string, spaceId: string, focus?: FocusBlock) => void;
  /// Drops recents whose entity id isn't in `validIds` (deleted/trashed since
  /// being opened), so a stale entry doesn't sit in the list — or inflate its
  /// count — forever.
  pruneRecents: (validIds: Set<string>) => void;
  setActiveSpace: (spaceId: string | null) => void;
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
  try {
    return localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === "1";
  } catch {
    return false;
  }
}

/// Bounds for the resizable right sidebar. The minimum fits its top row: four 36px
/// icon buttons (collapse, export, pin, more) with their gaps and the `p-3` padding.
export const RIGHT_SIDEBAR_MIN_WIDTH = 224;
export const RIGHT_SIDEBAR_MAX_WIDTH = 480;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 288;

export function clampRightSidebarWidth(width: number): number {
  return Math.min(RIGHT_SIDEBAR_MAX_WIDTH, Math.max(RIGHT_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readStoredRightSidebarWidth(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEYS.rightSidebarWidth));
    return stored ? clampRightSidebarWidth(stored) : RIGHT_SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return RIGHT_SIDEBAR_DEFAULT_WIDTH;
  }
}

function readStoredRightSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.rightSidebarCollapsed) === "1";
  } catch {
    return false;
  }
}

function readStoredActiveSpace(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.activeSpace);
  } catch {
    return null;
  }
}

function writeStoredActiveSpace(spaceId: string | null) {
  try {
    if (spaceId) localStorage.setItem(STORAGE_KEYS.activeSpace, spaceId);
    else localStorage.removeItem(STORAGE_KEYS.activeSpace);
  } catch {
    // best-effort only
  }
}

function readStoredRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.recents);
    // SAFETY: this key is only ever written by `writeStoredRecents` below, with the
    // exact `RecentEntry[]` shape — never user-editable or written by anything else.
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStoredRecents(recents: RecentEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.recents, JSON.stringify(recents));
  } catch {
    // best-effort only
  }
}

const NO_OVERLAY = { paletteOpen: false, switcherOpen: false, commandsOpen: false };

export const useNavStore = create<NavState>((set, get) => ({
  view: { kind: "dashboard" },
  activeSpaceId: readStoredActiveSpace(),
  paletteOpen: false,
  switcherOpen: false,
  commandsOpen: false,
  quickJotOpen: false,
  focusBlock: null,
  sidebarCollapsed: readStoredCollapsed(),
  rightSidebarCollapsed: readStoredRightSidebarCollapsed(),
  rightSidebarWidth: readStoredRightSidebarWidth(),
  recents: readStoredRecents(),
  setView: (view) =>
    set((state) => {
      const activeSpaceId = "spaceId" in view ? view.spaceId : state.activeSpaceId;
      if (activeSpaceId !== state.activeSpaceId) writeStoredActiveSpace(activeSpaceId);
      return { view, activeSpaceId };
    }),
  openEntity: (entityId, spaceId, focus) => {
    const entry: RecentEntry = { entityId, spaceId, openedAt: Date.now() };
    const recents = [entry, ...get().recents.filter((r) => r.entityId !== entityId)].slice(
      0,
      MAX_RECENTS,
    );
    writeStoredRecents(recents);
    if (spaceId !== get().activeSpaceId) writeStoredActiveSpace(spaceId);
    set({
      view: { kind: "entity", entityId, spaceId },
      activeSpaceId: spaceId,
      recents,
      focusBlock: focus ?? null,
    });
  },
  pruneRecents: (validIds) => {
    const recents = get().recents.filter((r) => validIds.has(r.entityId));
    if (recents.length === get().recents.length) return;
    writeStoredRecents(recents);
    set({ recents });
  },
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
  // Never closed by another overlay opening, since it may hold unsaved text.
  setQuickJotOpen: (quickJotOpen) =>
    set(quickJotOpen ? { ...NO_OVERLAY, quickJotOpen } : { quickJotOpen }),
  clearFocusBlock: () => set({ focusBlock: null }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    try {
      localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, sidebarCollapsed ? "1" : "0");
    } catch {
      // best-effort only
    }
    set({ sidebarCollapsed });
  },
  setRightSidebarCollapsed: (rightSidebarCollapsed) => {
    try {
      localStorage.setItem(STORAGE_KEYS.rightSidebarCollapsed, rightSidebarCollapsed ? "1" : "0");
    } catch {
      // best-effort only
    }
    set({ rightSidebarCollapsed });
  },
  setRightSidebarWidth: (width) => {
    const rightSidebarWidth = clampRightSidebarWidth(width);
    try {
      localStorage.setItem(STORAGE_KEYS.rightSidebarWidth, String(rightSidebarWidth));
    } catch {
      // best-effort only
    }
    set({ rightSidebarWidth });
  },
}));
