import type { ActiveFilter, FilterOperator } from "#/components/filter-menu.tsx";

/// What a saved View remembers of its page: the applied filters and the display
/// options (layout, grouping, hidden columns...). `D` is the module's own
/// `DisplayOptions`.
export interface ViewConfig<D> {
  filters: ActiveFilter[];
  display: D;
}

interface StoredConfig<D> {
  filters?: { fieldId?: string; operator?: string; values?: string[] }[];
  display?: Partial<D>;
}

const OPERATORS: FilterOperator[] = ["is", "isNot"];

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
      return [
        {
          fieldId: f.fieldId,
          operator,
          values: f.values.filter((v): v is string => typeof v === "string"),
        },
      ];
    }),
    display: normalizeDisplay(stored.display ?? {}),
  };
}

export function serializeViewConfig<D>(filters: ActiveFilter[], display: D): string {
  return JSON.stringify({ filters, display } satisfies ViewConfig<D>);
}

/// Whether the page differs from what the View saved.
export function sameViewConfig<D>(a: ViewConfig<D>, b: ViewConfig<D>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
