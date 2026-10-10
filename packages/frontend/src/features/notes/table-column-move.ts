import type { EditorState, Transaction } from "@tiptap/pm/state";
import { findTable, moveTableColumn, TableMap } from "@tiptap/pm/tables";

/// Moves the column at index `from` of the table starting at `tablePos` to index `to`,
/// in every row at once. The header row stays the header: its cells are columns like the
/// rest. Returns whether anything moved (not for the same column, or one that is not there).
export function moveColumn(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  tablePos: number,
  from: number,
  to: number,
): boolean {
  if (from === to) return false;
  // `pos` only has to sit inside the table to find it.
  const table = findTable(state.doc.resolve(tablePos + 1));
  if (!table) return false;
  const { width } = TableMap.get(table.node);
  if (from < 0 || to < 0 || from >= width || to >= width) return false;
  return moveTableColumn({ from, to, pos: tablePos + 1, select: false })(state, dispatch);
}

/// Where a column picked up at `from` ends up when dropped on the half of column `target`
/// on the side `before` says: the index to hand to `moveColumn`. Dropping a column back
/// where it came from gives `from` itself, which moves nothing.
export function dropIndex(from: number, target: number, before: boolean): number {
  // The gap between columns the drop points at, counted from the left edge of the table.
  const gap = before ? target : target + 1;
  // Taking the column out first shifts every column after it one place to the left.
  return from < gap ? gap - 1 : gap;
}
