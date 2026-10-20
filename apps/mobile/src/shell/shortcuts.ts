import type { KeyShortcut } from "../../modules/nookly-keys/src/index.ts";

/// The keyboard shortcuts of an iPad with a keyboard, on the desktop's keys wherever the
/// desktop has the same action (`packages/frontend/src/lib/hotkeys.ts`). The system lists
/// them when Command is held, and Settings lists them too.
export type ShortcutId =
  | "search"
  | "quickOpen"
  | "commands"
  | "settings"
  | "quickJot"
  | "newItem"
  | "toggleSidebar"
  | "toggleInspector"
  | "back"
  | "forward";

export interface Shortcut extends KeyShortcut {
  id: ShortcutId;
  section: "Navigation" | "Create";
}

export const SHORTCUTS: Shortcut[] = [
  { id: "search", key: "k", modifiers: ["command"], title: "Search", section: "Navigation" },
  { id: "quickOpen", key: "p", modifiers: ["command"], title: "Quick Open", section: "Navigation" },
  {
    id: "commands",
    key: "p",
    modifiers: ["command", "shift"],
    title: "Commands",
    section: "Navigation",
  },
  { id: "settings", key: ",", modifiers: ["command"], title: "Settings", section: "Navigation" },
  {
    id: "toggleSidebar",
    key: "s",
    modifiers: ["command"],
    title: "Collapse or Expand the Sidebar",
    section: "Navigation",
  },
  {
    id: "toggleInspector",
    key: "s",
    modifiers: ["command", "shift"],
    title: "Collapse or Expand the Details",
    section: "Navigation",
  },
  { id: "back", key: "[", modifiers: ["command"], title: "Go Back", section: "Navigation" },
  { id: "forward", key: "]", modifiers: ["command"], title: "Go Forward", section: "Navigation" },
  { id: "quickJot", key: "j", modifiers: ["command"], title: "Quick Jot", section: "Create" },
  { id: "newItem", key: "n", modifiers: ["command"], title: "New Item", section: "Create" },
];

const SYMBOLS = { control: "⌃", option: "⌥", shift: "⇧", command: "⌘" } as const;
const ORDER = ["control", "option", "shift", "command"] as const;
const NAMED = new Map([
  ["\t", "⇥"],
  ["\\", "\\"],
]);

/// "⇧⌘P": modifiers in the system's order, then the key.
export function shortcutLabel(shortcut: KeyShortcut): string {
  const mods = ORDER.filter((m) => shortcut.modifiers.includes(m))
    .map((m) => SYMBOLS[m])
    .join("");
  return `${mods}${NAMED.get(shortcut.key) ?? shortcut.key.toUpperCase()}`;
}
