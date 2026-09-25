import {
  IconCommand,
  IconFeather,
  IconFileSearch,
  IconLayoutDashboard,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { useNavStore } from "#/lib/store/nav.ts";
import { type MenuAction, registerActions } from "./registry";

declare module "./registry" {
  interface ContextTargets {
    /// The empty background of a module's page. `create` is that page's own
    /// creation flow, for "New <Type>" right where the user is.
    "module-view": ModuleViewTarget;
  }
}

export interface ModuleViewTarget {
  spaceId: string;
  createLabel?: string;
  create?: () => void;
}

/// Always reachable, whatever was right-clicked: the fallback for anywhere
/// nothing more specific sits under the cursor. They open overlays, so they run
/// once the menu has closed.
export function appActions<T>(): MenuAction<T>[] {
  return [
    {
      id: "search",
      group: "app",
      label: "Search…",
      icon: IconSearch,
      shortcut: "⌘K",
      afterClose: true,
      run: () => useNavStore.getState().setPaletteOpen(true),
    },
    {
      id: "quick-open",
      group: "app",
      label: "Quick Open…",
      icon: IconFileSearch,
      shortcut: "⌘P",
      afterClose: true,
      run: () => useNavStore.getState().setSwitcherOpen(true),
    },
    {
      id: "commands",
      group: "app",
      label: "Commands…",
      icon: IconCommand,
      shortcut: "⇧⌘P",
      afterClose: true,
      run: () => useNavStore.getState().setCommandsOpen(true),
    },
    {
      id: "quick-jot",
      group: "app",
      label: "Quick Jot",
      icon: IconFeather,
      shortcut: "⌘J",
      afterClose: true,
      run: () => useNavStore.getState().setQuickJotOpen(true),
    },
    {
      id: "dashboard",
      group: "app",
      label: "Go to Dashboard",
      icon: IconLayoutDashboard,
      when: () => useNavStore.getState().view.kind !== "dashboard",
      run: () => useNavStore.getState().setView({ kind: "dashboard" }),
    },
  ];
}

registerActions("app", appActions());

registerActions("module-view", [
  {
    id: "create",
    group: "create",
    label: (t) => t.createLabel ?? "New",
    icon: IconPlus,
    when: (t) => Boolean(t.create),
    afterClose: true,
    run: (t) => t.create?.(),
  },
  ...appActions<ModuleViewTarget>(),
]);
