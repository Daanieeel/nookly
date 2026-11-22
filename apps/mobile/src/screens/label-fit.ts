/// How many of a card's labels fit on its row, the others given up for an ellipsis badge. All
/// of them when they fit as they are; else as many as leave room for the ellipsis after
/// them, so the ellipsis stands where the last label would have been and the row never wraps.
/// `widths` are the labels' own widths, `more` the ellipsis badge's, `room` what the row has
/// for them.
export function labelsThatFit(widths: number[], more: number, room: number, gap = 4): number {
  const across = (count: number) =>
    widths.slice(0, count).reduce((sum, w) => sum + w, 0) + gap * Math.max(0, count - 1);
  if (across(widths.length) <= room) return widths.length;
  for (let count = widths.length - 1; count > 0; count--) {
    if (across(count) + gap + more <= room) return count;
  }
  return 0;
}
