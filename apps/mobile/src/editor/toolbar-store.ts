import { create } from "zustand";
import type { EditorState, ToolbarId } from "./toolbar.ts";

/// The page editor in view, for the toolbar that sits above the keyboard: whether it
/// has the keyboard, which formats are on, and how to run one.
interface ToolbarStore extends EditorState {
  run: ((id: ToolbarId) => void) | null;
  set: (state: EditorState, run: (id: ToolbarId) => void) => void;
  clear: () => void;
}

export const useToolbar = create<ToolbarStore>((set) => ({
  focused: false,
  on: {},
  run: null,
  set: (state, run) => set({ ...state, run }),
  clear: () => set({ focused: false, on: {}, run: null }),
}));
