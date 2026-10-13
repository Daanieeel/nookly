import type { HotkeyCallback, RegisterableHotkey } from "@tanstack/hotkeys";
import { type UseHotkeyOptions, useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { HOTKEYS } from "#/lib/hotkeys.ts";
import type { ShortcutName } from "#/lib/shortcuts.ts";
import { useContext } from "react";
import { TabGroupContext } from "#/components/tab-group-scope.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { useShortcut, useShortcutMap } from "./use-shortcut.ts";

/// Whether shortcuts registered here may fire: always outside a tab group, and only in
/// the focused group of a split, so a page open in both answers a key once.
function useInFocusedGroup(): boolean {
  const scope = useContext(TabGroupContext);
  const focusedGroupId = useNavStore((s) => s.focusedGroupId);
  return scope === null || scope.groupId === focusedGroupId;
}

/// Other listeners (capture phase handlers, editors) still need to see the event,
/// and handlers decide for themselves when to swallow the key.
const COMMON = { preventDefault: false, stopPropagation: false } as const;

/// The key to register for `name`: its binding, or its default while it is unassigned
/// (the registration is then disabled). A stored binding was validated by the setting's
/// schema, so it is a hotkey TanStack can parse.
function registrable(name: ShortcutName, hotkey: string | null): RegisterableHotkey {
  // SAFETY: `shortcuts.*` settings only hold strings `checkBinding` accepted.
  return (hotkey ?? HOTKEYS[name]) as RegisterableHotkey;
}

/// Every hook below takes the shortcut's name, never a key. The key is whatever the
/// user has bound it to, read live, so a change in Settings applies at once. An
/// unassigned shortcut registers nothing (it stays registered but disabled).

/// A shortcut that works from anywhere. The handler runs, then the key is swallowed.
export function useAppHotkey(
  name: ShortcutName,
  callback: HotkeyCallback,
  options: { enabled?: boolean } = {},
) {
  const hotkey = useShortcut(name);
  const active = useInFocusedGroup();
  useHotkey(
    registrable(name, hotkey),
    (event, context) => {
      event.preventDefault();
      callback(event, context);
    },
    { ...COMMON, ...options, enabled: active && hotkey !== null && (options.enabled ?? true) },
  );
}

/// Like `useAppHotkey`, but the callback decides whether to swallow the key (it may
/// need to leave it to a text field).
export function useRawHotkey(
  name: ShortcutName,
  callback: HotkeyCallback,
  options: { enabled?: boolean } = {},
) {
  const hotkey = useShortcut(name);
  const active = useInFocusedGroup();
  useHotkey(registrable(name, hotkey), callback, {
    ...COMMON,
    ...options,
    enabled: active && hotkey !== null && (options.enabled ?? true),
  });
}

function guarded(callback: HotkeyCallback): HotkeyCallback {
  return (event, context) => {
    if (document.querySelector("[role=dialog],[role=menu]")) return;
    event.preventDefault();
    callback(event, context);
  };
}

/// A single key shortcut for the current page. Steps aside while typing in a
/// field (the library skips inputs for single keys) and while a dialog or menu is open.
export function useScreenHotkey(
  name: ShortcutName,
  callback: HotkeyCallback,
  options: { enabled?: boolean } = {},
) {
  const hotkey = useShortcut(name);
  const active = useInFocusedGroup();
  useHotkey(registrable(name, hotkey), guarded(callback), {
    ...COMMON,
    ...options,
    enabled: active && hotkey !== null && (options.enabled ?? true),
  });
}

/// Several `useScreenHotkey`s at once, for a list whose length is fixed per page.
export function useScreenHotkeys(
  definitions: { shortcut: ShortcutName; callback: HotkeyCallback; options?: UseHotkeyOptions }[],
) {
  const map = useShortcutMap();
  const active = useInFocusedGroup();
  useHotkeys(
    definitions.map(({ shortcut, callback, options }) => ({
      hotkey: registrable(shortcut, map[shortcut]),
      callback: guarded(callback),
      options: {
        ...options,
        enabled: active && map[shortcut] !== null && (options?.enabled ?? true),
      },
    })),
    COMMON,
  );
}
