/// The phone's motion, in one place: iOS's own feel. Springs, never fixed timelines, for
/// anything a finger can touch while it moves, so a touch stops it where it is and a
/// release carries on with the finger's speed. Under Reduce Motion, short fades instead.

/// Springs by what moves, as Reanimated's `withSpring` takes them (`duration` is the
/// perceived time to settle, `dampingRatio` 1 means no overshoot).
export const SPRING = {
  /// A sheet or drawer settling: iOS's sheet, no overshoot.
  sheet: { duration: 420, dampingRatio: 1 },
  /// A menu or popover growing out of its trigger: quick, a touch of bounce.
  menu: { duration: 300, dampingRatio: 0.82 },
  /// A press giving way and coming back, a selection indicator sliding.
  press: { duration: 260, dampingRatio: 0.7 },
} as const;

/// Fades under Reduce Motion, and for things that only appear (a menu going away).
export const FADE = { in: 160, out: 120 } as const;

/// How much a pressed control shrinks.
export const PRESS_SCALE = 0.97;

/// How far a swipe down must carry a sheet, or how fast, before it goes away.
export const DISMISS_DISTANCE = 120;
export const DISMISS_VELOCITY = 900;

/// iOS's rubber band: past a limit, a drag moves less the further it goes. `overshoot` is
/// how far past the limit the finger is (signed), `size` the dimension that resists.
export function rubberBand(overshoot: number, size: number): number {
  "worklet";
  if (overshoot === 0) return 0;
  const distance = Math.abs(overshoot);
  const resisted = (1 - 1 / ((distance * 0.55) / size + 1)) * size;
  return Math.sign(overshoot) * resisted;
}

/// A drag that starts on a sheet at `offset` (0 open, larger is further down, wherever a
/// running animation had it): where the sheet goes for a finger moved by `translation`.
/// Down follows the finger; up past the open position resists.
export function dragFrom(offset: number, size = 600) {
  "worklet";
  return (translation: number) => {
    "worklet";
    const next = offset + translation;
    return next >= 0 ? next : rubberBand(next, size);
  };
}

/// Where a released sheet goes: away when flung down or pulled far enough, unless the
/// finger was heading back up; otherwise back open. The finger's speed carries on.
export function settleSheet({ offset, velocity }: { offset: number; velocity: number }): {
  to: "open" | "closed";
  velocity: number;
} {
  "worklet";
  const flung = velocity > DISMISS_VELOCITY;
  const far = offset > DISMISS_DISTANCE && velocity >= 0;
  return { to: flung || far ? "closed" : "open", velocity };
}
