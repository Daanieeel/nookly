/// Coalesces a high frequency listener (e.g. `mousemove`) to at most one call per
/// animation frame, always with the latest event, so hover tracking never
/// measures layout or re-renders more often than the screen paints.
export function perFrame<E>(listener: (event: E) => void) {
  let frame = 0;
  let latest: E | null = null;
  const schedule = (event: E) => {
    latest = event;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const event = latest;
      latest = null;
      if (event) listener(event);
    });
  };
  schedule.cancel = () => cancelAnimationFrame(frame);
  return schedule;
}

/// Keeps `prev` when `next` holds the same numbers, so a functional state update
/// bails out of re-rendering instead of storing an equal but new object.
export function keepIfEqual<T extends object>(prev: T | null, next: T): T {
  if (!prev) return next;
  // SAFETY: `Object.keys` of `next` only yields `next`'s own keys, all of which are
  // keys of `T`.
  const keys = Object.keys(next) as (keyof T)[];
  return keys.every((key) => prev[key] === next[key]) ? prev : next;
}
