/// How many slots the Space row at the bottom of the sidebar has. The sidebar has a
/// fixed width, so this is fixed too.
export const SPACE_SLOTS = 4;

/// With more Spaces than slots, the last slot turns into the overflow button.
const VISIBLE_WITH_OVERFLOW = SPACE_SLOTS - 1;

export interface SpaceRow<T> {
  /// The Spaces that get an icon in the row, in order.
  visible: T[];
  /// The Spaces listed in the overflow popover, in their stored order.
  overflow: T[];
  /// The visible Space the active one took the last slot from, if it did. Dropping on
  /// that temporary slot inserts before this Space.
  displaced: T | null;
}

/// Splits the stored order into the row and the overflow. A Space in the overflow that is
/// active temporarily takes the last visible slot; the stored order is never touched, so
/// going back to a visible Space restores the original row.
export function spaceRow<T extends { id: string }>(
  spaces: T[],
  activeId: string | null,
): SpaceRow<T> {
  if (spaces.length <= SPACE_SLOTS) return { visible: spaces, overflow: [], displaced: null };
  const visible = spaces.slice(0, VISIBLE_WITH_OVERFLOW);
  const active = spaces.slice(VISIBLE_WITH_OVERFLOW).find((s) => s.id === activeId);
  if (!active) return { visible, overflow: spaces.slice(VISIBLE_WITH_OVERFLOW), displaced: null };
  const shown = [...visible.slice(0, -1), active];
  return {
    visible: shown,
    overflow: spaces.filter((s) => !shown.includes(s)),
    displaced: visible[VISIBLE_WITH_OVERFLOW - 1] ?? null,
  };
}

/// The Space one step before or after `activeId` in the whole stored order, hidden ones
/// included. At either end it stays put, or wraps around when `wrap` is set. Without a
/// known active Space it lands on the first.
export function cycleSpaceId(
  ids: string[],
  activeId: string | null,
  step: 1 | -1,
  wrap = false,
): string | null {
  if (ids.length === 0) return null;
  const from = activeId === null ? -1 : ids.indexOf(activeId);
  if (from === -1) return ids[0] ?? null;
  const next = from + step;
  if (wrap) return ids[(next + ids.length) % ids.length] ?? null;
  return ids[Math.min(ids.length - 1, Math.max(0, next))] ?? null;
}

/// The slot an overflow Space took while it is active, and the Space it displaced.
export interface TemporarySlot {
  temporaryId: string;
  displacedId: string;
}

/// The stored order after dropping `dragId` on `overId`, or null when nothing changes.
/// Row and overflow are one list. A drop on the temporary slot inserts before the
/// displaced Space instead of at the temporary Space's stored place.
export function moveSpaceId(
  ids: string[],
  dragId: string,
  overId: string,
  slot: TemporarySlot | null,
): string[] | null {
  const over = ids.indexOf(overId);
  if (!ids.includes(dragId) || over === -1 || dragId === overId) return null;
  const rest = ids.filter((id) => id !== dragId);
  if (slot && overId === slot.temporaryId) {
    if (dragId === slot.displacedId) return null;
    rest.splice(rest.indexOf(slot.displacedId), 0, dragId);
    return rest;
  }
  rest.splice(over, 0, dragId);
  return rest;
}
