import { requireOptionalNativeModule } from "expo";

/// A shortcut for the system: `key` is a character ("k") or one of the system's names
/// ("UIKeyInputEscape", "UIKeyInputLeftArrow"), `modifiers` any of command, shift, option,
/// control. `title` is what the sheet shown by holding Command lists.
export interface KeyShortcut {
  id: string;
  key: string;
  modifiers: ("command" | "shift" | "option" | "control")[];
  title: string;
}

interface NativeKeys {
  setShortcuts(items: { id: string; input: string; modifiers: string[]; title: string }[]): void;
  emit(id: string): void;
  addListener(
    event: "onShortcut",
    listener: (event: { id: string }) => void,
  ): {
    remove(): void;
  };
}

// Missing in a build without the module (Expo Go, tests, a phone with no keyboard to speak of).
const native = requireOptionalNativeModule<NativeKeys>("NooklyKeys");

/// Whether this build can receive keyboard shortcuts at all.
export const keysAvailable = native !== null;

/// Replaces the shortcuts the system knows about.
export function setShortcuts(items: KeyShortcut[]): void {
  native?.setShortcuts(
    items.map(({ id, key, modifiers, title }) => ({ id, input: key, modifiers, title })),
  );
}

/// Calls `listener` with the id of a shortcut when it is pressed. Returns how to stop.
export function onShortcut(listener: (id: string) => void): () => void {
  const subscription = native?.addListener("onShortcut", (event) => listener(event.id));
  return () => subscription?.remove();
}

/// Acts as if the shortcut was pressed (checks that cannot press keys).
export function emitShortcut(id: string): void {
  native?.emit(id);
}
