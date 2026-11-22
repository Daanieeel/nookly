import { z } from "zod";
import type { ActiveFilter, FilterJoin, FilterOperator } from "#/components/filter-menu.tsx";

/// What a saved View remembers of its page: the applied filters and the display
/// options (layout, grouping, hidden columns...). `D` is the module's own
/// `DisplayOptions`.
export interface ViewConfig<D> {
  filters: ActiveFilter[];
  display: D;
  /// The text in the page's search field, for pages that have one (Files).
  query?: string;
}

interface StoredConfig<D> {
  filters?: { fieldId?: string; operator?: string; values?: string[]; join?: string }[];
  display?: Partial<D>;
  query?: unknown;
}

const OPERATORS: FilterOperator[] = ["is", "isNot"];
const JOINS: FilterJoin[] = ["and", "or"];

/// Reads a View's JSON back, checking every field like `readDisplay` does, so an
/// outdated or hand edited (CLI) config loses only what is invalid.
export function parseViewConfig<D>(
  raw: string,
  normalizeDisplay: (stored: Partial<D>) => D,
): ViewConfig<D> {
  let stored: StoredConfig<D> = {};
  try {
    // SAFETY: the shape is only a guess at what was saved, and every field is
    // validated below before use.
    stored = JSON.parse(raw) as StoredConfig<D>;
  } catch {
    // An unreadable config opens as the module's defaults.
  }
  const filters = Array.isArray(stored.filters) ? stored.filters : [];
  return {
    filters: filters.flatMap((f) => {
      const operator = OPERATORS.find((o) => o === f.operator);
      if (!f.fieldId || !operator || !Array.isArray(f.values)) return [];
      const join = JOINS.find((j) => j === f.join);
      return [
        {
          fieldId: f.fieldId,
          operator,
          values: f.values.filter((v): v is string => typeof v === "string"),
          ...(join && { join }),
        },
      ];
    }),
    display: normalizeDisplay(stored.display ?? {}),
    query: z.string().safeParse(stored.query).data || undefined,
  };
}

export function serializeViewConfig<D>(
  filters: ActiveFilter[],
  display: D,
  query?: string,
): string {
  // Left out when empty, so a View without search text reads the same as before.
  return JSON.stringify({ filters, display, ...(query && { query }) } satisfies ViewConfig<D>);
}

/// Whether the page differs from what the View saved.
export function sameViewConfig<D>(a: ViewConfig<D>, b: ViewConfig<D>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
