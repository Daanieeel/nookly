import { z } from "zod";
import type { ColumnSetting, SortRule, TableDisplay } from "./types.ts";

/// Reading the table layout's stored sort and columns, checking every entry like the rest
/// of a display, so an outdated or hand edited (CLI) one loses only what is invalid.

const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 800;

export const DEFAULT_TABLE: TableDisplay = { sort: [], columns: [] };

export function clampWidth(width: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));
}

const sortRule = z.object({ field: z.string().min(1), direction: z.enum(["asc", "desc"]) });
const column = z.object({
  field: z.string().min(1),
  width: z.number().finite().optional().catch(undefined),
});
/// A table as stored, its entries still unchecked one by one.
export const storedTable = z.object({
  sort: z.array(z.json()).catch([]),
  columns: z.array(z.json()).catch([]),
});

/// `stored` is the table part of a display as it was saved, still unchecked.
export function normalizeTableDisplay(stored: Partial<TableDisplay> | undefined): TableDisplay {
  const parsed = storedTable.safeParse(stored);
  return parsed.success ? readStoredTable(parsed.data) : DEFAULT_TABLE;
}

/// Keeps each sort rule and column that is still valid, every column once.
export function readStoredTable(stored: z.infer<typeof storedTable>): TableDisplay {
  const seen = new Set<string>();
  return {
    sort: stored.sort.flatMap((entry): SortRule[] => {
      const rule = sortRule.safeParse(entry);
      return rule.success ? [rule.data] : [];
    }),
    columns: stored.columns.flatMap((entry): ColumnSetting[] => {
      const read = column.safeParse(entry);
      if (!read.success || seen.has(read.data.field)) return [];
      seen.add(read.data.field);
      const { field, width } = read.data;
      return width === undefined ? [{ field }] : [{ field, width: clampWidth(width) }];
    }),
  };
}
