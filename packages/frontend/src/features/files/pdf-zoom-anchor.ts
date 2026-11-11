export interface PageRect {
  top: number;
  height: number;
}

export interface ZoomAnchor {
  page: number;
  /// How far down the page the anchored spot sits, 0 to 1.
  fraction: number;
}

/// Finds the spot to hold still across a zoom: the page at viewport height `y` (or
/// the next one when `y` sits in a gap) and how far into it `y` reaches. `pages` are
/// the page numbers in order, `rectOf` measures one. Pages are stacked, so a binary
/// search measures a handful of them rather than the whole document.
export function findZoomAnchor(
  y: number,
  pages: number[],
  rectOf: (page: number) => PageRect | undefined,
): ZoomAnchor | null {
  let low = 0;
  let high = pages.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const rect = rectOf(pages[mid]);
    if (rect && rect.top + rect.height > y) high = mid;
    else low = mid + 1;
  }
  const page = pages[low];
  const hit = page === undefined ? undefined : rectOf(page);
  if (page === undefined || !hit) return null;
  return { page, fraction: Math.max(0, (y - hit.top) / hit.height) };
}

/// How far to scroll so the anchored spot is back at viewport height `y` once the
/// pages have their new layout.
export function scrollDeltaForAnchor(anchor: ZoomAnchor, rect: PageRect, y: number): number {
  return rect.top + anchor.fraction * rect.height - y;
}
