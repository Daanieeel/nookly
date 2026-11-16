import { randomUUID } from "expo-crypto";
import Storage from "expo-sqlite/kv-store";
import { create } from "zustand";
import type { GroupTarget } from "@nookly/frontend/lib/store/tab-groups";
import {
  type Where,
  type Workspace,
  back,
  closeOtherTabs,
  closeTab,
  cycleTab,
  focusGroup,
  forward,
  keepPreview,
  moveTab,
  open,
  parseWorkspace,
  pinTab,
  reorderTab,
  selectTab,
  setSplitRatio,
  splitLeft,
  splitRight,
  toggleZoom,
} from "./workspace.ts";

const KEY = "nookly.shell.workspace";
/// The first tablet version's tabs, carried over once.
const OLD_KEY = "nookly.shell.tabs";

interface WorkspaceStore {
  ws: Workspace;
  update(change: (ws: Workspace) => Workspace): void;
}

/// The tablet's tabs and groups, remembered between launches (a device preference, like the
/// desktop's).
export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  ws: parseWorkspace(Storage.getItemSync(KEY), randomUUID, Storage.getItemSync(OLD_KEY)),
  update: (change) => {
    const next = change(get().ws);
    if (next === get().ws) return;
    Storage.setItemSync(KEY, JSON.stringify({ ...next, zoomed: false }));
    set({ ws: next });
  },
}));

const update = (change: (ws: Workspace) => Workspace) => useWorkspace.getState().update(change);

/// What the tablet's window does with its tabs and groups; each is one step of
/// `workspace.ts`.
export const workspace = {
  open: (path: string, where: Where = "here") => update((ws) => open(ws, path, where, randomUUID)),
  back: () => update(back),
  forward: () => update(forward),
  select: (tabId: string) => update((ws) => selectTab(ws, tabId)),
  focus: (groupId: string) => update((ws) => focusGroup(ws, groupId)),
  cycle: (step: 1 | -1) => update((ws) => cycleTab(ws, step)),
  close: (tabId: string) => update((ws) => closeTab(ws, tabId, randomUUID)),
  closeOthers: (tabId: string) => update((ws) => closeOtherTabs(ws, tabId)),
  pin: (tabId: string, pinned: boolean) => update((ws) => pinTab(ws, tabId, pinned)),
  reorder: (tabId: string, toIndex: number) => update((ws) => reorderTab(ws, tabId, toIndex)),
  move: (tabId: string, target: GroupTarget, toIndex?: number) =>
    update((ws) => moveTab(ws, tabId, target, toIndex)),
  /// Into the other group, as the desktop's Move to Other Group.
  moveToOther: (tabId: string) =>
    update((ws) => {
      const other = ws.layout.groups.find((g) => !g.tabs.some((t) => t.id === tabId));
      return other ? moveTab(ws, tabId, { groupId: other.id }) : ws;
    }),
  keep: (tabId: string) => update((ws) => keepPreview(ws, tabId)),
  splitRight: () => update((ws) => splitRight(ws, randomUUID)),
  splitLeft: () => update((ws) => splitLeft(ws, randomUUID)),
  toggleZoom: () => update(toggleZoom),
  setRatio: (ratio: number) => update((ws) => setSplitRatio(ws, ratio)),
};
