import Storage from "expo-sqlite/kv-store";
import { useCallback, useSyncExternalStore } from "react";
import type { z } from "zod";

/// Things this phone remembers for itself (a list's grouping, a tab): a value of a known
/// shape in the key value store. Each is read from the store once and kept in memory, the
/// same value handed back until it changes, and a change wakes only what shows that one,
/// so changing a list's filter re-renders that list and nothing else.

interface Entry {
  raw: string | null;
  /// The value parsed for a schema and fallback, kept while those stay the same.
  parsed?: { schema: unknown; fallback: unknown; value: unknown };
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const keyOf = (key: string) => `nookly.preference.${key}`;

function entryOf(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { raw: Storage.getItemSync(keyOf(key)) };
    entries.set(key, entry);
  }
  return entry;
}

export function readPreference<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  const entry = entryOf(key);
  const { parsed } = entry;
  // A fallback written in place is a new object each render: the same by value counts.
  if (
    parsed &&
    parsed.schema === schema &&
    (parsed.fallback === fallback || JSON.stringify(parsed.fallback) === JSON.stringify(fallback))
  ) {
    // SAFETY: stored together with this very schema and fallback, which produced it as a T.
    return parsed.value as T;
  }
  let value = fallback;
  if (entry.raw !== null) {
    try {
      const result = schema.safeParse(JSON.parse(entry.raw));
      if (result.success) value = result.data;
    } catch {
      // Unreadable: the fallback stands.
    }
  }
  entry.parsed = { schema, fallback, value };
  return value;
}

export function writePreference<T>(key: string, value: T) {
  const raw = JSON.stringify(value);
  Storage.setItemSync(keyOf(key), raw);
  entries.set(key, { raw });
  for (const listener of listeners.get(key) ?? []) listener();
}

/// Drops what is kept in memory, so the next read goes to the store (tests, which empty
/// the store between them).
export function forgetPreferences() {
  entries.clear();
}

/// The remembered value and a way to change it.
export function usePreference<T>(key: string, schema: z.ZodType<T>, fallback: T) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(notify);
      listeners.set(key, set);
      return () => {
        set.delete(notify);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(subscribe, () => readPreference(key, schema, fallback));
  const write = useCallback((next: T) => writePreference(key, next), [key]);
  return [value, write] as const;
}
