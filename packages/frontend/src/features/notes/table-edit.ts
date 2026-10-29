import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TableMap, addColumn, addRow, removeColumn, removeRow } from "@tiptap/pm/tables";

/// Edits of one table, each as a transaction (one undo step) or `null` when there is nothing
/// to do. `tablePos` is where the table node starts in the document; a row or column is
/// counted from 0, the header row being row 0. Tables here have no merged cells.

interface Located {
  table: ProseMirrorNode;
  /// Where the table's first row starts.
  start: number;
  map: TableMap;
}

function locate(state: EditorState, tablePos: number): Located | null {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table") return null;
  return { table, start: tablePos + 1, map: TableMap.get(table) };
}

const within = (index: number, count: number) =>
  Number.isInteger(index) && index >= 0 && index < count;

/// The rectangle the editing helpers of `prosemirror-tables` want.
function rectOf({ table, start, map }: Located) {
  return { map, table, tableStart: start, left: 0, top: 0, right: map.width, bottom: map.height };
}

export function tableSize(state: EditorState, tablePos: number) {
  const found = locate(state, tablePos);
  return found ? { rows: found.map.height, columns: found.map.width } : null;
}

/// A new empty row that becomes row `index` (`rows` puts it last).
export function addRowAt(state: EditorState, tablePos: number, index: number): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || !within(index, found.map.height + 1)) return null;
  return addRow(state.tr, rectOf(found), index);
}

/// A new empty column that becomes column `index` (`columns` puts it last).
export function addColumnAt(
  state: EditorState,
  tablePos: number,
  index: number,
): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || !within(index, found.map.width + 1)) return null;
  return addColumn(state.tr, rectOf(found), index);
}

/// Takes a row out. A table keeps at least one row.
export function removeRowAt(state: EditorState, tablePos: number, row: number): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || found.map.height <= 1 || !within(row, found.map.height)) return null;
  const tr = state.tr;
  removeRow(tr, rectOf(found), row);
  return tr;
}

/// Takes a column out. A table keeps at least one column.
export function removeColumnAt(
  state: EditorState,
  tablePos: number,
  column: number,
): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || found.map.width <= 1 || !within(column, found.map.width)) return null;
  const tr = state.tr;
  removeColumn(tr, rectOf(found), column);
  return tr;
}

/// A copy of a row, right below it.
export function duplicateRow(
  state: EditorState,
  tablePos: number,
  row: number,
): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || !within(row, found.map.height)) return null;
  let end = found.start;
  for (let i = 0; i <= row; i++) end += found.table.child(i).nodeSize;
  return state.tr.insert(end, found.table.child(row));
}

/// Where each cell of a column sits, last row first, so editing one never moves the next.
function columnCells(found: Located, tr: Transaction, column: number) {
  const { map, start } = found;
  const cells: { pos: number; node: ProseMirrorNode }[] = [];
  for (let row = map.height - 1; row >= 0; row--) {
    const pos = start + map.map[row * map.width + column];
    const node = tr.doc.nodeAt(pos);
    if (node) cells.push({ pos, node });
  }
  return cells;
}

/// A copy of a column, right beside it, in every row.
export function duplicateColumn(
  state: EditorState,
  tablePos: number,
  column: number,
): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || !within(column, found.map.width)) return null;
  const tr = state.tr;
  for (const { pos, node } of columnCells(found, tr, column)) tr.insert(pos + node.nodeSize, node);
  return tr;
}

function emptyCells(tr: Transaction, cells: { pos: number; node: ProseMirrorNode }[]) {
  for (const { pos, node } of cells) {
    const paragraph = node.type.schema.nodes.paragraph.create();
    tr.replaceWith(pos + 1, pos + 1 + node.content.size, paragraph);
  }
  return tr;
}

/// Empties every cell of a row; the cells stay.
export function clearRow(state: EditorState, tablePos: number, row: number): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || !within(row, found.map.height)) return null;
  const tr = state.tr;
  const cells = [];
  for (let col = found.map.width - 1; col >= 0; col--) {
    const pos = found.start + found.map.map[row * found.map.width + col];
    const node = tr.doc.nodeAt(pos);
    if (node) cells.push({ pos, node });
  }
  return emptyCells(tr, cells);
}

/// Empties every cell of a column; the cells stay.
export function clearColumn(
  state: EditorState,
  tablePos: number,
  column: number,
): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || !within(column, found.map.width)) return null;
  const tr = state.tr;
  return emptyCells(tr, columnCells(found, tr, column));
}

/// Moves a row to another place among the rows below the header, which stays put.
export function moveRow(
  state: EditorState,
  tablePos: number,
  from: number,
  to: number,
): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || from === to) return null;
  const { height } = found.map;
  if (from < 1 || to < 1 || from >= height || to >= height) return null;
  const rows = Array.from({ length: height }, (_, i) => found.table.child(i));
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  return state.tr.replaceWith(found.start, found.start + found.table.content.size, rows);
}

/// Moves a column to another place, in every row at once. Each row keeps its own kind of cell,
/// so the header cells stay the header. Works wherever the caret is.
export function moveColumnTo(
  state: EditorState,
  tablePos: number,
  from: number,
  to: number,
): Transaction | null {
  const found = locate(state, tablePos);
  if (!found || from === to) return null;
  const { width, height } = found.map;
  if (!within(from, width) || !within(to, width)) return null;
  const rows = Array.from({ length: height }, (_, r) => {
    const row = found.table.child(r);
    const cells = Array.from({ length: width }, (_, c) => row.child(c));
    const [moved] = cells.splice(from, 1);
    cells.splice(to, 0, moved);
    return row.copy(Fragment.from(cells));
  });
  return state.tr.replaceWith(found.start, found.start + found.table.content.size, rows);
}
