/// The cells of the row or column (counted from 1) a link to a table points at, in the DOM of
/// the table block. Nothing when the table has no such row or column anymore, so a link to a
/// part that is gone still opens the table.
export function tablePartElements(
  block: HTMLElement,
  part: { row?: number; column?: number },
): HTMLElement[] {
  const rows = Array.from(block.querySelectorAll("tr"));
  if (part.row !== undefined) {
    return Array.from(rows[part.row - 1]?.cells ?? []);
  }
  if (part.column !== undefined) {
    return rows.flatMap((row) => row.cells[(part.column ?? 0) - 1] ?? []);
  }
  return [];
}
