import { useFindBar } from "../editor/FindBar.tsx";
import { usePageKeys } from "./page-keys.ts";
import { createPathFor } from "./create-path.ts";
import { activePath } from "./workspace.ts";
import { useWorkspace } from "./workspace-store.ts";
import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import * as system from "../../modules/nookly-keys/src/index.ts";
import type { PaletteCommand } from "./commands.ts";
import { topLayer, useLayers } from "../ui/sheet/layers.ts";
import {
  LAYER_SHORTCUTS,
  MENUS,
  MOVE_SHORTCUTS,
  CHOOSE_SHORTCUT,
  type Shortcut,
  SHORTCUTS,
  type ShortcutId,
} from "./shortcuts.ts";
import { useShell } from "./store.ts";
import { stepSpace } from "./sidebar/space-step.ts";
import { shortcutsWith, useKeyChanges } from "./shortcut-keys.ts";

type AppAction = NonNullable<PaletteCommand["action"]>;

/// What the host needs of the system's keyboard shortcuts (`modules/nookly-keys`).
export interface KeySystem {
  setShortcuts(items: (Shortcut | (typeof LAYER_SHORTCUTS)[number])[]): void;
  setMenus(items: { title: string; ids: string[] }[]): void;
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
  // The arrow keys only while the newest layer keeps a selection: otherwise the page's.
  const moving = useLayers((s) => s.stack.at(-1)?.move !== undefined);
  const choosing = useLayers((s) => s.stack.at(-1)?.choose !== undefined);
  // A screen's own keys, while it is shown (a study session's).
  const pageKeys = usePageKeys((s) => s.keys);
  // With the keys changed in Settings (8.6).
  const [changes] = useKeyChanges();
  const shortcuts = useMemo(() => shortcutsWith(changes), [changes]);
  useEffect(() => keys.setMenus(MENUS), [keys]);
  useEffect(() => {
    keys.setShortcuts([
      ...shortcuts,
      ...(layered ? LAYER_SHORTCUTS : []),
      ...(moving ? MOVE_SHORTCUTS : []),
      ...(choosing ? [CHOOSE_SHORTCUT] : []),
      ...pageKeys,
    ]);
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
          // SAFETY: `createPathFor` gives a route under `app/new`.
          return router.push(createPathFor(activePath(useWorkspace.getState().ws)) as never);
        case "toggleSidebar":
        case "toggleInspector":
        case "back":
        case "forward":
        case "newTab":
        case "closeTab":
        case "splitRight":
        case "splitLeft":
        case "closeOtherTabs":
        case "focusLeftGroup":
        case "focusRightGroup":
        case "toggleGroupZoom":
          return onAction(id);
        case "nextTabAlt":
          return onAction("nextTab");
        case "previousTabAlt":
          return onAction("previousTab");
        case "nextSpace":
          return stepSpace(1);
        case "previousSpace":
          return stepSpace(-1);
        case "nextTab":
          return onAction("nextTab");
        case "previousTab":
          return onAction("previousTab");
        case "find":
          return useFindBar.setState({ open: true });
        case "newTask":
          return router.push("/new/task");
        case "quickAssignment":
          return router.push("/new/assignment");
        case "import":
          return router.push("/new/import");
      }
    };
    const stop = keys.onShortcut((id) => {
      if (id === "dismiss") return topLayer()?.close();
      if (id === "submit") return topLayer()?.submit?.();
      if (id === "moveUp") return topLayer()?.move?.(-1);
      if (id === "moveDown") return topLayer()?.move?.(1);
      if (id === "choose") return topLayer()?.choose?.();
      if (pageKeys.some((k) => k.id === id)) return usePageKeys.getState().run(id);
      const known = SHORTCUTS.find((s) => s.id === id);
      if (known) run(known.id);
    });
    return () => {
      stop();
      keys.setShortcuts([]);
    };
  }, [open, onAction, router, keys, layered, moving, choosing, pageKeys, shortcuts]);
  return null;
}
