import { SHARED_SETTINGS, type SettingJson, type SharedSettingId } from "@nookly/shared/settings";
import type { SyncedSetting } from "@nookly/shared/sync";
import type { JsonValue } from "@nookly/shared/api";
import type { SettingsBridge } from "@nookly/shared/sync";
import Storage from "expo-sqlite/kv-store";
import { useSyncExternalStore } from "react";
import type { z } from "zod";

/// The phone's settings: the same ids, words, defaults and checks as the desktop's
/// (`@nookly/shared/settings`), kept in the phone's key value store. The ones that
/// follow the account (`SYNCED_SETTINGS`) are mirrored into the synced rows by
/// `settingsBridge`; the rest stay on this phone.

export type SettingValue<I extends SharedSettingId> = z.infer<
  (typeof SHARED_SETTINGS)[I]["schema"]
>;

const keyOf = (id: string) => `nookly.setting.${id}`;
const listeners = new Set<(id: string) => void>();
/// Bumped on every change, so a component reading a setting re-renders.
let version = 0;

function read<I extends SharedSettingId>(id: I): SettingValue<I> {
  const def = SHARED_SETTINGS[id];
  const raw = Storage.getItemSync(keyOf(id));
  if (raw === null) {
    // SAFETY: the schema of `id` produces `SettingValue<I>`, and so does its default.
    return def.default as SettingValue<I>;
  }
  try {
    const parsed = def.schema.safeParse(JSON.parse(raw));
    // SAFETY: as above, for what the schema parsed.
    return (parsed.success ? parsed.data : def.default) as SettingValue<I>;
  } catch {
    // SAFETY: as above.
    return def.default as SettingValue<I>;
  }
}

function changed(id: string) {
  version += 1;
  for (const listener of listeners) listener(id);
}

function setJson(id: SharedSettingId, value: SettingJson): boolean {
  const parsed = SHARED_SETTINGS[id].schema.safeParse(value);
  if (!parsed.success) return false;
  Storage.setItemSync(keyOf(id), JSON.stringify(parsed.data));
  changed(id);
  return true;
}

export const phoneSettings = {
  get: read,
  /// Stores a JSON value for a setting by its id, for screens that edit every setting
  /// the same way; one that doesn't pass the setting's check is refused.
  setJson,
  /// Whether this setting was never changed (or put back), so it follows the default.
  isDefault: (id: SharedSettingId) => Storage.getItemSync(keyOf(id)) === null,
  /// Stores `value`; one that doesn't pass the setting's check is refused.
  set<I extends SharedSettingId>(id: I, value: SettingValue<I>) {
    return setJson(id, value);
  },
  reset(id: SharedSettingId) {
    Storage.removeItemSync(keyOf(id));
    changed(id);
  },
  subscribe(listener: (id: string) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/// A setting's JSON value, re-rendering when it changes anywhere, for generic controls.
export function useSettingJson(id: SharedSettingId): SettingJson {
  useSyncExternalStore(
    (notify) => phoneSettings.subscribe(notify),
    () => version,
  );
  return read(id);
}

/// A setting's value and a way to change it; re-renders when it changes anywhere.
export function useSetting<I extends SharedSettingId>(id: I) {
  useSyncExternalStore(
    (notify) => phoneSettings.subscribe(notify),
    () => version,
  );
  return [read(id), (value: SettingValue<I>) => phoneSettings.set(id, value)] as const;
}

/// The settings that follow the account, as the shared sync reads and writes them.
export const settingsBridge: SettingsBridge = {
  get: (key: SyncedSetting): JsonValue => read(key),
  isDefault: (key) => phoneSettings.isDefault(key),
  set(key, value) {
    if (value === undefined) phoneSettings.reset(key);
    else setJson(key, value);
  },
  subscribe: (listener) => phoneSettings.subscribe(listener),
};
