import { IconPin, IconPinnedOff, IconX } from "@tabler/icons-react";
import { registerActions } from "#/components/context-menu/registry.ts";
import { useNavStore } from "#/lib/store/nav.ts";

declare module "#/components/context-menu/registry.ts" {
  interface ContextTargets {
    /// A tab in the tab bar.
    tab: { tabId: string };
  }
}

const isPinned = ({ tabId }: { tabId: string }) =>
  useNavStore.getState().tabs.find((t) => t.id === tabId)?.pinned ?? false;

registerActions("tab", [
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
    shortcut: "⌘W",
    run: (t) => useNavStore.getState().closeTab(t.tabId),
  },
  {
    id: "close-others",
    group: "danger",
    label: "Close Other Tabs",
    icon: IconX,
    shortcut: "⇧⌘W",
    disabled: (t) => useNavStore.getState().tabs.every((tab) => tab.id === t.tabId || tab.pinned),
    run: (t) => {
      useNavStore.getState().switchTab(t.tabId);
      useNavStore.getState().closeOtherTabs();
    },
  },
]);
