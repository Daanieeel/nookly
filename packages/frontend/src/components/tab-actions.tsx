import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconLayoutColumns,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconPin,
  IconPinnedOff,
  IconX,
} from "@tabler/icons-react";
import { registerActions } from "#/components/context-menu/registry.ts";
import { tabGroups, useNavStore } from "#/lib/store/nav.ts";
import { canSplitRight, findTab, groupOfTab } from "#/lib/store/tab-groups.ts";

declare module "#/components/context-menu/registry.ts" {
  interface ContextTargets {
    /// A tab in the tab bar.
    tab: { tabId: string };
  }
}

function layout() {
  const state = useNavStore.getState();
  return { groups: tabGroups(state), focusedGroupId: state.focusedGroupId };
}

const isPinned = ({ tabId }: { tabId: string }) => findTab(layout(), tabId)?.pinned ?? false;

/// Where in the groups a tab sits: 0 for left, 1 for right.
function groupIndex(tabId: string): number {
  const current = layout();
  const group = groupOfTab(current, tabId);
  return group ? current.groups.indexOf(group) : -1;
}

registerActions("tab", [
  {
    id: "split-right",
    group: "open",
    label: "Split Right",
    icon: IconLayoutColumns,
    shortcutName: "splitRight",
    disabled: (t) => !canSplitRight(layout(), t.tabId),
    run: (t) => useNavStore.getState().splitRight(t.tabId),
  },
  {
    id: "zoom-group",
    group: "open",
    label: () => (useNavStore.getState().groupZoomed ? "Show Both Groups" : "Zoom Group"),
    icon: () => (useNavStore.getState().groupZoomed ? IconArrowsMinimize : IconArrowsMaximize),
    shortcutName: "toggleGroupZoom",
    when: () => layout().groups.length > 1,
    run: (t) => {
      const group = groupOfTab(layout(), t.tabId);
      if (group) useNavStore.getState().focusGroup(group.id);
      useNavStore.getState().toggleGroupZoom();
    },
  },
  {
    // Also the keyboard way to drag a tab into the other group.
    id: "move-right",
    group: "open",
    label: "Move to Right Group",
    icon: IconArrowBarToRight,
    when: (t) => {
      const current = layout();
      const group = groupOfTab(current, t.tabId);
      return (
        groupIndex(t.tabId) === 0 && (current.groups.length > 1 || (group?.tabs.length ?? 0) > 1)
      );
    },
    run: (t) => useNavStore.getState().moveTabToGroup(t.tabId, "new-right"),
  },
  {
    id: "move-left",
    group: "open",
    label: "Move to Left Group",
    icon: IconArrowBarToLeft,
    when: (t) => groupIndex(t.tabId) === 1,
    run: (t) => {
      const [left] = layout().groups;
      useNavStore.getState().moveTabToGroup(t.tabId, { groupId: left.id });
    },
  },
  {
    id: "pin",
    group: "organize",
    label: (t) => (isPinned(t) ? "Unpin Tab" : "Pin Tab"),
    icon: (t: { tabId: string }) => (isPinned(t) ? IconPinnedOff : IconPin),
    run: (t) => useNavStore.getState().pinTab(t.tabId, !isPinned(t)),
  },
  {
    id: "close",
    group: "danger",
    label: "Close Tab",
    icon: IconX,
    shortcutName: "closeTab",
    run: (t) => useNavStore.getState().closeTab(t.tabId),
  },
  {
    id: "close-others",
    group: "danger",
    label: "Close Other Tabs",
    icon: IconX,
    shortcutName: "closeOtherTabs",
    disabled: (t) =>
      (groupOfTab(layout(), t.tabId)?.tabs ?? []).every((tab) => tab.id === t.tabId || tab.pinned),
    run: (t) => {
      useNavStore.getState().switchTab(t.tabId);
      useNavStore.getState().closeOtherTabs();
    },
  },
]);
