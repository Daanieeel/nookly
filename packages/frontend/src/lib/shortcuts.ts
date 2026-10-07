import {
  formatForDisplay,
  isModifierKey,
  normalizeHotkey,
  normalizeHotkeyFromEvent,
  normalizeKeyName,
  parseHotkey,
  validateHotkey,
} from "@tanstack/hotkeys";
import { HOTKEYS } from "./hotkeys.ts";
import { IS_MAC } from "./platform.ts";

/// What every rebindable shortcut is called, where it is active, and the rules for
/// resolving the keys the user chose. Pure: the settings and React side lives in
/// `hooks/use-shortcut.ts`. See docs/development/settings.md.

export type ShortcutName = keyof typeof HOTKEYS;

/// Where a shortcut is active. `global` is everywhere, so it overlaps every scope;
/// two shortcuts on one key are only a clash when their scopes overlap.
export type ShortcutScope = "global" | "lists" | "calendar" | "task" | "deck" | "study" | "pdf";

export const SHORTCUT_SECTIONS = [
  "Navigation",
  "Tabs",
  "Create",
  "Calendar",
  "Tasks",
  "Study",
] as const;

export interface ShortcutMeta {
  title: string;
  description: string;
  /// Other words someone might search for.
  synonyms: string[];
  /// One of `SHORTCUT_SECTIONS`.
  section: (typeof SHORTCUT_SECTIONS)[number];
  scopes: ShortcutScope[];
}

const GLOBAL: ShortcutScope[] = ["global"];

