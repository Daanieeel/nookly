import { type Store, load } from "@tauri-apps/plugin-store";
import { compareVersions } from "#/lib/changelog.ts";
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
  backfillLastSeenVersion();
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

/// The version everyone is sent back to once, so the What's new dialog lists every release
/// since the big jump that went unseen.
const WHATS_NEW_RESTART = "0.18.46";

/// One time backfill: the last seen version becomes `WHATS_NEW_RESTART`, so the update card
/// and What's new dialog cover every release after it. An older one (or none) already shows
/// at least that much. Runs once, guarded by a marker, on whichever release first loads it,
/// so a jump straight to a later release does the same.
function backfillLastSeenVersion() {
  if (cache.get(STORAGE_KEYS.lastSeenVersionBackfill) === "1") return;
  const seen = cache.get(STORAGE_KEYS.lastSeenVersion);
  if (seen === undefined || compareVersions(seen, WHATS_NEW_RESTART) > 0) {
    preferences.set(STORAGE_KEYS.lastSeenVersion, WHATS_NEW_RESTART);
  }
  preferences.set(STORAGE_KEYS.lastSeenVersionBackfill, "1");
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
