import { create } from "zustand";

export const MODULE_KEYS = [
  "tasks",
  "notes",
  "jots",
  "courses",
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
  | { kind: "trash" }
  | { kind: "module"; spaceId: string; module: ModuleKey }
  | { kind: "entity"; entityId: string; spaceId: string };

interface NavState {
  view: View;
  activeSpaceId: string | null;
  paletteOpen: boolean;
  sidebarCollapsed: boolean;
  setView: (view: View) => void;
  openEntity: (entityId: string, spaceId: string) => void;
  setActiveSpace: (spaceId: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem("nookly:sidebar-collapsed") === "1";
  } catch {
    return false;
  }
}

export const useNavStore = create<NavState>((set) => ({
  view: { kind: "dashboard" },
  activeSpaceId: null,
  paletteOpen: false,
  sidebarCollapsed: readStoredCollapsed(),
  setView: (view) =>
    set((state) => ({
      view,
      activeSpaceId: "spaceId" in view ? view.spaceId : state.activeSpaceId,
    })),
  openEntity: (entityId, spaceId) =>
    set({ view: { kind: "entity", entityId, spaceId }, activeSpaceId: spaceId }),
  setActiveSpace: (spaceId) => set({ activeSpaceId: spaceId }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    try {
      localStorage.setItem("nookly:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // best-effort only
    }
    set({ sidebarCollapsed });
  },
}));
