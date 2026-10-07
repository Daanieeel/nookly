import { useCallback } from "react";
import { type Store, load } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { preferences } from "#/lib/preferences.ts";
import {
  SETTING_IDS,
  type SettingId,
  type SettingJson,
  type SettingValue,
  definitionOf,
  isSettingId,
} from "./registry.ts";

/// Hard settings, persisted with the Tauri store plugin as one flat, human readable
/// JSON object in `settings.json` in the app data folder, keyed by setting id.
/// Loaded once before the app renders, then read synchronously from memory; writes
/// update memory at once and reach disk shortly after. See docs/development/settings.md.

const FILE = "settings.json";

/// Null until the file loads. While null nothing is ever written, so a file that
/// failed to load is left exactly as it is.
let store: Store | null = null;

/// The valid values in the file, by id. A setting that isn't here is at its default.
export type Values = { [I in SettingId]?: SettingValue<I> };

const useSettingsStore = create<{ values: Values }>(() => ({ values: {} }));

function valueOf<I extends SettingId>(id: I, values = useSettingsStore.getState().values) {
  // SAFETY: `values[id]` only ever holds what `SETTINGS[id].parse` returned, and a
  // missing one is that same setting's default. A stored null is a value (a shortcut
  // left unassigned), not a missing one.
  return (Object.hasOwn(values, id) ? values[id] : definitionOf(id).default) as SettingValue<I>;
}

/// Stores an already validated value.
function withValue<I extends SettingId>(id: I, value: SettingValue<I>) {
  useSettingsStore.setState((s) => ({ values: { ...s.values, [id]: value } }));
}

function persist(write: (store: Store) => Promise<void>) {
  if (!store) return;
  write(store).catch((error) => console.error("Couldn't save settings", error));
}

/// One change in `settings.apply`: a new value, or back to the default. The value is
/// validated by the setting's own `parse`, so a wrong one becomes the default.
export type SettingChange = { id: SettingId; value: SettingJson } | { id: SettingId; reset: true };

export const settings = {
  get<I extends SettingId>(id: I): SettingValue<I> {
    return valueOf(id);
  },
  /// Stores `value`, falling back to the default when it isn't valid for `id`.
  set<I extends SettingId>(id: I, value: SettingValue<I>) {
    // SAFETY: `parse` of this id returns this id's value type.
    const parsed = definitionOf(id).parse(value) as SettingValue<I>;
    withValue(id, parsed);
    persist((s) => s.set(id, parsed));
  },
  /// Several changes as one update: memory changes together, and the file is written in
  /// the order given, stopping at the first failure so a later change never lands
  /// without the earlier ones.
  apply(changes: SettingChange[]) {
    const parsed = changes.map((change) =>
      "reset" in change
        ? { id: change.id, reset: true as const }
        : { id: change.id, value: definitionOf(change.id).parse(change.value) },
    );
    useSettingsStore.setState((s) => {
      const values: Values = { ...s.values };
      for (const change of parsed) {
        if ("reset" in change) delete values[change.id];
        else Object.assign(values, { [change.id]: change.value });
      }
      return { values };
    });
    persist(async (s) => {
      for (const change of parsed) {
        if ("reset" in change) await s.delete(change.id);
        else await s.set(change.id, change.value);
      }
    });
  },
  /// Back to the default, removed from the file.
  reset(id: SettingId) {
    useSettingsStore.setState((s) => {
      const values = { ...s.values };
      delete values[id];
      return { values };
    });
    persist((s) => s.delete(id).then(() => undefined));
  },
};

/// Calls `listener` with the new value whenever `id` changes. Returns the unsubscribe.
export function subscribeSetting<I extends SettingId>(
  id: I,
  listener: (value: SettingValue<I>) => void,
): () => void {
  return useSettingsStore.subscribe((state, previous) => {
    const next = valueOf(id, state.values);
    if (next !== valueOf(id, previous.values)) listener(next);
  });
}

/// Reads the settings store reactively. `select` must return something stable (a value,
/// or a cached object) or the caller re-renders on every change.
export function useSettingsValues<T>(select: (values: Values) => T): T {
  return useSettingsStore((s) => select(s.values));
}

