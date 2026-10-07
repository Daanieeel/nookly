import {
  type ShortcutMap,
  type ShortcutName,
  type ShortcutOverrides,
  SHORTCUT_NAMES,
  displayText,
  resolveShortcuts,
  shortcutSettingId,
} from "#/lib/shortcuts.ts";
import { type Values, readSettingsValues, useSettingsValues } from "#/lib/settings/settings.ts";

/// The effective shortcut for every name, resolved from the settings store. Cached by
/// the store's `values` object, so every caller shares one map per change.
let cache: { values: Values; map: ShortcutMap } | null = null;

function mapFor(values: Values): ShortcutMap {
  if (cache?.values === values) return cache.map;
  const overrides: ShortcutOverrides = {};
  for (const name of SHORTCUT_NAMES) {
    const id = shortcutSettingId(name);
    if (Object.hasOwn(values, id)) overrides[name] = values[id];
  }
  cache = { values, map: resolveShortcuts(overrides) };
  return cache.map;
}

/// Every shortcut's effective key, for code that is not a hook.
export function shortcutMap(): ShortcutMap {
  return mapFor(readSettingsValues());
}

/// The key `name` has right now, or null while it is unassigned.
function shortcutHotkey(name: ShortcutName): string | null {
  return shortcutMap()[name];
}

/// The key as menu text (`⇧⌘P`, `Ctrl+Shift+P`), or undefined while unassigned.
export function shortcutLabel(name: ShortcutName): string | undefined {
  const hotkey = shortcutHotkey(name);
  return hotkey ? displayText(hotkey) : undefined;
}

/// The effective keys of every shortcut; re-renders when any of them changes.
export function useShortcutMap(): ShortcutMap {
  return useSettingsValues(mapFor);
}

/// The key `name` has, null while it is unassigned; re-renders only when it changes.
export function useShortcut(name: ShortcutName): string | null {
  return useSettingsValues((values) => mapFor(values)[name]);
}
