import { describe, expect, it } from "vitest";
import {
  capVelocity,
  isSettled,
  rubberBand,
  settleTarget,
  springStep,
  type SpringState,
  velocityOf,
} from "./space-pager.ts";

const WIDTH = 240;

describe("rubberBand", () => {
  it("follows the fingers a little at first, and gives up the further it is pulled", () => {
    expect(rubberBand(0, WIDTH)).toBe(0);
    expect(rubberBand(20, WIDTH)).toBeGreaterThan(0);
    expect(rubberBand(20, WIDTH)).toBeLessThan(20);
    expect(rubberBand(100, WIDTH) - rubberBand(80, WIDTH)).toBeLessThan(
      rubberBand(20, WIDTH) - rubberBand(0, WIDTH),
    );
  });

  it("never travels the whole width, and is symmetric", () => {
    expect(rubberBand(5000, WIDTH)).toBeLessThan(WIDTH);
    expect(rubberBand(-70, WIDTH)).toBeCloseTo(-rubberBand(70, WIDTH));
  });
});

describe("settleTarget", () => {
  const base = { width: WIDTH, hasNeighbor: true };

  it("goes to the next Space once the list was dragged past halfway, and rests there", () => {
    expect(settleTarget({ ...base, offset: -130, velocity: 0 })).toBe(-WIDTH);
    expect(settleTarget({ ...base, offset: 130, velocity: 0 })).toBe(WIDTH);
  });

  it("comes back when it was let go before halfway", () => {
    expect(settleTarget({ ...base, offset: -90, velocity: 0 })).toBe(0);
  });

  it("comes back when it was stopped in the middle, even far along", () => {
    // Held still for a moment, then let go a little short of the middle.
    expect(settleTarget({ ...base, offset: -100, velocity: 0.01 })).toBe(0);
  });

  it("goes on after a flick, however short the drag was", () => {
    expect(settleTarget({ ...base, offset: -30, velocity: -1.2 })).toBe(-WIDTH);
    expect(settleTarget({ ...base, offset: 30, velocity: 1.2 })).toBe(WIDTH);
  });

  it("turns back when the fingers were already moving the other way", () => {
    expect(settleTarget({ ...base, offset: -150, velocity: 1.2 })).toBe(0);
  });

  it("never goes anywhere there is no Space", () => {
    expect(settleTarget({ ...base, hasNeighbor: false, offset: -200, velocity: -2 })).toBe(0);
  });

  it("stays put without a drag and without speed", () => {
    expect(settleTarget({ ...base, offset: 0, velocity: 0 })).toBe(0);
  });
});

describe("velocityOf", () => {
  it("is zero without samples", () => {
    expect(velocityOf([], 1000)).toBe(0);
  });

  it("is how fast the list moved, in pixels per millisecond, against the wheel direction", () => {
    // Fingers moving left report positive wheel deltas, and move the list left.
    const samples = [
      { t: 920, dx: 20 },
      { t: 940, dx: 20 },
      { t: 960, dx: 20 },
      { t: 980, dx: 20 },
    ];
    expect(velocityOf(samples, 1000)).toBeCloseTo(-1, 1);
  });

  it("only looks at the last moments, so a pause before letting go counts as slow", () => {
    const samples = [
      { t: 100, dx: 80 },
      { t: 150, dx: 80 },
    ];
    expect(Math.abs(velocityOf(samples, 1000))).toBe(0);
  });

  it("does not take one small event for a flick", () => {
    expect(Math.abs(velocityOf([{ t: 990, dx: 20 }], 1000))).toBeLessThan(0.5);
  });
});

describe("springStep", () => {
  function run(from: number, target: number, v = 0, seconds = 1) {
    let state = { x: from, v };
    let peak = from;
    for (let t = 0; t < seconds; t += 1 / 60) {
      state = springStep(state, target, 1 / 60);
      peak = target >= from ? Math.max(peak, state.x) : Math.min(peak, state.x);
    }
    return { ...state, peak };
  }

  it("settles on the target without noticeably overshooting it", () => {
    const end = run(-120, 0);
    expect(Math.abs(end.x)).toBeLessThan(0.5);
    expect(end.peak).toBeLessThanOrEqual(1);
  });

  it("carries on with the speed it was let go with", () => {
    const flicked = springStep({ x: -30, v: -1500 }, -WIDTH, 1 / 60);
    const still = springStep({ x: -30, v: 0 }, -WIDTH, 1 / 60);
    expect(flicked.x).toBeLessThan(still.x);
  });

  it("is stable for a long frame", () => {
    const end = springStep({ x: -200, v: 0 }, 0, 0.2);
    expect(Number.isFinite(end.x)).toBe(true);
    expect(Math.abs(end.x)).toBeLessThan(200);
  });
});

describe("isSettled", () => {
  it("is when it is on the target and hardly moving", () => {
    expect(isSettled({ x: -239.8, v: 2 }, -240)).toBe(true);
    expect(isSettled({ x: -200, v: 0 }, -240)).toBe(false);
    expect(isSettled({ x: -240, v: 400 }, -240)).toBe(false);
  });
});

describe("capVelocity", () => {
  it("leaves a gentle speed towards the target alone", () => {
    expect(capVelocity(300, -100, 0)).toBe(300);
    expect(capVelocity(-300, 100, 0)).toBe(-300);
  });

  it("drops speed away from the target, which the settling would only carry further out", () => {
    expect(capVelocity(-500, -100, 0)).toBe(0);
    expect(capVelocity(500, 100, 0)).toBe(0);
  });

  it("holds a hard flick to the speed the spring can stop on the target at", () => {
    const capped = capVelocity(9000, -30, 0);
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThan(9000);
    expect(capVelocity(-9000, 30, 0)).toBe(-capped);
  });

  it("lets a hard flick arrive without ever passing the target", () => {
    for (const [from, target, speed] of [
      [-30, -240, -9000],
      [-200, -240, -9000],
      [30, 240, 9000],
      [-239, -240, -9000],
      [-80, 0, 3000],
    ] as const) {
      let state: SpringState = { x: from, v: capVelocity(speed, from, target) };
      for (let t = 0; t < 2; t += 1 / 60) {
        state = springStep(state, target, 1 / 60);
        const passed = from < target ? state.x > target + 0.01 : state.x < target - 0.01;
        expect(passed, `${from} to ${target} at ${speed}`).toBe(false);
      }
    }
  });
});
