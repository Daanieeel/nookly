/// The column a card dragged from `from` lands in: the columns it was carried across, the
/// board's own scrolling during the drag counted in, never past either end. `pitch` is a
/// column's width with the gap after it.
export function targetColumn(
  from: number,
  translationX: number,
  scrolled: number,
  pitch: number,
  count: number,
): number {
  "worklet";
  const to = from + Math.round((translationX + scrolled) / pitch);
  return Math.max(0, Math.min(count - 1, to));
}

/// How far the board scrolls by itself while a card is held near one of its edges, and
/// which way: nothing away from them, faster the closer the finger is.
export function edgeScroll(x: number, width: number, edge = 48, most = 14): number {
  "worklet";
  if (x < edge) return -Math.ceil(((edge - x) / edge) * most);
  if (x > width - edge) return Math.ceil(((x - (width - edge)) / edge) * most);
  return 0;
}
