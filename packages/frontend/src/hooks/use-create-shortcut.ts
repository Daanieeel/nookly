import { useScreenHotkey } from "#/hooks/use-app-hotkey.ts";
import { HOTKEYS } from "#/lib/hotkeys.ts";

/// C runs `create`, as in Linear, whenever nothing else has the keyboard.
export function useCreateShortcut(create: () => void) {
  useScreenHotkey(HOTKEYS.create, () => create());
}
