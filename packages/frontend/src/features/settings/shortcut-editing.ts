import { create } from "zustand";
import { shortcutMap } from "#/hooks/use-shortcut.ts";
import { HOTKEYS } from "#/lib/hotkeys.ts";
import { type SettingChange, settings } from "#/lib/settings/settings.ts";
import {
  type ShortcutMap,
  type ShortcutName,
  SHORTCUT_NAMES,
  checkBinding,
  findConflict,
  hotkeyEquals,
  shortcutSettingId,
} from "#/lib/shortcuts.ts";

/// Changing a shortcut from Settings. Every change, from the recorder and from a row's
/// reset button alike, goes through `planShortcutChange`, so a double assignment can
/// only happen after the user confirmed it, and then the other shortcut is unassigned in
/// the same update.

export type ShortcutPlan =
  | { kind: "invalid"; message: string }
  /// A fixed shortcut owns the key; it can't be reassigned.
  | { kind: "fixed"; label: string }
  /// Another shortcut has the key. `changes` unassigns it first, then sets this one.
  | { kind: "conflict"; other: ShortcutName; changes: SettingChange[] }
  | { kind: "apply"; changes: SettingChange[] };

/// Setting `name` to `hotkey` stores an override, unless it is the default, which
/// stores nothing (so a later change of the default still reaches this user).
function setChange(name: ShortcutName, hotkey: string): SettingChange {
  const id = shortcutSettingId(name);
  return hotkeyEquals(hotkey, HOTKEYS[name]) ? { id, reset: true } : { id, value: hotkey };
}

/// What it takes to give `name` the key `hotkey` (or its default, for "default").
function planShortcutChange(
  map: ShortcutMap,
  name: ShortcutName,
  target: string | "default",
): ShortcutPlan {
  const hotkey = target === "default" ? HOTKEYS[name] : target;
  const check = checkBinding(name, hotkey);
  if (!check.ok) return { kind: "invalid", message: check.message };
  const conflict = findConflict(map, name, hotkey);
  if (conflict?.kind === "fixed") return { kind: "fixed", label: conflict.label };
  const own = setChange(name, hotkey);
  if (conflict) {
    const other = { id: shortcutSettingId(conflict.name), value: null } as const;
    // The other shortcut is unassigned before this one is set, so a failure in between
    // leaves a shortcut without a key, never two on one key.
    return { kind: "conflict", other: conflict.name, changes: [other, own] };
  }
  return { kind: "apply", changes: [own] };
}

interface Pending {
  name: ShortcutName;
  hotkey: string;
  other: ShortcutName;
  changes: SettingChange[];
}

/// The reassignment waiting for the user's answer in `ShortcutConflictDialog`.
export const usePendingShortcut = create<{ pending: Pending | null }>(() => ({ pending: null }));

/// Applies a change at once, or asks first when another shortcut has the key. Returns
/// the plan so the caller can show why a change was refused.
export function requestShortcutChange(
  name: ShortcutName,
  target: string | "default",
): ShortcutPlan {
  const plan = planShortcutChange(shortcutMap(), name, target);
  if (plan.kind === "apply") settings.apply(plan.changes);
  if (plan.kind === "conflict") {
    const hotkey = target === "default" ? HOTKEYS[name] : target;
    usePendingShortcut.setState({
      pending: { name, hotkey, other: plan.other, changes: plan.changes },
    });
  }
  return plan;
}

export function confirmPendingShortcut() {
  const { pending } = usePendingShortcut.getState();
  if (pending) settings.apply(pending.changes);
  usePendingShortcut.setState({ pending: null });
}

export function cancelPendingShortcut() {
  usePendingShortcut.setState({ pending: null });
}

/// Every shortcut back to its default.
export function resetAllShortcuts() {
  const stored = SHORTCUT_NAMES.map(shortcutSettingId);
  settings.apply(stored.map((id) => ({ id, reset: true })));
}
