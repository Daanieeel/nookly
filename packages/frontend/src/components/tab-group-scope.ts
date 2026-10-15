import { createContext, useCallback, useContext } from "react";
import { type View, useNavStore } from "#/lib/store/nav.ts";

/// What one tab group is showing. Everything rendered inside a group reads its own
/// group's view and tab through this, never the store's live (focused) one, so two
/// groups side by side each show and remember their own.
export interface TabGroupScope {
  groupId: string;
  tabId: string;
  view: View;
  focused: boolean;
}

export const TabGroupContext = createContext<TabGroupScope | null>(null);

/// The group this component renders in. Outside any group (a dialog, the sidebar)
/// it is the focused one.
export function useTabGroupScope(): TabGroupScope {
  const scope = useContext(TabGroupContext);
  const groupId = useNavStore((s) => s.focusedGroupId);
  const tabId = useNavStore((s) => s.activeTabId);
  const view = useNavStore((s) => s.view);
  return scope ?? { groupId, tabId, view, focused: true };
}

/// For a raw key listener inside a view: asks, when a key comes in, whether this
/// component's group is the focused one (always yes outside any group), so a view
/// open in both groups of a split answers a key once.
export function useHasGroupFocus(): () => boolean {
  const scope = useContext(TabGroupContext);
  const groupId = scope?.groupId;
  return useCallback(
    () => groupId === undefined || useNavStore.getState().focusedGroupId === groupId,
    [groupId],
  );
}
