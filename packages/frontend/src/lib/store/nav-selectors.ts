import type { Tab } from "./tab-model.ts";
import type { TabGroup, TabLayout } from "./tab-groups.ts";
import type { FocusBlock, NavState } from "./nav-types.ts";

/// The tabs with the active one brought up to date from the live view and history.
export function currentTabs(
  state: Pick<NavState, "tabs" | "activeTabId" | "view" | "backStack" | "forwardStack">,
): Tab[] {
  return state.tabs.map((tab) =>
    tab.id === state.activeTabId
      ? {
          ...tab,
          view: state.view,
          backStack: state.backStack,
          forwardStack: state.forwardStack,
        }
      : tab,
  );
}

/// The block or page of a file to land on, for a view in `groupId`: only the group it
/// was opened in scrolls there, not the same page open in the other group.
export function focusBlockIn(
  state: Pick<NavState, "focusBlock" | "focusBlockGroupId">,
  groupId: string,
): FocusBlock | null {
  return state.focusBlockGroupId === null || state.focusBlockGroupId === groupId
    ? state.focusBlock
    : null;
}

/// Every group with the focused one brought up to date from the live state.
export function tabGroups(
  state: Pick<
    NavState,
    "groups" | "focusedGroupId" | "tabs" | "activeTabId" | "view" | "backStack" | "forwardStack"
  >,
): TabGroup[] {
  return state.groups.map((group) =>
    group.id === state.focusedGroupId
      ? {
          id: group.id,
          tabs: currentTabs(state),
          activeTabId: state.activeTabId,
        }
      : group,
  );
}

/// Whether the details sidebar is collapsed in a group.
export function rightSidebarCollapsedIn(
  state: Pick<NavState, "rightSidebarCollapsed" | "rightSidebarCollapsedByGroup">,
  groupId: string,
): boolean {
  return state.rightSidebarCollapsedByGroup[groupId] ?? state.rightSidebarCollapsed;
}

export function layoutOf(state: NavState): TabLayout {
  return { groups: tabGroups(state), focusedGroupId: state.focusedGroupId };
}
