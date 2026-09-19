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
  | { kind: "trash"; spaceId: string }
  | { kind: "module"; spaceId: string; module: ModuleKey }
  | { kind: "entity"; entityId: string; spaceId: string };

interface NavState {
  view: View;
  activeSpaceId: string | null;
  paletteOpen: boolean;
  setView: (view: View) => void;
  openEntity: (entityId: string, spaceId: string) => void;
  setActiveSpace: (spaceId: string) => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: { kind: "dashboard" },
  activeSpaceId: null,
  paletteOpen: false,
  setView: (view) =>
    set((state) => ({
      view,
      activeSpaceId: "spaceId" in view ? view.spaceId : state.activeSpaceId,
    })),
  openEntity: (entityId, spaceId) =>
    set({ view: { kind: "entity", entityId, spaceId }, activeSpaceId: spaceId }),
  setActiveSpace: (spaceId) => set({ activeSpaceId: spaceId }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
