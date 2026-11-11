import { useCallback, useState } from "react";
import { z } from "zod";
import { preferences } from "#/lib/preferences.ts";

/// Favourite filters of a list page, kept for quick access above its table. Each is a
/// field a filter can be set on (Course, Label, ...), shown as a button that opens that
/// field's options. They are stored per device and per Space under `<key>:<spaceId>`
/// (see preference-keys.md), as a JSON array of field ids.

/// Earlier versions saved a whole filter, field and values. The field is all that is kept.
const stored = z.array(
  z.union([z.string(), z.object({ fieldId: z.string() }).transform((filter) => filter.fieldId)]),
);

/// The favourite fields saved under `key`; whatever cannot be read counts as none.
export function readQuickFilters(key: string): string[] {
  const raw = preferences.get(key);
  if (!raw) return [];
  try {
    const parsed = stored.safeParse(JSON.parse(raw));
    return parsed.success ? [...new Set(parsed.data)] : [];
  } catch {
    return [];
  }
}

function writeQuickFilters(key: string, fieldIds: string[]) {
  if (fieldIds.length === 0) preferences.remove(key);
  else preferences.set(key, JSON.stringify(fieldIds));
}

/// The favourites with `fieldId` added, or taken out when it is one already.
export function toggleFavorite(favorites: string[], fieldId: string): string[] {
  return favorites.includes(fieldId)
    ? favorites.filter((id) => id !== fieldId)
    : [...favorites, fieldId];
}

/// A page's favourite fields, saved as they change.
export function useQuickFilters(key: string) {
  const [favorites, setFavorites] = useState(() => readQuickFilters(key));
  const toggle = useCallback(
    (fieldId: string) =>
      setFavorites((current) => {
        const next = toggleFavorite(current, fieldId);
        writeQuickFilters(key, next);
        return next;
      }),
    [key],
  );
  return { favorites, toggle };
}
