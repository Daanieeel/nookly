import { useScreenHotkey } from "#/hooks/use-app-hotkey.ts";
import { HOTKEYS } from "#/lib/hotkeys.ts";

/// C and Cmd/Ctrl+N run `create`, as in Linear, whenever nothing else has the keyboard.
export function useCreateShortcut(create: () => void) {
  useScreenHotkey(HOTKEYS.create, () => create());
  useScreenHotkey(HOTKEYS.newItem, () => create());
}
