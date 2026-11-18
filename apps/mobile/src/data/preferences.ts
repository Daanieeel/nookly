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

/// Changes to a page's filters and display that are not saved yet, by preference key: shown
/// at once, kept only in memory (so they outlive leaving the page, not the app), and measured
/// against `bases`: an opened View's own, else the page's saved one.
const drafts = new Map<string, unknown>();
const bases = new Map<string, { id: string; value: unknown }>();
const draftListeners = new Map<string, Set<() => void>>();
/// Bumped on every change, so a snapshot changes whenever a draft or base does.
const versions = new Map<string, number>();

function touch(key: string) {
  versions.set(key, (versions.get(key) ?? 0) + 1);
  for (const listener of draftListeners.get(key) ?? []) listener();
}

/// Drops every unsaved change (tests).
export function forgetDrafts() {
  drafts.clear();
  bases.clear();
  versions.clear();
}

const same = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

/// A page's filters and display as the desktop treats them: a change shows at once but is a
/// change (`dirty`) until `save` keeps it as what the page opens with, or `discard` drops it.
/// `open` shows a View and measures against it instead (null goes back to the page's own),
/// and `commit` makes what is shown the View's, once the page has saved it into the View.
export function useDraftPreference<T>(key: string, schema: z.ZodType<T>, fallback: T) {
  const [saved, write] = usePreference(key, schema, fallback);
  const subscribe = useCallback(
    (notify: () => void) => {
      const set = draftListeners.get(key) ?? new Set();
      set.add(notify);
      draftListeners.set(key, set);
      return () => {
        set.delete(notify);
      };
    },
    [key],
  );
  useSyncExternalStore(subscribe, () => versions.get(key) ?? 0);
  const view = bases.get(key);
  // SAFETY: only this hook writes drafts and bases under `key`, always as a T.
  const base = (view ? view.value : saved) as T;
  // SAFETY: as above.
  const value = (drafts.has(key) ? drafts.get(key) : base) as T;
  return {
    value,
    dirty: drafts.has(key) && !same(drafts.get(key), base),
    /// The View the page shows and compares with, if one is open.
    viewId: view?.id ?? null,
    set: (next: T) => {
      if (same(next, base)) drafts.delete(key);
      else drafts.set(key, next);
      touch(key);
    },
    discard: () => {
      drafts.delete(key);
      touch(key);
    },
    save: () => {
      write(value);
      drafts.delete(key);
      touch(key);
    },
    open: (opened: { id: string; value: T } | null) => {
      if (opened === null) bases.delete(key);
      else bases.set(key, opened);
      drafts.delete(key);
      touch(key);
    },
    commit: () => {
      if (view) bases.set(key, { id: view.id, value });
      drafts.delete(key);
      touch(key);
    },
  };
}
