import { create } from "zustand";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import {
  clampRightSidebarWidth,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
} from "./nav-storage.ts";
import { createNavActions } from "./nav-actions.ts";
import { tabGroups } from "./nav-selectors.ts";
import { initialNavState } from "./nav-state.ts";
import type { NavState } from "./nav-types.ts";

export {
  clampRightSidebarWidth,
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
};
export { MODULE_KEYS, viewKey } from "./nav-types.ts";
export type { FocusBlock, ModuleKey, RecentEntry, View } from "./nav-types.ts";
export { currentTabs, focusBlockIn, rightSidebarCollapsedIn, tabGroups } from "./nav-selectors.ts";
export { armNewTabIntent } from "./nav-actions.ts";

export const useNavStore = create<NavState>((set, get) => ({
  ...initialNavState,
  ...createNavActions(set, get),
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