/// The settings store's current values, for code that is not a hook.
export function readSettingsValues(): Values {
  return useSettingsStore.getState().values;
}

/// A setting's value and its setter, re-rendering when it changes from anywhere.
export function useSetting<I extends SettingId>(
  id: I,
): readonly [SettingValue<I>, (value: SettingValue<I>) => void] {
  const value = useSettingsStore((s) => valueOf(id, s.values));
  const set = useCallback((next: SettingValue<I>) => settings.set(id, next), [id]);
  return [value, set] as const;
}

/// Loads `settings.json`, then moves old preferences over. Must finish after
/// `initPreferences` and before anything reads a setting. When the file can't load,
/// every setting stays at its default and nothing is written.
export async function initSettings(): Promise<void> {
  let loaded: Store;
  let entries: [string, SettingJson][];
  try {
    loaded = await load(FILE, { defaults: {}, autoSave: 100 });
    entries = await loaded.entries<SettingJson>();
  } catch (error) {
    console.error("Couldn't load settings", error);
    return;
  }
  store = loaded;
  const inFile = new Set<string>();
  const values: Values = {};
  for (const [key, raw] of entries) {
    inFile.add(key);
    // SAFETY: `parse` of an id returns that id's value type; the loop only widens it.
    if (isSettingId(key)) Object.assign(values, { [key]: definitionOf(key).parse(raw) });
  }
  useSettingsStore.setState({ values });
  const stored = new Map(entries);
  for (const id of SETTING_IDS) await migrateRenamed(loaded, id, inFile, stored);
  for (const id of SETTING_IDS) await migrateLegacy(loaded, id, inFile);
}

/// Moves a renamed setting to its new id inside `settings.json`. The value is written
/// under the new id, saved, and read back from disk before the old id is deleted, so
/// a failure at any step leaves the old id to retry on the next launch. A value
/// already under the new id wins and the old one is just removed.
async function migrateRenamed(
  target: Store,
  id: SettingId,
  inFile: Set<string>,
  stored: Map<string, SettingJson>,
) {
  const def = definitionOf(id);
  for (const old of def.previousIds ?? []) {
    const raw = stored.get(old);
    if (raw === undefined) continue;
    try {
      if (!inFile.has(id)) {
        const value = def.parse(raw);
        await target.set(id, value);
        await target.save();
        await target.reload({ ignoreDefaults: true });
        const saved = await target.get<SettingJson>(id);
        if (JSON.stringify(saved) !== JSON.stringify(value)) {
          throw new Error(`${id} did not reach settings.json`);
        }
        useSettingsStore.setState((s) => ({ values: { ...s.values, ...{ [id]: value } } }));
        inFile.add(id);
      }
      await target.delete(old);
      await target.save();
    } catch (error) {
      console.error(`Couldn't rename ${old} to ${id}`, error);
    }
  }
}

/// Moves one setting out of `preferences.json`. The value is written to
/// `settings.json`, saved, and read back from disk before the old key is deleted,
/// so a failure at any step leaves the old key to retry on the next launch.
async function migrateLegacy(target: Store, id: SettingId, inFile: Set<string>) {
  const def = definitionOf(id);
  if (!def.legacyKey) return;
  const old = preferences.get(def.legacyKey);
  if (old === null) return;
  if (inFile.has(id)) {
    // Already moved by an earlier run that stopped before deleting the old key.
    preferences.remove(def.legacyKey);
    return;
  }
  try {
    const value = def.parse(def.fromLegacy ? def.fromLegacy(old) : old);
    await target.set(id, value);
    await target.save();
    await target.reload({ ignoreDefaults: true });
    const saved = await target.get<SettingJson>(id);
    if (JSON.stringify(saved) !== JSON.stringify(value)) {
      throw new Error(`${id} did not reach settings.json`);
    }
    useSettingsStore.setState((s) => ({ values: { ...s.values, ...{ [id]: value } } }));
    inFile.add(id);
  } catch (error) {
    console.error(`Couldn't move ${def.legacyKey} to settings`, error);
    return;
  }
  preferences.remove(def.legacyKey);
}
