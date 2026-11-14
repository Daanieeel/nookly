import { create } from "zustand";
import type { EditorAction, EditorState } from "./toolbar.ts";

/// The page editor in view, for the toolbar that sits above the keyboard: whether it
/// has the keyboard, which formats are on, and how to run one.
interface ToolbarStore extends EditorState {
  run: ((id: EditorAction) => void) | null;
  set: (state: EditorState, run: (id: EditorAction) => void) => void;
  clear: () => void;
}

export const useToolbar = create<ToolbarStore>((set) => ({
  focused: false,
  on: {},
  off: {},
  run: null,
  set: (state, run) => set({ ...state, run }),
  clear: () => set({ focused: false, on: {}, off: {}, run: null }),
}));
