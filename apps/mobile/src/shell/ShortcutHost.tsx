import { useRouter } from "expo-router";
import { useEffect } from "react";
import * as system from "../../modules/nookly-keys/src/index.ts";
import type { PaletteCommand } from "./commands.ts";
import { topLayer, useLayers } from "../ui/sheet/layers.ts";
import { LAYER_SHORTCUTS, type Shortcut, SHORTCUTS, type ShortcutId } from "./shortcuts.ts";
import { useShell } from "./store.ts";
import { stepSpace } from "./sidebar/space-step.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

/// What the host needs of the system's keyboard shortcuts (`modules/nookly-keys`).
export interface KeySystem {
  setShortcuts(items: (Shortcut | (typeof LAYER_SHORTCUTS)[number])[]): void;
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
  // Escape and Command Return only while a popover or dialog is open: otherwise they are
  // the page's (the editor's).
  const layered = useLayers((s) => s.stack.length > 0);
  useEffect(() => {
    keys.setShortcuts(layered ? [...SHORTCUTS, ...LAYER_SHORTCUTS] : SHORTCUTS);
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
        case "nextSpace":
          return stepSpace(1);
        case "previousSpace":
          return stepSpace(-1);
        case "nextTab":
          return onAction("nextTab");
        case "previousTab":
          return onAction("previousTab");
      }
    };
    const stop = keys.onShortcut((id) => {
      if (id === "dismiss") return topLayer()?.close();
      if (id === "submit") return topLayer()?.submit?.();
      const known = SHORTCUTS.find((s) => s.id === id);
      if (known) run(known.id);
    });
    return () => {
      stop();
      keys.setShortcuts([]);
    };
  }, [open, onAction, router, keys, layered]);
  return null;
}
