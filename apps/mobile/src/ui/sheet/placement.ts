/// Where a popover goes on a tablet (D83, 2.1): under what opened it, lined up with its
/// left edge; above it, or beside it, where there is more room; never over it; 12 from the
/// window's edges and above the keyboard. Pure, for tests and the popover's frame.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /// The tallest it may be there; its content scrolls past it.
  maxHeight: number;
  side: "below" | "above" | "right" | "left";
}

/// The room kept to the window's edges.
export const EDGE = 12;
/// The gap between the anchor and the popover.
export const GAP = 8;

export function placePopover({
  anchor,
  size,
  window,
  keyboard = 0,
}: {
  anchor: Rect;
  size: { width: number; height: number };
  window: { width: number; height: number };
  keyboard?: number;
}): Placement {
  const bottomLimit = window.height - Math.max(EDGE, keyboard + EDGE);
  const below = bottomLimit - (anchor.y + anchor.height + GAP);
  const above = anchor.y - GAP - EDGE;
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, window.width - EDGE - size.width));
  const fitsBelow = below >= size.height;
  const fitsAbove = above >= size.height;
  // Too little room either way for even a short list: beside it.
  const minimum = Math.min(size.height, 160);
  if (below < minimum && above < minimum) {
    const right = window.width - EDGE - (anchor.x + anchor.width + GAP);
    const side = right >= size.width || right >= anchor.x - GAP - EDGE ? "right" : "left";
    const left = side === "right" ? anchor.x + anchor.width + GAP : anchor.x - GAP - size.width;
    const room = bottomLimit - EDGE;
    const top = Math.max(EDGE, Math.min(anchor.y, bottomLimit - Math.min(size.height, room)));
    return { left: Math.max(EDGE, left), top, maxHeight: bottomLimit - top, side };
  }
  if (fitsBelow || (!fitsAbove && below >= above)) {
    const top = anchor.y + anchor.height + GAP;
    return { left: clampX(anchor.x), top, maxHeight: bottomLimit - top, side: "below" };
  }
  const height = Math.min(size.height, above);
  return {
    left: clampX(anchor.x),
    top: anchor.y - GAP - height,
    maxHeight: above,
    side: "above",
  };
}
