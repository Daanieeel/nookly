import { create } from "zustand";

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

interface NavState {
  view: View;
  activeSpaceId: string | null;
  paletteOpen: boolean;
  sidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  recents: RecentEntry[];
  setView: (view: View) => void;
  openEntity: (entityId: string, spaceId: string) => void;
  /// Drops recents whose entity id isn't in `validIds` (deleted/trashed since
  /// being opened), so a stale entry doesn't sit in the list — or inflate its
  /// count — forever.
  pruneRecents: (validIds: Set<string>) => void;
  setActiveSpace: (spaceId: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem("nookly:sidebar-collapsed") === "1";
  } catch {
    return false;
  }
}

function readStoredRightSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem("nookly:right-sidebar-collapsed") === "1";
  } catch {
    return false;
  }
}

function readStoredActiveSpace(): string | null {
  try {
    return localStorage.getItem("nookly:active-space");
  } catch {
    return null;
  }
}

function writeStoredActiveSpace(spaceId: string | null) {
  try {
    if (spaceId) localStorage.setItem("nookly:active-space", spaceId);
    else localStorage.removeItem("nookly:active-space");
  } catch {
    // best-effort only
  }
}

function readStoredRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem("nookly:recents");
    // SAFETY: this key is only ever written by `writeStoredRecents` below, with the
    // exact `RecentEntry[]` shape — never user-editable or written by anything else.
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStoredRecents(recents: RecentEntry[]) {
  try {
    localStorage.setItem("nookly:recents", JSON.stringify(recents));
  } catch {
    // best-effort only
  }
}

export const useNavStore = create<NavState>((set, get) => ({
  view: { kind: "dashboard" },
  activeSpaceId: readStoredActiveSpace(),
  paletteOpen: false,
  sidebarCollapsed: readStoredCollapsed(),
  rightSidebarCollapsed: readStoredRightSidebarCollapsed(),
  recents: readStoredRecents(),
  setView: (view) =>
    set((state) => {
      const activeSpaceId = "spaceId" in view ? view.spaceId : state.activeSpaceId;
      if (activeSpaceId !== state.activeSpaceId) writeStoredActiveSpace(activeSpaceId);
      return { view, activeSpaceId };
    }),
  openEntity: (entityId, spaceId) => {
    const entry: RecentEntry = { entityId, spaceId, openedAt: Date.now() };
    const recents = [entry, ...get().recents.filter((r) => r.entityId !== entityId)].slice(
      0,
      MAX_RECENTS,
    );
    writeStoredRecents(recents);
    if (spaceId !== get().activeSpaceId) writeStoredActiveSpace(spaceId);
    set({ view: { kind: "entity", entityId, spaceId }, activeSpaceId: spaceId, recents });
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
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    try {
      localStorage.setItem("nookly:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // best-effort only
    }
    set({ sidebarCollapsed });
  },
  setRightSidebarCollapsed: (rightSidebarCollapsed) => {
    try {
      localStorage.setItem("nookly:right-sidebar-collapsed", rightSidebarCollapsed ? "1" : "0");
    } catch {
      // best-effort only
    }
    set({ rightSidebarCollapsed });
  },
}));
