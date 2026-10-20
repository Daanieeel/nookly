import { randomUUID } from "expo-crypto";
import Storage from "expo-sqlite/kv-store";
import { create } from "zustand";
import {
  type TabsState,
  closeOtherTabs,
  closeTab,
  newTab,
  parseTabs,
  selectOffset,
  selectTab,
  setRightPane,
  visit,
} from "./tabs.ts";

const KEY = "nookly.shell.tabs";

interface TabsStore {
  state: TabsState;
  update(change: (state: TabsState) => TabsState): void;
}

/// The iPad's tabs, remembered between launches.
export const useTabs = create<TabsStore>((set, get) => ({
  state: parseTabs(Storage.getItemSync(KEY), randomUUID),
  update: (change) => {
    const next = change(get().state);
    if (next === get().state) return;
    Storage.setItemSync(KEY, JSON.stringify(next));
    set({ state: next });
  },
}));

/// The ways to change the tabs; each is one step of `tabs.ts`.
export const tabActions = {
  visit: (path: string) => useTabs.getState().update((s) => visit(s, path)),
  open: () => useTabs.getState().update((s) => newTab(s, randomUUID)),
  select: (id: string) => useTabs.getState().update((s) => selectTab(s, id)),
  close: (id: string) => useTabs.getState().update((s) => closeTab(s, id)),
  closeOthers: (id: string) => useTabs.getState().update((s) => closeOtherTabs(s, id)),
  step: (offset: number) => useTabs.getState().update((s) => selectOffset(s, offset)),
  setRight: (path: string | null) => useTabs.getState().update((s) => setRightPane(s, path)),
};
