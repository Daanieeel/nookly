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

interface Subscription {
  remove(): void;
}

interface NativeKeys {
  setShortcuts(items: { id: string; input: string; modifiers: string[]; title: string }[]): void;
  emit(id: string): void;
  setMenus(items: { title: string; ids: string[] }[]): void;
  hasKeyboard(): boolean;
  startRecording(): void;
  stopRecording(): void;
  addListener(event: "onShortcut", listener: (event: { id: string }) => void): Subscription;
  addListener(event: "onKeyboard", listener: (event: { connected: boolean }) => void): Subscription;
  addListener(
    event: "onRecorded",
    listener: (event: { input: string; modifiers: KeyShortcut["modifiers"] }) => void,
  ): Subscription;
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

/// The app's menus in the iPadOS menu bar, each listing shortcuts given to `setShortcuts`
/// by id. "File", "Edit", "View" and "Window" join the system's menus of that name.
export function setMenus(items: { title: string; ids: string[] }[]): void {
  native?.setMenus(items);
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

/// Whether a hardware keyboard is connected.
export function hasKeyboard(): boolean {
  return native?.hasKeyboard() ?? false;
}

/// Calls `listener` when a keyboard connects or disconnects. Returns how to stop.
export function onKeyboardChange(listener: (connected: boolean) => void): () => void {
  const subscription = native?.addListener("onKeyboard", (event) => listener(event.connected));
  return () => subscription?.remove();
}

/// Hands each key pressed (with the modifiers held) to `listener` instead of the app's own
/// shortcuts, until the returned stop is called. A modifier on its own is not a press.
export function record(
  listener: (keys: { key: string; modifiers: KeyShortcut["modifiers"] }) => void,
): () => void {
  const subscription = native?.addListener("onRecorded", (event) =>
    listener({ key: event.input, modifiers: event.modifiers }),
  );
  native?.startRecording();
  return () => {
    subscription?.remove();
    native?.stopRecording();
  };
}
