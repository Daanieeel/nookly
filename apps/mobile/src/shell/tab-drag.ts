import { create } from "zustand";

/// Where a tab sits in its strip, as it laid out.
export interface TabSlot {
  x: number;
  width: number;
}

/// A tab let go where it was lifted shows its menu, as iPadOS's lift does.
export type TabDrop =
  | { kind: "reorder"; to: number }
  | { kind: "right" }
  | { kind: "menu" }
  | { kind: "none" };

/// How close to the window's right edge a dropped tab moves into a group of its own, as the
/// desktop's split drop zone.
export const SPLIT_EDGE = 96;
/// How far a lifted tab moves before it counts as dragged: let go nearer, its menu opens.
const STILL = 8;
/// A tab not laid out yet (only in tests): the strip's usual width for one.
const UNMEASURED = 160;

/// Where a tab lifted at `from` and carried `dx` along the strip (`x` across the window)
/// lands: at the window's right edge a new group, else the slot its middle is over.
export function tabDrop({
  slots,
  count,
  from,
  dx,
  dy,
  x,
  windowWidth,
}: {
  slots: (TabSlot | undefined)[];
  /// How many tabs the strip has (some may not have laid out yet).
  count: number;
  from: number;
  dx: number;
  dy: number;
  x: number;
  windowWidth: number;
}): TabDrop {
  if (x >= windowWidth - SPLIT_EDGE) return { kind: "right" };
  if (Math.abs(dx) < STILL && Math.abs(dy) < STILL) return { kind: "menu" };
  const placed = Array.from(
    { length: count },
    (_, i) => slots[i] ?? { x: i * UNMEASURED, width: UNMEASURED },
  );
  const own = placed[from];
  if (!own) return { kind: "none" };
  const middle = own.x + own.width / 2 + dx;
  const over = placed.findIndex((s) => middle < s.x + s.width);
  const to = over < 0 ? placed.length - 1 : over;
  return to === from ? { kind: "none" } : { kind: "reorder", to };
}

/// Whether a tab is being dragged, and whether it is over the right edge: the shell draws
/// the drop zone from it.
export const useTabDrag = create<{ dragging: boolean; overEdge: boolean }>(() => ({
  dragging: false,
  overEdge: false,
}));
