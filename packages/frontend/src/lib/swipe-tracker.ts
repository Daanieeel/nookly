/// How far two fingers travel sideways before the swipe counts.
const THRESHOLD = 80;
/// After a swipe fired, the glide of the same gesture is ignored for this long.
const COOLDOWN_MS = 500;
/// A pause this long ends the gesture, so a half swipe does not add up with the next one.
const GESTURE_GAP_MS = 150;

/// Turns trackpad wheel events into discrete swipes: feed it each event's deltas and
/// time, and it answers 1 (swipe left), -1 (swipe right) or 0 (nothing yet). A mostly
/// vertical scroll never counts.
export function createSwipeTracker() {
  let travelled = 0;
  let lastAt = Number.NEGATIVE_INFINITY;
  let firedAt = Number.NEGATIVE_INFINITY;
  return (deltaX: number, deltaY: number, now: number): -1 | 0 | 1 => {
    const gap = now - lastAt;
    lastAt = now;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      travelled = 0;
      return 0;
    }
    if (now - firedAt < COOLDOWN_MS) return 0;
    if (gap > GESTURE_GAP_MS) travelled = 0;
    travelled += deltaX;
    if (Math.abs(travelled) < THRESHOLD) return 0;
    const direction = travelled > 0 ? 1 : -1;
    travelled = 0;
    firedAt = now;
    return direction;
  };
}
