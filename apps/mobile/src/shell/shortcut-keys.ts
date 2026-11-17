import { useMemo } from "react";
import { z } from "zod";
import { usePreference } from "../data/preferences.ts";
import { SHORTCUTS, type Shortcut, type ShortcutId } from "./shortcuts.ts";

/// Changing a shortcut's keys from Settings (8.6), as the desktop's `shortcut-editing.ts`:
/// every change goes through `planKeys`, so two shortcuts never share keys unless asked, and
/// then the other one is left without a key in the same write. The changes stay on this
/// device, as the desktop's shortcuts stay on the computer.

const modifier = z.enum(["command", "shift", "option", "control"]);
const keysSchema = z.object({ key: z.string().min(1), modifiers: z.array(modifier) });

/// A key and the modifiers held with it, as the system writes them (`KeyShortcut`).
export type Keys = z.infer<typeof keysSchema>;

const changesSchema = z.array(z.object({ id: z.string(), keys: keysSchema.nullable() }));

/// One shortcut whose keys differ from Nookly's: `keys` null for one left without a key.
export interface KeyChange {
  id: ShortcutId;
  keys: Keys | null;
}

/// Where the changes are kept.
export const KEY_CHANGES = "shortcuts.keys";

/// What Settings needs of the keyboard: whether one is connected, and the next keys pressed.
export interface KeyRecorder {
  hasKeyboard(): boolean;
  onKeyboardChange(listener: (connected: boolean) => void): () => void;
  /// Hands every press to `listener` until the returned stop is called, and keeps it from
  /// the app's own shortcuts meanwhile.
  record(listener: (keys: Keys) => void): () => void;
}

/// Keys the system or a popover always uses, which no shortcut can take.
export const FIXED_KEYS: { label: string; keys: Keys }[] = [
  { label: "Copy", keys: { key: "c", modifiers: ["command"] } },
  { label: "Cut", keys: { key: "x", modifiers: ["command"] } },
  { label: "Paste", keys: { key: "v", modifiers: ["command"] } },
  { label: "Select All", keys: { key: "a", modifiers: ["command"] } },
  { label: "Undo", keys: { key: "z", modifiers: ["command"] } },
  { label: "Redo", keys: { key: "z", modifiers: ["command", "shift"] } },
  { label: "Done in a dialog", keys: { key: "\r", modifiers: ["command"] } },
  { label: "Close a popover or dialog", keys: { key: "UIKeyInputEscape", modifiers: [] } },
];

const ids = new Set<string>(SHORTCUTS.map((s) => s.id));
const isChange = (entry: { id: string; keys: Keys | null }): entry is KeyChange =>
  ids.has(entry.id);

export function sameKeys(a: Keys, b: Keys): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.modifiers.length === b.modifiers.length &&
    a.modifiers.every((m) => b.modifiers.includes(m))
  );
}

function defaultOf(id: ShortcutId): Keys {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  return { key: shortcut?.key ?? "", modifiers: shortcut?.modifiers ?? [] };
}

/// The keys `id` has with `changes`: its change, else Nookly's.
export function keysOf(changes: KeyChange[], id: ShortcutId): Keys | null {
  const change = changes.find((c) => c.id === id);
  return change ? change.keys : defaultOf(id);
}

/// Every shortcut with the keys it has, leaving out those without a key.
export function shortcutsWith(changes: KeyChange[]): Shortcut[] {
  return SHORTCUTS.flatMap((s) => {
    const keys = keysOf(changes, s.id);
    return keys ? [{ ...s, key: keys.key, modifiers: keys.modifiers }] : [];
  });
}

export type KeyPlan =
  | { kind: "invalid"; message: string }
  | { kind: "fixed"; label: string }
  /// Another shortcut has the keys: `next` leaves it without one and gives them to this.
  | { kind: "conflict"; other: ShortcutId; next: KeyChange[] }
  | { kind: "apply"; next: KeyChange[] };

/// `changes` with `id` on `keys`, storing nothing for Nookly's own keys, so a later change
/// of a default still reaches this device.
function withKeys(changes: KeyChange[], id: ShortcutId, keys: Keys | null): KeyChange[] {
  const rest = changes.filter((c) => c.id !== id);
  return keys && sameKeys(keys, defaultOf(id)) ? rest : [...rest, { id, keys }];
}

/// What it takes to give `id` the keys `keys`.
export function planKeys(changes: KeyChange[], id: ShortcutId, keys: Keys): KeyPlan {
  if (!keys.modifiers.some((m) => m !== "shift")) {
    return { kind: "invalid", message: "Hold Command, Control or Option together with the key." };
  }
  const fixed = FIXED_KEYS.find((f) => sameKeys(f.keys, keys));
  if (fixed) return { kind: "fixed", label: fixed.label };
  const other = SHORTCUTS.find((s) => {
    if (s.id === id) return false;
    const held = keysOf(changes, s.id);
    return held !== null && sameKeys(held, keys);
  });
  if (other) {
    return {
      kind: "conflict",
      other: other.id,
      next: withKeys(withKeys(changes, other.id, null), id, keys),
    };
  }
  return { kind: "apply", next: withKeys(changes, id, keys) };
}

/// Puts Nookly's keys back on `id`, asking first if another shortcut took them meanwhile.
export function planReset(changes: KeyChange[], id: ShortcutId): KeyPlan {
  return planKeys(changes, id, defaultOf(id));
}

/// The keys changed on this device, and a way to store new ones.
const NONE: z.infer<typeof changesSchema> = [];

export function useKeyChanges() {
  const [stored, write] = usePreference(KEY_CHANGES, changesSchema, NONE);
  const changes = useMemo(() => stored.filter(isChange), [stored]);
  return [changes, write] as const;
}
