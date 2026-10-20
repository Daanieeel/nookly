import { useRouter } from "expo-router";
import { useEffect } from "react";
import { onShortcut, setShortcuts } from "../../modules/nookly-keys/src/index.ts";
import type { PaletteCommand } from "./commands.ts";
import { SHORTCUTS, type ShortcutId } from "./shortcuts.ts";
import { useShell } from "./store.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

/// Registers the keyboard shortcuts with the system for as long as it is shown, and does
/// what each one asks. Shows nothing.
export function ShortcutHost({ onAction }: { onAction: (action: AppAction) => void }) {
  const router = useRouter();
  const open = useShell((s) => s.open);
  useEffect(() => {
    setShortcuts(SHORTCUTS);
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
          return onAction(id);
      }
    };
    const stop = onShortcut((id) => {
      const known = SHORTCUTS.find((s) => s.id === id);
      if (known) run(known.id);
    });
    return () => {
      stop();
      setShortcuts([]);
    };
  }, [open, onAction, router]);
  return null;
}
