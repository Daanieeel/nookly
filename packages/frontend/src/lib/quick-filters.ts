import { useCallback, useState } from "react";
import { z } from "zod";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { preferences } from "#/lib/preferences.ts";

/// Favourite filters of a list page, kept for quick access above its table. Each is a
/// whole filter as its chip shows it: a field, `is` or `isNot`, and the values. They are
/// stored per device and per Space under `<key>:<spaceId>` (see preference-keys.md).

const stored = z.array(
  z.object({
    fieldId: z.string(),
    operator: z.enum(["is", "isNot"]),
    values: z.array(z.string()).min(1),
  }),
);

/// The favourites saved under `key`; whatever cannot be read counts as none.
export function readQuickFilters(key: string): ActiveFilter[] {
  const raw = preferences.get(key);
  if (!raw) return [];
  try {
    const parsed = stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writeQuickFilters(key: string, filters: ActiveFilter[]) {
  if (filters.length === 0) preferences.remove(key);
  else preferences.set(key, JSON.stringify(filters));
}

/// Two filters are the same when they test the same field the same way for the same
/// values, whatever order the values are in.
export function sameFilter(a: ActiveFilter, b: ActiveFilter): boolean {
  return (
    a.fieldId === b.fieldId &&
    a.operator === b.operator &&
    a.values.length === b.values.length &&
    a.values.every((value) => b.values.includes(value))
  );
}

/// The favourites with `filter` added, or taken out when it is one already.
export function toggleFavorite(favorites: ActiveFilter[], filter: ActiveFilter): ActiveFilter[] {
  return favorites.some((f) => sameFilter(f, filter))
    ? favorites.filter((f) => !sameFilter(f, filter))
    : [...favorites, filter];
}

/// The active filters with `favorite` on, replacing any filter of its field, or off
/// when it is on already.
export function toggleQuickFilter(filters: ActiveFilter[], favorite: ActiveFilter): ActiveFilter[] {
  if (filters.some((f) => sameFilter(f, favorite))) {
    return filters.filter((f) => !sameFilter(f, favorite));
  }
  const taken = filters.some((f) => f.fieldId === favorite.fieldId);
  return taken
    ? filters.map((f) => (f.fieldId === favorite.fieldId ? favorite : f))
    : [...filters, favorite];
}

/// A page's favourite filters, saved as they change.
export function useQuickFilters(key: string) {
  const [favorites, setFavorites] = useState(() => readQuickFilters(key));
  const toggle = useCallback(
    (filter: ActiveFilter) =>
      setFavorites((current) => {
        const next = toggleFavorite(current, filter);
        writeQuickFilters(key, next);
        return next;
      }),
    [key],
  );
  return { favorites, toggle };
}
