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
  | "forward"
  | "newTab"
  | "closeTab"
  | "nextTab"
  | "previousTab"
  | "splitRight"
  | "splitLeft"
  | "closeOtherTabs"
  | "nextTabAlt"
  | "previousTabAlt"
  | "focusLeftGroup"
  | "focusRightGroup"
  | "toggleGroupZoom"
  | "nextSpace"
  | "previousSpace";

export interface Shortcut extends KeyShortcut {
  id: ShortcutId;
  section: "Navigation" | "Tabs" | "Create";
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
  { id: "newTab", key: "t", modifiers: ["command"], title: "New Tab", section: "Tabs" },
  { id: "closeTab", key: "w", modifiers: ["command"], title: "Close Tab", section: "Tabs" },
  { id: "nextTab", key: "\t", modifiers: ["control"], title: "Next Tab", section: "Tabs" },
  {
    id: "previousTab",
    key: "\t",
    modifiers: ["control", "shift"],
    title: "Previous Tab",
    section: "Tabs",
  },
  {
    id: "closeOtherTabs",
    key: "w",
    modifiers: ["command", "shift"],
    title: "Close Other Tabs",
    section: "Tabs",
  },
  {
    id: "nextTabAlt",
    key: "UIKeyInputRightArrow",
    modifiers: ["command", "option"],
    title: "Go to Next Tab",
    section: "Tabs",
  },
  {
    id: "previousTabAlt",
    key: "UIKeyInputLeftArrow",
    modifiers: ["command", "option"],
    title: "Go to Previous Tab",
    section: "Tabs",
  },
  {
    id: "splitRight",
    key: "UIKeyInputRightArrow",
    modifiers: ["command", "option", "shift"],
    title: "Split Right",
    section: "Tabs",
  },
  {
    id: "splitLeft",
    key: "UIKeyInputLeftArrow",
    modifiers: ["command", "option", "shift"],
    title: "Split Left",
    section: "Tabs",
  },
  {
    id: "focusLeftGroup",
    key: "1",
    modifiers: ["command"],
    title: "Focus Left Group",
    section: "Tabs",
  },
  {
    id: "focusRightGroup",
    key: "2",
    modifiers: ["command"],
    title: "Focus Right Group",
    section: "Tabs",
  },
  {
    id: "toggleGroupZoom",
    key: "\r",
    modifiers: ["command", "shift"],
    title: "Zoom Group",
    section: "Tabs",
  },
  {
    id: "previousSpace",
    key: "UIKeyInputUpArrow",
    modifiers: ["command", "option"],
    title: "Previous Space",
    section: "Navigation",
  },
  {
    id: "nextSpace",
    key: "UIKeyInputDownArrow",
    modifiers: ["command", "option"],
    title: "Next Space",
    section: "Navigation",
  },
  { id: "quickJot", key: "j", modifiers: ["command"], title: "Quick Jot", section: "Create" },
  { id: "newItem", key: "n", modifiers: ["command"], title: "New Item", section: "Create" },
];

/// Keys taken only while a popover or dialog is open (`ui/sheet/layers.ts`): Escape closes
/// it, Command Return presses its main button.
export const LAYER_SHORTCUTS: KeyShortcut[] = [
  { id: "dismiss", key: "UIKeyInputEscape", modifiers: [], title: "Close" },
  { id: "submit", key: "\r", modifiers: ["command"], title: "Done" },
];

const SYMBOLS = { control: "⌃", option: "⌥", shift: "⇧", command: "⌘" } as const;
const ORDER = ["control", "option", "shift", "command"] as const;
const NAMED = new Map([
  ["\t", "⇥"],
  ["\\", "\\"],
  ["UIKeyInputUpArrow", "↑"],
  ["UIKeyInputDownArrow", "↓"],
  ["UIKeyInputLeftArrow", "←"],
  ["UIKeyInputRightArrow", "→"],
  ["UIKeyInputEscape", "⎋"],
  ["\r", "↩"],
]);

/// "⇧⌘P": modifiers in the system's order, then the key.
export function shortcutLabel(shortcut: KeyShortcut): string {
  const mods = ORDER.filter((m) => shortcut.modifiers.includes(m))
    .map((m) => SYMBOLS[m])
    .join("");
  return `${mods}${NAMED.get(shortcut.key) ?? shortcut.key.toUpperCase()}`;
}
