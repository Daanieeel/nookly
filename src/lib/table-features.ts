import {
  createSortedRowModel,
  metaHelper,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/// Per column layout read by `DataTable`, kept to fixed options so every class stays static.
export interface DataTableColumnMeta {
  label?: string;
  /// `fit` shrinks to content, `fill` takes the remaining width (content must truncate),
  /// `third` is `fill` capped at a third of the table from `md` up.
  width?: "fit" | "fill" | "third";
  /// Hides the column below this breakpoint so narrow windows reflow instead of scrolling.
  hideBelow?: "md" | "lg";
  align?: "end";
}

/// Client mode tables only (see docs/skills/data-tables.md §8): the full dataset is in
/// memory, so sorting runs locally. Add features here as tables start needing them.
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;
