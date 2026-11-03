/// The physics of dragging the sidebar from one Space to the next: where a let go settles, and the
/// spring that gets it there. Pure; the DOM side lives in `components/sidebar/use-space-pager.ts`.

/// How far ahead a let go looks, in milliseconds: where the list would end up if it kept its speed.
const PROJECT_MS = 180;

/// How much of a pane has to be crossed, speed included, to land on the next one.
const COMMIT_SHARE = 0.5;

/// Samples older than this no longer say how fast the fingers were going when they let go.
const VELOCITY_WINDOW_MS = 100;

/// One wheel event is not a gesture; speed is never judged over less than this.
const MIN_VELOCITY_SPAN_MS = 50;

/// A critically damped spring (damping is twice the square root of the stiffness), the way
/// Apple's own sheets settle: no bounce, and a quick arrival.
const STIFFNESS = 300;
const DAMPING = 2 * Math.sqrt(STIFFNESS);

/// The longest step the spring is integrated in, so a slow frame cannot make it unstable.
const MAX_STEP_S = 1 / 120;

/// How little distance and speed (pixels and pixels per second) still count as arrived.
const REST_DISTANCE = 0.4;
const REST_SPEED = 8;

export interface Sample {
  /// When it happened, in milliseconds.
  t: number;
  /// The wheel's `deltaX`, positive when the fingers move left.
  dx: number;
}

/// Where a drag that was let go settles: `0` (back where it was), or `-width` or `width` (on the
/// Space beside it). It lands on the next one when the position it would reach by keeping its
/// speed is past halfway in the direction it was dragged, so a short flick goes on and a drag
/// that was stopped in the middle comes back. Without a Space on that side it always comes back.
export function settleTarget({
  offset,
  velocity,
  width,
  hasNeighbor,
}: {
  offset: number;
  /// Pixels per millisecond, positive to the right.
  velocity: number;
  width: number;
  hasNeighbor: boolean;
}): number {
  if (!hasNeighbor || offset === 0) return 0;
  const projected = offset + velocity * PROJECT_MS;
  if (Math.sign(projected) !== Math.sign(offset)) return 0;
  return Math.abs(projected) >= width * COMMIT_SHARE ? Math.sign(offset) * width : 0;
}

/// The list's speed at `now`, in pixels per millisecond, positive to the right. It moves against
/// the wheel's `deltaX`, and only the last moments count.
export function velocityOf(samples: Sample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
  const first = recent[0];
  if (!first) return 0;
  const span = Math.max(now - first.t, MIN_VELOCITY_SPAN_MS);
  const travelled = recent.reduce((sum, s) => sum + s.dx, 0);
  return -travelled / span;
}

export interface SpringState {
  x: number;
  /// Pixels per second.
  v: number;
}

/// Moves the spring `seconds` closer to `target`, in small steps.
export function springStep(state: SpringState, target: number, seconds: number): SpringState {
  let { x, v } = state;
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(left, MAX_STEP_S);
    v += (STIFFNESS * (target - x) - DAMPING * v) * dt;
    x += v * dt;
    left -= dt;
  }
  return { x, v };
}

export function isSettled(state: SpringState, target: number): boolean {
  return Math.abs(state.x - target) < REST_DISTANCE && Math.abs(state.v) < REST_SPEED;
}

/// The speed (pixels per second) the spring may start with, for a pane at `x` settling on `target`.
/// Speed away from the target is dropped, since the settling would only carry it further out
/// first. Towards it, a critically damped spring stops on the target without passing it only up
/// to the speed of `sqrt(stiffness) * distance`; a harder flick would slide past and bounce
/// back, so it is held to that.
export function capVelocity(velocity: number, x: number, target: number): number {
  const toward = Math.sign(target - x);
  if (toward === 0 || Math.sign(velocity) !== toward) return 0;
  return toward * Math.min(Math.abs(velocity), Math.sqrt(STIFFNESS) * Math.abs(target - x));
}
