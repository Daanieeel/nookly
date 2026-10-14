import Storage from "expo-sqlite/kv-store";
import { useSyncExternalStore } from "react";
import type { z } from "zod";

/// Things this phone remembers for itself (a list's grouping, a tab): a value of a known
/// shape in the key value store, re-read by every component that shows it.

const listeners = new Set<() => void>();
let version = 0;
const keyOf = (key: string) => `nookly.preference.${key}`;

export function readPreference<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  const raw = Storage.getItemSync(keyOf(key));
  if (raw === null) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference<T>(key: string, value: T) {
  Storage.setItemSync(keyOf(key), JSON.stringify(value));
  version += 1;
  for (const listener of listeners) listener();
}

/// The remembered value and a way to change it.
export function usePreference<T>(key: string, schema: z.ZodType<T>, fallback: T) {
  useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => version,
  );
  return [
    readPreference(key, schema, fallback),
    (value: T) => writePreference(key, value),
  ] as const;
}
