import type { HotkeyCallback, RegisterableHotkey } from "@tanstack/hotkeys";
import { type UseHotkeyDefinition, useHotkey, useHotkeys } from "@tanstack/react-hotkeys";

/// Other listeners (capture phase handlers, editors) still need to see the event,
/// and handlers decide for themselves when to swallow the key.
const COMMON = { preventDefault: false, stopPropagation: false } as const;

/// A shortcut that works from anywhere. The handler runs, then the key is swallowed.
export function useAppHotkey(
  hotkey: RegisterableHotkey,
  callback: HotkeyCallback,
  options: { enabled?: boolean } = {},
) {
  useHotkey(
    hotkey,
    (event, context) => {
      event.preventDefault();
      callback(event, context);
    },
    { ...COMMON, ...options },
  );
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
  hotkey: RegisterableHotkey,
  callback: HotkeyCallback,
  options: { enabled?: boolean } = {},
) {
  useHotkey(hotkey, guarded(callback), { ...COMMON, ...options });
}

/// Several `useScreenHotkey`s at once, for a list whose length is fixed per page.
export function useScreenHotkeys(definitions: UseHotkeyDefinition[]) {
  useHotkeys(
    definitions.map((d) => ({ ...d, callback: guarded(d.callback) })),
    COMMON,
  );
}
