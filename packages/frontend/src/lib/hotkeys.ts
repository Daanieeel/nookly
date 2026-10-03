import type { RegisterableHotkey } from "@tanstack/hotkeys";

/// Every keyboard shortcut registered through TanStack Hotkeys. `Mod` is Cmd on
/// macOS and Ctrl elsewhere. Shortcuts that need capture phase ordering or
/// in-gesture state (context menu, right sidebar, select all, block handles,
/// drag, time grid, PDF viewer, study session) still use their own listeners.
export const HOTKEYS = {
  search: "Mod+K",
  quickSwitcher: "Mod+P",
  commands: "Mod+Shift+P",
  quickJot: "Mod+J",
  filter: "Mod+Shift+F",
  toggleSidebar: "Mod+S",
  toggleDetailSidebar: "Mod+Shift+S",
  back: "Mod+[",
  forward: "Mod+]",
  backArrow: "Mod+ArrowLeft",
  forwardArrow: "Mod+ArrowRight",
  create: "C",
  newItem: "Mod+N",
  nextTask: "J",
  previousTask: "K",
  today: "T",
  previousPeriod: "ArrowLeft",
  nextPeriod: "ArrowRight",
  newCard: "N",
  study: "S",
} as const satisfies Record<string, RegisterableHotkey>;
