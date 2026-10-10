import type { RegisterableHotkey } from "@tanstack/hotkeys";

/// The default of every keyboard shortcut registered through TanStack Hotkeys, by
/// name. Each is rebindable in Settings, so code reads the effective key through
/// `useShortcut` / `useAppHotkey`, never from here, and every name needs metadata in
/// `lib/shortcuts.ts`. `Mod` is Cmd on macOS and Ctrl elsewhere. Shortcuts that need capture phase ordering or
/// in-gesture state (context menu, right sidebar, select all, block handles,
/// drag, time grid, PDF viewer, study session) still use their own listeners.
export const HOTKEYS = {
  search: "Mod+K",
  quickSwitcher: "Mod+P",
  commands: "Mod+Shift+P",
  settings: "Mod+,",
  quickJot: "Mod+J",
  quickJotSession: "Mod+Shift+J",
  import: "Mod+I",
  filter: "Mod+Shift+F",
  toggleSidebar: "Mod+S",
  toggleDetailSidebar: "Mod+Shift+S",
  back: "Mod+[",
  forward: "Mod+]",
  backArrow: "Mod+ArrowLeft",
  forwardArrow: "Mod+ArrowRight",
  newTab: "Mod+T",
  closeTab: "Mod+W",
  closeOtherTabs: "Mod+Shift+W",
  nextTab: "Control+Tab",
  previousTab: "Control+Shift+Tab",
  nextTabAlt: "Mod+Alt+ArrowRight",
  previousTabAlt: "Mod+Alt+ArrowLeft",
  create: "C",
  newItem: "Mod+N",
  nextTask: "J",
  previousTask: "K",
  today: "T",
  previousPeriod: "ArrowLeft",
  nextPeriod: "ArrowRight",
  newCard: "N",
  study: "S",
  viewDay: "1",
  viewWorkWeek: "2",
  viewWeek: "3",
  viewMonth: "4",
} as const satisfies Record<string, RegisterableHotkey>;
