export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
/// How much one press of a zoom button scales the graph.
const STEP = 1.25;
/// How fast Ctrl or Cmd scrolling and trackpad pinching zoom, per pixel scrolled.
const WHEEL_SPEED = 0.01;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/// One step in (`1`) or out (`-1`) from `zoom`.
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(direction === 1 ? zoom * STEP : zoom / STEP);
}

/// The zoom after a wheel or pinch event that scrolled `deltaY` pixels.
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-deltaY * WHEEL_SPEED));
}

/// The zoom at which a square canvas of `size` pixels fits a view of `width` by `height`.
/// A canvas that already fits stays at its natural size.
export function fitZoom(size: number, width: number, height: number): number {
  if (width <= 0 || height <= 0 || size <= 0) return 1;
  return clampZoom(Math.min(1, width / size, height / size));
}
