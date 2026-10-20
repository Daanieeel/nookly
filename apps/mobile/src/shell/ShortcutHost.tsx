import { useRouter } from "expo-router";
import { useEffect } from "react";
import * as system from "../../modules/nookly-keys/src/index.ts";
import type { PaletteCommand } from "./commands.ts";
import { type Shortcut, SHORTCUTS, type ShortcutId } from "./shortcuts.ts";
import { useShell } from "./store.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

/// What the host needs of the system's keyboard shortcuts (`modules/nookly-keys`).
export interface KeySystem {
  setShortcuts(items: Shortcut[]): void;
  onShortcut(listener: (id: string) => void): () => void;
}

/// Registers the keyboard shortcuts with the system for as long as it is shown, and does
/// what each one asks. Shows nothing.
export function ShortcutHost({
  onAction,
  keys = system,
}: {
  onAction: (action: AppAction) => void;
  keys?: KeySystem;
}) {
  const router = useRouter();
  const open = useShell((s) => s.open);
  useEffect(() => {
    keys.setShortcuts(SHORTCUTS);
    const run = (id: ShortcutId) => {
      switch (id) {
        case "search":
          return open("search");
        case "quickOpen":
          return open("quick");
        case "commands":
          return open("commands");
        case "settings":
          return router.push("/settings");
        case "quickJot":
          return router.push("/new/jot");
        case "newItem":
          return router.push("/new/page");
        case "toggleSidebar":
        case "toggleInspector":
        case "back":
        case "forward":
        case "newTab":
        case "closeTab":
        case "splitRight":
          return onAction(id);
        case "nextTab":
          return onAction("nextTab");
        case "previousTab":
          return onAction("previousTab");
      }
    };
    const stop = keys.onShortcut((id) => {
      const known = SHORTCUTS.find((s) => s.id === id);
      if (known) run(known.id);
    });
    return () => {
      stop();
      keys.setShortcuts([]);
    };
  }, [open, onAction, router, keys]);
  return null;
}
