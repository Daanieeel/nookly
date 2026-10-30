export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;
/// What one click on a zoom button multiplies the zoom by.
const ZOOM_FACTOR = 1.25;
/// How strongly a trackpad pinch counts: a delta of `d` multiplies the zoom by `e^(d * PINCH_SPEED)`.
const PINCH_SPEED = 0.01;
/// The most pixels one canvas gets. WebKit draws nothing at all for a bigger one.
export const MAX_CANVAS_PIXELS = 16_000_000;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/// Zooming is multiplicative: a fixed step would be huge at 50% and tiny at 300%.
/// The result is rounded to a whole percent, which is what the toolbar shows.
export function stepScale(scale: number, direction: 1 | -1): number {
  const next = direction === 1 ? scale * ZOOM_FACTOR : scale / ZOOM_FACTOR;
  return Math.round(clampScale(next) * 100) / 100;
}

/// A pinch sends many tiny wheel deltas (negative zooms in), so the result is not
/// rounded: the caller adds them up and rounds once it applies the zoom.
export function pinchScale(scale: number, deltaY: number): number {
  return clampScale(scale * Math.exp(-deltaY * PINCH_SPEED));
}

/// The zoom at which a page `pageWidth` wide fills `available` pixels, or `null`
/// when either is unknown.
export function fitWidthScale(available: number, pageWidth: number): number | null {
  if (available <= 0 || pageWidth <= 0) return null;
  return Math.round(clampScale(available / pageWidth) * 100) / 100;
}

/// The pixel ratio to draw a page's canvas with: the screen's, lowered when the page
/// at `renderScale` would pass `MAX_CANVAS_PIXELS`, but never below 1.
export function canvasPixelRatio(
  deviceRatio: number,
  width: number,
  height: number,
  renderScale: number,
): number {
  const area = width * renderScale * height * renderScale;
  if (area <= 0) return deviceRatio;
  return Math.max(1, Math.min(deviceRatio, Math.sqrt(MAX_CANVAS_PIXELS / area)));
}