/// Every entry of `HOTKEYS` must be described here; the type and a test enforce it.
export const SHORTCUT_META = {
  search: {
    title: "Search",
    description: "Open search across everything in Nookly.",
    synonyms: ["find", "palette", "spotlight", "look up"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  quickSwitcher: {
    title: "Quick open",
    description: "Jump to a recent or pinned item by name.",
    synonyms: ["switcher", "go to", "open file", "recent", "jump"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  commands: {
    title: "Commands",
    description: "Open the list of commands you can run.",
    synonyms: ["command palette", "actions", "run", "menu"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  settings: {
    title: "Settings",
    description: "Open or close this dialog.",
    synonyms: ["preferences", "options", "configuration", "config"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  filter: {
    title: "Filter",
    description: "Open the filter menu on a list.",
    synonyms: ["narrow", "refine", "where", "view options"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  toggleSidebar: {
    title: "Collapse or expand the sidebar",
    description: "Hide or show the sidebar on the left.",
    synonyms: ["left sidebar", "navigation", "hide", "show", "toggle"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  toggleDetailSidebar: {
    title: "Collapse or expand the details sidebar",
    description: "Hide or show the sidebar with properties and relationships on the right.",
    synonyms: ["right sidebar", "properties", "inspector", "hide", "show", "toggle"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  back: {
    title: "Go back",
    description: "Return to the previous view.",
    synonyms: ["history", "previous page", "undo navigation", "browser back"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  forward: {
    title: "Go forward",
    description: "Move on to the next view in your history.",
    synonyms: ["history", "next page", "browser forward"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  backArrow: {
    title: "Go back (arrow)",
    description: "A second way to go back. Does nothing while you type in a field.",
    synonyms: ["history", "previous page", "alternative", "browser back"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  forwardArrow: {
    title: "Go forward (arrow)",
    description: "A second way to go forward. Does nothing while you type in a field.",
    synonyms: ["history", "next page", "alternative", "browser forward"],
    section: "Navigation",
    scopes: GLOBAL,
  },
  newTab: {
    title: "New tab",
    description: "Open a new tab.",
    synonyms: ["add tab", "open tab", "create tab"],
    section: "Tabs",
    scopes: GLOBAL,
  },
  closeTab: {
    title: "Close tab",
    description: "Close the current tab.",
    synonyms: ["remove tab", "quit tab"],
    section: "Tabs",
    scopes: GLOBAL,
  },
  closeOtherTabs: {
    title: "Close other tabs",
    description: "Close every tab except the current one. Pinned tabs stay.",
    synonyms: ["remove tabs", "keep only this tab"],
    section: "Tabs",
    scopes: GLOBAL,
  },
  nextTab: {
    title: "Next tab",
    description: "Switch to the tab on the right.",
    synonyms: ["cycle tabs", "switch tab", "tab forward"],
    section: "Tabs",
    scopes: GLOBAL,
  },
  previousTab: {
    title: "Previous tab",
    description: "Switch to the tab on the left.",
    synonyms: ["cycle tabs", "switch tab", "tab back"],
    section: "Tabs",
    scopes: GLOBAL,
  },
  nextTabAlt: {
    title: "Next tab (alternative)",
    description: "A second way to switch to the tab on the right.",
    synonyms: ["cycle tabs", "switch tab", "tab forward", "alternative"],
    section: "Tabs",
    scopes: GLOBAL,
  },
  previousTabAlt: {
    title: "Previous tab (alternative)",
    description: "A second way to switch to the tab on the left.",
    synonyms: ["cycle tabs", "switch tab", "tab back", "alternative"],
    section: "Tabs",
    scopes: GLOBAL,
  },
  quickJot: {
    title: "Quick jot",
    description: "Jot a thought down from anywhere. Refine it into a note later.",
    synonyms: ["capture", "new jot", "inbox", "scratch", "quick note"],
    section: "Create",
    scopes: GLOBAL,
  },
  create: {
    title: "Create",
    description: "Create a new item in the list or calendar you are on.",
    synonyms: ["new", "add", "new item", "linear"],
    section: "Create",
    scopes: ["lists", "calendar"],
  },
  newItem: {
    title: "Create (alternative)",
    description: "A second way to create a new item in the list or calendar you are on.",
    synonyms: ["new", "add", "new item", "alternative"],
    section: "Create",
    scopes: ["lists", "calendar"],
  },
  today: {
    title: "Go to today",
    description: "Jump the calendar to today.",
    synonyms: ["now", "current date", "calendar"],
    section: "Calendar",
    scopes: ["calendar"],
  },
  previousPeriod: {
    title: "Previous period",
    description: "Move the calendar back by a day, week or month, depending on the view.",
    synonyms: ["earlier", "back", "last week", "last month", "calendar"],
    section: "Calendar",
    scopes: ["calendar"],
  },
  nextPeriod: {
    title: "Next period",
    description: "Move the calendar forward by a day, week or month, depending on the view.",
    synonyms: ["later", "forward", "next week", "next month", "calendar"],
    section: "Calendar",
    scopes: ["calendar"],
  },
  viewDay: {
    title: "Day view",
    description: "Show the calendar as a single day.",
    synonyms: ["calendar view", "switch view", "one day"],
    section: "Calendar",
    scopes: ["calendar"],
  },
  viewWorkWeek: {
    title: "Work week view",
    description: "Show the calendar as a work week, Monday to Friday.",
    synonyms: ["calendar view", "switch view", "weekdays", "five days"],
    section: "Calendar",
    scopes: ["calendar"],
  },
  viewWeek: {
    title: "Week view",
    description: "Show the calendar as a full week.",
    synonyms: ["calendar view", "switch view", "seven days"],
    section: "Calendar",
    scopes: ["calendar"],
  },
  viewMonth: {
    title: "Month view",
    description: "Show the calendar as a month.",
    synonyms: ["calendar view", "switch view", "overview"],
    section: "Calendar",
    scopes: ["calendar"],
  },
  previousTask: {
    title: "Previous task",
    description: "Open the task above the current one in the list.",
    synonyms: ["up", "step", "move", "tasks"],
    section: "Tasks",
    scopes: ["task"],
  },
  nextTask: {
    title: "Next task",
    description: "Open the task below the current one in the list.",
    synonyms: ["down", "step", "move", "tasks"],
    section: "Tasks",
    scopes: ["task"],
  },
  newCard: {
    title: "Write cards",
    description: "Start writing new cards in the deck you have open.",
    synonyms: ["flashcards", "add card", "new card", "deck", "study"],
    section: "Study",
    scopes: ["deck"],
  },
  study: {
    title: "Study the deck",
    description: "Start a study session for the deck you have open.",
    synonyms: ["flashcards", "review", "learn", "practice", "deck"],
    section: "Study",
    scopes: ["deck"],
  },
} satisfies Record<ShortcutName, ShortcutMeta>;

export const SHORTCUT_NAMES: ShortcutName[] = Object.keys(HOTKEYS).filter(isShortcutName);

export function isShortcutName(name: string): name is ShortcutName {
  return Object.hasOwn(HOTKEYS, name);
}

export function shortcutSettingId<N extends ShortcutName>(name: N) {
  return `shortcuts.${name}` as const;
}

/// A shortcut the app owns and the user cannot move: it has its own listener (capture
/// phase, editor, or a mode with fixed meaning). Listed read only in Settings, and no
/// rebindable shortcut may take its keys.
export interface FixedShortcut {
  label: string;
  /// TanStack hotkey strings; each is one way to do it.
  keys: string[];
  scopes: ShortcutScope[];
}

export const FIXED_SHORTCUTS: FixedShortcut[] = [
  { label: "Copy", keys: ["Mod+C"], scopes: GLOBAL },
  { label: "Cut", keys: ["Mod+X"], scopes: GLOBAL },
  { label: "Paste", keys: ["Mod+V"], scopes: GLOBAL },
  { label: "Select all", keys: ["Mod+A"], scopes: GLOBAL },
  { label: "Undo", keys: ["Mod+Z"], scopes: GLOBAL },
  { label: "Redo", keys: ["Mod+Shift+Z", "Mod+Y"], scopes: GLOBAL },
  { label: "Close a dialog or menu, or stop editing", keys: ["Escape"], scopes: GLOBAL },
  { label: "Open the context menu", keys: ["ContextMenu", "Shift+F10"], scopes: GLOBAL },
  { label: "Submit a form or a card", keys: ["Mod+Enter"], scopes: GLOBAL },
  {
    label: "Move between rows",
    keys: ["ArrowUp", "ArrowDown", "J", "K"],
    scopes: ["lists"],
  },
  { label: "Find in a PDF", keys: ["Mod+F"], scopes: ["pdf"] },
  { label: "Show the answer, then rate Good", keys: ["Space", "Enter"], scopes: ["study"] },
  { label: "Rate a card", keys: ["1", "2", "3", "4"], scopes: ["study"] },
  { label: "Undo the last rating", keys: ["Z"], scopes: ["study"] },
];

export function scopesOverlap(a: readonly ShortcutScope[], b: readonly ShortcutScope[]): boolean {
  if (a.includes("global") || b.includes("global")) return true;
  return a.some((scope) => b.includes(scope));
}

function platformOf(mac: boolean) {
  return mac ? "mac" : "windows";
}

/// The canonical spelling, so `Shift+Mod+P` and `Mod+Shift+P` compare equal.
function canonical(hotkey: string, mac: boolean): string {
  try {
    return normalizeHotkey(hotkey, platformOf(mac));
  } catch {
    return hotkey;
  }
}

/// What `overrides` holds: a hotkey, or null for "unassigned". A shortcut that is
/// absent has no override and keeps its default.
export type ShortcutOverrides = Partial<Record<ShortcutName, string | null>>;
export type ShortcutMap = Record<ShortcutName, string | null>;

const logged = new Set<string>();

function logOnce(message: string) {
  if (logged.has(message)) return;
  logged.add(message);
  console.warn(message);
}

function fixedConflict(hotkey: string, scopes: readonly ShortcutScope[], mac: boolean) {
  const wanted = canonical(hotkey, mac);
  return FIXED_SHORTCUTS.find(
    (fixed) =>
      scopesOverlap(fixed.scopes, scopes) && fixed.keys.some((k) => canonical(k, mac) === wanted),
  );
}

/// The key every shortcut really has. Defaults come from `HOTKEYS`, an override replaces
/// one, and null stays unassigned. Two active shortcuts on one key in overlapping scopes
/// can never come out: an explicit override beats a default, earlier registry order beats
/// later, and every loser (or one that clashes with a fixed shortcut) becomes unassigned,
/// logged once. So a hand edited `settings.json` cannot create a double assignment.
export function resolveShortcuts(overrides: ShortcutOverrides, mac = IS_MAC): ShortcutMap {
  const resolved = new Map<ShortcutName, string | null>();
  const explicit = SHORTCUT_NAMES.filter((n) => overrides[n] != null);
  const implicit = SHORTCUT_NAMES.filter((n) => overrides[n] === undefined);
  const accepted: { name: ShortcutName; key: string }[] = [];
  for (const name of SHORTCUT_NAMES) if (overrides[name] === null) resolved.set(name, null);
  for (const name of [...explicit, ...implicit]) {
    const hotkey = overrides[name] ?? HOTKEYS[name];
    const key = canonical(hotkey, mac);
    const { scopes } = SHORTCUT_META[name];
    const fixed = fixedConflict(hotkey, scopes, mac);
    const rival = accepted.find(
      (a) => a.key === key && scopesOverlap(SHORTCUT_META[a.name].scopes, scopes),
    );
    if (fixed || rival) {
      resolved.set(name, null);
      logOnce(
        `Shortcut ${name} (${hotkey}) clashes with ${rival ? rival.name : fixed?.label}, leaving it unassigned`,
      );
      continue;
    }
    resolved.set(name, hotkey);
    accepted.push({ name, key });
  }
  // SAFETY: every name was resolved above, in registry order.
  return Object.fromEntries(SHORTCUT_NAMES.map((n) => [n, resolved.get(n) ?? null])) as ShortcutMap;
}

/// Whether two hotkeys are the same key press, however they are spelled.
export function hotkeyEquals(a: string, b: string, mac = IS_MAC): boolean {
  return canonical(a, mac) === canonical(b, mac);
}

export type Conflict = { kind: "shortcut"; name: ShortcutName } | { kind: "fixed"; label: string };

/// What already uses `hotkey` where `name` would be active, if anything. A fixed
/// shortcut wins over a rebindable one.
export function findConflict(
  map: ShortcutMap,
  name: ShortcutName,
  hotkey: string,
  mac = IS_MAC,
): Conflict | null {
  const { scopes } = SHORTCUT_META[name];
  const fixed = fixedConflict(hotkey, scopes, mac);
  if (fixed) return { kind: "fixed", label: fixed.label };
  const wanted = canonical(hotkey, mac);
  for (const other of SHORTCUT_NAMES) {
    const key = map[other];
    if (other === name || key === null) continue;
    if (canonical(key, mac) === wanted && scopesOverlap(SHORTCUT_META[other].scopes, scopes)) {
      return { kind: "shortcut", name: other };
    }
  }
  return null;
}

/// Valid syntax and a key TanStack knows (an unknown key is only a warning to it).
function isKnownHotkey(hotkey: string): boolean {
  const result = validateHotkey(hotkey);
  return result.valid && !result.warnings.some((w) => w.startsWith("Unknown key"));
}

export type BindingCheck = { ok: true } | { ok: false; message: string };

function hasCommandModifier(hotkey: string): boolean {
  const parsed = parseHotkey(hotkey);
  return parsed.ctrl || parsed.alt || parsed.meta;
}

/// Whether `hotkey` is a binding `name` may have: a hotkey TanStack can parse, and one
/// with Cmd, Ctrl or Alt unless the shortcut is a bare key today (a bare letter would
/// fire while someone is typing, so only shortcuts that are already bare may stay bare).
export function checkBinding(name: ShortcutName, hotkey: string): BindingCheck {
  if (!hotkey || !isKnownHotkey(hotkey)) {
    return { ok: false, message: "That key combination can't be used." };
  }
  try {
    const parsed = parseHotkey(hotkey);
    if (isModifierKey(parsed.key ?? "")) {
      return { ok: false, message: "Press a key together with the modifiers." };
    }
    const defaultIsBare = !hasCommandModifier(HOTKEYS[name]) && !/\+/.test(HOTKEYS[name]);
    if (!defaultIsBare && !hasCommandModifier(hotkey)) {
      return { ok: false, message: "Hold Cmd, Ctrl or Alt together with the key." };
    }
  } catch {
    return { ok: false, message: "That key combination can't be used." };
  }
  return { ok: true };
}

/// The TanStack hotkey for a key press, with Cmd on a Mac and Ctrl elsewhere as `Mod`;
/// null for a bare modifier (still being held) or a press with no usable key.
export function hotkeyFromEvent(event: KeyboardEvent, mac = IS_MAC): string | null {
  if (isModifierKey(normalizeKeyName(event.key))) return null;
  try {
    const hotkey = normalizeHotkeyFromEvent(event, platformOf(mac));
    return isKnownHotkey(hotkey) ? hotkey : null;
  } catch {
    return null;
  }
}

/// One keycap label per key, in the platform's usual order and symbols.
export function displayParts(hotkey: string, mac = IS_MAC): string[] {
  return formatForDisplay(hotkey, { platform: platformOf(mac), parts: true });
}

/// `⇧⌘P` on a Mac, `Ctrl+Shift+P` elsewhere.
export function displayText(hotkey: string, mac = IS_MAC): string {
  return displayParts(hotkey, mac).join(mac ? "" : "+");
}

const MODIFIER_WORDS = new Map([
  ["⌘", ["cmd", "command", "ctrl", "control"]],
  ["⌃", ["ctrl", "control"]],
  ["⌥", ["alt", "option"]],
  ["⇧", ["shift"]],
]);

/// Words someone would type to find a shortcut by its key: "cmd k", "ctrl shift p".
export function keySynonyms(hotkey: string | null): string[] {
  if (hotkey === null) return ["not set", "unassigned", "no shortcut"];
  const parts = displayParts(hotkey, true);
  const key = (parts.at(-1) ?? "").toLowerCase();
  const modifiers = parts.slice(0, -1);
  // One spelling per way a person might name the modifier set.
  const spellings = [0, 1, 2, 3].map((variant) =>
    modifiers.map((m) => {
      const words = MODIFIER_WORDS.get(m) ?? [m.toLowerCase()];
      return words[Math.min(variant, words.length - 1)];
    }),
  );
  const order = ["cmd", "command", "ctrl", "control", "alt", "option", "shift"];
  const phrases = spellings.map((words) =>
    [...words.toSorted((a, b) => order.indexOf(a) - order.indexOf(b)), key].join(" "),
  );
  const shiftFirst = spellings.map((words) => [...words, key].join(" "));
  return [...new Set([...phrases, ...shiftFirst])];
}
