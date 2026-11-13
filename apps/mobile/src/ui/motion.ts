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
  /// A row lifted to be dragged, the rows making room for it, and its drop into place.
  lift: { duration: 320, dampingRatio: 0.86 },
} as const;

/// How long a finger rests on a row before it lifts to be dragged, as iOS's lists.
export const LIFT_DELAY = 280;
/// How much a lifted row grows, as it comes up off the list.
export const LIFT_SCALE = 1.03;

/// Fades under Reduce Motion, and for things that only appear (a menu going away).
export const FADE = { in: 160, out: 120 } as const;

/// How much a pressed control shrinks.
export const PRESS_SCALE = 0.97;
/// How much a checkbox shrinks: small things give way more, as Reminders' circle does.
export const CHECK_PRESS_SCALE = 0.85;

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
export interface Settled {
  to: "open" | "closed";
  velocity: number;
}

export function settleSheet({ offset, velocity }: { offset: number; velocity: number }): Settled {
  "worklet";
  const flung = velocity > DISMISS_VELOCITY;
  const far = offset > DISMISS_DISTANCE && velocity >= 0;
  return { to: flung || far ? "closed" : "open", velocity };
}

/// Where a tall sheet comes to rest: fully up (`large`), at its `medium` stop (that far
/// down), or away. The stop nearest the release wins, unless the finger flicked towards
/// the next one; from the medium stop, a pull far enough or a fling down sends it away.
export interface DetentSettled {
  to: "large" | "medium" | "closed";
  velocity: number;
}

export function settleDetent({
  offset,
  velocity,
  medium,
}: {
  offset: number;
  velocity: number;
  medium: number;
}): DetentSettled {
  "worklet";
  const flick = Math.abs(velocity) > DISMISS_VELOCITY / 2;
  if (offset > medium) {
    const far = offset - medium > DISMISS_DISTANCE && velocity >= 0;
    if (far || velocity > DISMISS_VELOCITY) return { to: "closed", velocity };
    if (velocity < -DISMISS_VELOCITY / 2) return { to: "large", velocity };
    return { to: "medium", velocity };
  }
  if (flick) return { to: velocity > 0 ? "medium" : "large", velocity };
  return { to: offset > medium / 2 ? "medium" : "large", velocity };
}
