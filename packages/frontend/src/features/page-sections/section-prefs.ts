import { useMemo } from "react";
import { z } from "zod";
import { create } from "zustand";
import { normalizeTableDisplay } from "#/features/views/engine/table-display.ts";
import type { TableDisplay } from "#/features/views/engine/types.ts";
import { addMissingDefaults } from "#/lib/ordered-prefs.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

/// How the user arranged the sections of one page type (every Course page alike): their
/// order, which are hidden, which are folded, and each section's table sort and columns.
/// Kept per device in `nookly:page-sections`, like the sidebar's order.

export interface SectionPref {
  id: string;
  hidden: boolean;
  collapsed: boolean;
  /// The section's table sort and columns, once the user changed them.
  table?: TableDisplay;
}

const storedSection = z.object({
  id: z.string().min(1),
  hidden: z.json().optional(),
  collapsed: z.json().optional(),
  table: z.json().optional(),
});
const storedSections = z.array(z.json());
/// Every page type's list, by entity type. A type this version doesn't know is kept as is.
const storedAll = z.record(z.string(), z.json());

/// The stored list of one page type, checked entry by entry against `defaultIds`.
export function normalizeSectionPrefs(defaultIds: readonly string[], stored: unknown): SectionPref[] {
  const list = storedSections.safeParse(stored);
  const kept: SectionPref[] = [];
  for (const entry of list.success ? list.data : []) {
    const parsed = storedSection.safeParse(entry);
    if (!parsed.success) continue;
    const { id, hidden, collapsed, table } = parsed.data;
    if (!defaultIds.includes(id) || kept.some((k) => k.id === id)) continue;
    const pref: SectionPref = { id, hidden: hidden === true, collapsed: collapsed === true };
    if (typeof table === "object" && table !== null) pref.table = normalizeTableDisplay(table);
    kept.push(pref);
  }
  return addMissingDefaults(defaultIds, kept, (id) => ({ id, hidden: false, collapsed: false }));
}

function readAll(): Record<string, unknown> {
  try {
    const raw = preferences.get(STORAGE_KEYS.pageSections);
    const parsed = raw ? storedAll.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : {};
  } catch {
    // An unreadable value opens every page with its defaults.
    return {};
  }
}

export function readSectionPrefs(entityType: string, defaultIds: readonly string[]): SectionPref[] {
  return normalizeSectionPrefs(defaultIds, readAll()[entityType]);
}

/// Saves one page type's list, leaving every other type's as it was stored.
export function writeSectionPrefs(entityType: string, prefs: SectionPref[]): void {
  preferences.set(STORAGE_KEYS.pageSections, JSON.stringify({ ...readAll(), [entityType]: prefs }));
  useSectionPrefsVersion.setState((s) => ({ version: s.version + 1 }));
}

/// Bumped on every save, so each page showing those sections reads them again.
const useSectionPrefsVersion = create<{ version: number }>(() => ({ version: 0 }));

/// The sections of `entityType` as the user arranged them, and a way to change them.
export function useSectionPrefs(entityType: string, defaultIds: readonly string[]) {
  const version = useSectionPrefsVersion((s) => s.version);
  const prefs = useMemo(
    () => readSectionPrefs(entityType, defaultIds),
    // `version` changes on every save, which is when the stored value does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, defaultIds, version],
  );
  const save = (next: SectionPref[]) => writeSectionPrefs(entityType, next);
  const update = (id: string, patch: Partial<Omit<SectionPref, "id">>) =>
    save(prefs.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return { prefs, save, update };
}
