import { useScreenHotkey } from "#/hooks/use-app-hotkey.ts";

/// C and Cmd/Ctrl+N run `create`, as in Linear, whenever nothing else has the keyboard.
/// Both keys are shortcuts the user can rebind in Settings.
export function useCreateShortcut(create: () => void) {
  useScreenHotkey("create", () => create());
  useScreenHotkey("newItem", () => create());
}
