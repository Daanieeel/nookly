export interface PageRect {
  page: number;
  top: number;
  height: number;
}

export interface ZoomAnchor {
  page: number;
  /// How far down the page the top of the scroll area sits, 0 to 1.
  fraction: number;
}

/// Finds the spot to hold still across a zoom: the page at the top of the
/// scroll area (or the next one when the top sits in a gap) and how far into
/// it the top reaches. Tops are viewport coordinates.
export function findZoomAnchor(rootTop: number, rects: PageRect[]): ZoomAnchor | null {
  const hit = rects.find((r) => r.top + r.height > rootTop);
  if (!hit) return null;
  const fraction = Math.max(0, (rootTop - hit.top) / hit.height);
  return { page: hit.page, fraction };
}

/// How far to scroll so the anchored spot is back at the top of the scroll
/// area once the pages have their new layout.
export function scrollDeltaForAnchor(
  anchor: ZoomAnchor,
  rect: { top: number; height: number },
  rootTop: number,
): number {
  return rect.top + anchor.fraction * rect.height - rootTop;
}
