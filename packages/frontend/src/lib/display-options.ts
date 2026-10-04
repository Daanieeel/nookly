import { preferences } from "#/lib/preferences.ts";

/// Shared reading and validating of the remembered display options of the list and
/// board pages (Tasks, Assignments). Every field is checked again, so an outdated or
/// hand edited value falls back to its default instead of breaking the page.

export type PageLayout = "list" | "board";

export interface BaseDisplay<G extends string, O extends string> {
  layout: PageLayout;
  grouping: G;
  /// Always `"none"` without a grouping, and never the grouping itself.
  subGrouping: G;
  ordering: O;
  /// Remembered per layout: a board shows every column, a list hides empty groups.
  showEmpty: Record<PageLayout, boolean>;
  /// Board columns (group ids) the user hid. Only the board honors it.
  hiddenColumns: string[];
}

export const LAYOUTS: { id: PageLayout }[] = [{ id: "list" }, { id: "board" }];

export function pick<T extends string>(
  value: string | undefined,
  allowed: { id: T }[],
  fallback: T,
): T {
  return allowed.find((a) => a.id === value)?.id ?? fallback;
}

/// Drops a sub-grouping that no longer makes sense for `grouping`.
export function validSubGrouping<G extends string>(grouping: G, subGrouping: G): G {
  // SAFETY: every page's groupings include "none".
  return grouping === "none" || subGrouping === grouping ? ("none" as G) : subGrouping;
}

/// Checks the fields every page's display shares.
export function normalizeBaseDisplay<G extends string, O extends string>(
  stored: Partial<BaseDisplay<G, O>>,
  defaults: BaseDisplay<G, O>,
  groupings: { id: G }[],
  orderings: { id: O }[],
): BaseDisplay<G, O> {
  const layout = pick(stored.layout, LAYOUTS, defaults.layout);
  const rawGrouping = pick(stored.grouping, groupings, defaults.grouping);
  // A board always needs columns to group by.
  // SAFETY: every page's groupings include "status" (and "none"), the only values used here.
  const grouping = layout === "board" && rawGrouping === "none" ? ("status" as G) : rawGrouping;
  return {
    layout,
    grouping,
    subGrouping: validSubGrouping(
      grouping,
      pick(stored.subGrouping, groupings, defaults.subGrouping),
    ),
    ordering: pick(stored.ordering, orderings, defaults.ordering),
    showEmpty: {
      board: stored.showEmpty?.board !== false,
      list: stored.showEmpty?.list === true,
    },
    hiddenColumns: Array.isArray(stored.hiddenColumns)
      ? stored.hiddenColumns.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/// Reads display options saved under `key`, or `fallback` when none is saved or it
/// can't be read.
export function readStoredDisplay<D>(
  key: string,
  normalize: (stored: Partial<D>) => D,
  fallback: D,
): D {
  try {
    const raw = preferences.get(key);
    if (!raw) return fallback;
    // SAFETY: these keys are only ever written by their page's `write` function, and
    // `normalize` validates every field before use, so a stale shape only loses that field.
    return normalize(JSON.parse(raw) as Partial<D>);
  } catch {
    return fallback;
  }
}

/// The fields every card and row page's display has.
export interface CardDisplayBase<G extends string, O extends string> {
  layout: "grid" | "list";
  grouping: G;
  ordering: O;
}

/// Checks the fields the card and row pages (Bookmarks, Files) share.
export function normalizeCardDisplay<G extends string, O extends string>(
  stored: { layout?: string; grouping?: string; ordering?: string },
  defaults: { grouping: G; ordering: O },
  groupings: { id: G }[],
  orderings: { id: O }[],
): CardDisplayBase<G, O> {
  return {
    layout: stored.layout === "list" ? "list" : "grid",
    grouping: pick(stored.grouping, groupings, defaults.grouping),
    ordering: pick(stored.ordering, orderings, defaults.ordering),
  };
}
