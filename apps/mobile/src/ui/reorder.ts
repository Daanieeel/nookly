/// The arithmetic of dragging a row (or an icon) to a new place in a list of equal sizes.
/// Plain numbers, so it runs on the UI thread as the finger moves (`"worklet"`).

/// `ids` with the one at `from` taken out and put back at `to`.
export function moveItem<T>(ids: T[], from: number, to: number): T[] {
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/// Where a row that started at `from` and was dragged `offset` lands: the nearest slot,
/// held to the list.
export function slotAt(from: number, offset: number, size: number, count: number): number {
  "worklet";
  return Math.min(count - 1, Math.max(0, Math.round(from + offset / size)));
}

/// How far the row at `index` steps aside while the one from `from` hovers over `to`.
export function shiftFor(index: number, from: number, to: number, size: number): number {
  "worklet";
  if (from < to && index > from && index <= to) return -size;
  if (from > to && index < from && index >= to) return size;
  return 0;
}
