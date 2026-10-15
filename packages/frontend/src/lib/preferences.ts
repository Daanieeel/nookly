import { type Store, load } from "@tauri-apps/plugin-store";
import { z } from "zod";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

/// Device preferences (theme, sidebar state, sort orders...), persisted with the
/// Tauri store plugin in `preferences.json` in the app data folder. Loaded once
/// before the app renders, then read synchronously from memory; writes update
/// memory at once and reach disk shortly after. Keys are in `STORAGE_KEYS`.

const FILE = "preferences.json";

let store: Store | null = null;
const cache = new Map<string, string>();

/// Loads every saved preference. Must finish before anything reads one; when
/// the store can't load, every read falls back to its default.
export async function initPreferences(): Promise<void> {
  try {
    store = await load(FILE, { defaults: {}, autoSave: 100 });
    for (const [key, value] of await store.entries<string>()) cache.set(key, value);
  } catch (error) {
    console.error("Couldn't load preferences", error);
    return;
  }
  backfillFileViewerTheme();
  backfillEvaluatedStatus();
}

/// One time backfill: a saved "light" file viewer theme becomes the defaults.
/// Runs once, guarded by a marker, so a light theme picked afterwards stays.
/// Any other value, or none, is left as it is.
function backfillFileViewerTheme() {
  if (cache.get(STORAGE_KEYS.fileViewerThemeBackfill) === "1") return;
  if (cache.get(STORAGE_KEYS.fileViewerTheme) === "light") {
    preferences.set(STORAGE_KEYS.fileViewerTheme, "defaults");
  }
  preferences.set(STORAGE_KEYS.fileViewerThemeBackfill, "1");
}

const savedFilters = z.array(
  z.looseObject({ fieldId: z.string(), operator: z.string(), values: z.array(z.string()) }),
);
type SavedFilters = z.infer<typeof savedFilters>;
const savedDisplay = z.looseObject({
  grouping: z.string().optional(),
  hiddenColumns: z.array(z.string()).optional(),
});
type SavedDisplay = z.infer<typeof savedDisplay>;

const evaluated = (id: string) => (id === "graded" ? "evaluated" : id);

/// Rewrites the value saved under `key` when it reads as `schema`; anything else is left
/// as it is, since the page falls back to its defaults for what it cannot read.
function rewrite<T>(key: string, schema: z.ZodType<T>, change: (saved: T) => T) {
  const raw = cache.get(key);
  if (raw === undefined) return;
  let before: string;
  let after: string;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return;
    before = JSON.stringify(parsed.data);
    after = JSON.stringify(change(parsed.data));
  } catch {
    return;
  }
  if (after !== before) preferences.set(key, after);
}

/// The assignment status `graded` was renamed `evaluated`. Saved views are rewritten in
/// the database; this does the same for what the pages remember on this device: their
/// status filters (one key per Space, and one for the overview) and the hidden columns of
/// a board grouped by status. The grade filter is also called `graded` and stays. Nothing
/// is written when nothing matches, so it is safe to run on every launch.
function backfillEvaluatedStatus() {
  const filterKeys = [STORAGE_KEYS.assignmentsFilters, STORAGE_KEYS.assignmentsOverviewFilters];
  for (const key of [...cache.keys()]) {
    if (!filterKeys.some((base) => key === base || key.startsWith(`${base}:`))) continue;
    rewrite<SavedFilters>(key, savedFilters, (filters) =>
      filters.map((filter) =>
        filter.fieldId === "status" ? { ...filter, values: filter.values.map(evaluated) } : filter,
      ),
    );
  }
  for (const key of [STORAGE_KEYS.assignmentsDisplay, STORAGE_KEYS.assignmentsOverview]) {
    rewrite<SavedDisplay>(key, savedDisplay, (display) =>
      display.grouping === "status" && display.hiddenColumns
        ? { ...display, hiddenColumns: display.hiddenColumns.map(evaluated) }
        : display,
    );
  }
}

function persist(write: (store: Store) => Promise<void | boolean>) {
  if (!store) return;
  write(store).catch((error) => console.error("Couldn't save preferences", error));
}

export const preferences = {
  get(key: string): string | null {
    return cache.get(key) ?? null;
  },
  set(key: string, value: string) {
    cache.set(key, value);
    persist((s) => s.set(key, value));
  },
  remove(key: string) {
    cache.delete(key);
    persist((s) => s.delete(key));
  },
};
