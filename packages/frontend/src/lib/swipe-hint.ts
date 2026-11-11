import { create } from "zustand";
import { preferences } from "./preferences.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";

interface SwipeHintState {
  /// Whether the user has swiped between Spaces once, which ends the hint for good.
  done: boolean;
  markDone: () => void;
}

export const useSwipeHint = create<SwipeHintState>((set, get) => ({
  done: preferences.get(STORAGE_KEYS.swipeHintDone) === "1",
  markDone: () => {
    if (get().done) return;
    preferences.set(STORAGE_KEYS.swipeHintDone, "1");
    set({ done: true });
  },
}));
