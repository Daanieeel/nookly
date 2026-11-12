import { SPRING, dragFrom, rubberBand, settleSheet } from "./motion.ts";

describe("motion", () => {
  it("springs like iOS: about 0.3 to 0.5 seconds, no overshoot for a sheet", () => {
    for (const spring of Object.values(SPRING)) {
      expect(spring.duration).toBeGreaterThanOrEqual(250);
      expect(spring.duration).toBeLessThanOrEqual(500);
    }
    expect(SPRING.sheet.dampingRatio).toBe(1);
  });

  it("resists past a limit, more the further it goes, and never jumps", () => {
    expect(rubberBand(0, 400)).toBe(0);
    const small = rubberBand(-20, 400);
    const big = rubberBand(-200, 400);
    expect(small).toBeLessThan(0);
    expect(small).toBeGreaterThan(-20);
    expect(big).toBeLessThan(small);
    expect(big / -200).toBeLessThan(small / -20);
  });

  // Interrupting: a finger on a moving sheet picks it up where it is, so nothing jumps.
  it("takes a drag up from where a moving sheet is", () => {
    const start = dragFrom(137);
    expect(start(0)).toBe(137);
    expect(start(50)).toBe(187);
    // Dragged above its resting place, it resists rather than following one to one.
    expect(start(-237)).toBeGreaterThan(-100);
    expect(start(-237)).toBeLessThan(0);
  });

  it("goes away when flung or pulled far down, else springs back with the finger's speed", () => {
    expect(settleSheet({ offset: 40, velocity: 1500 })).toEqual({ to: "closed", velocity: 1500 });
    expect(settleSheet({ offset: 160, velocity: 0 })).toEqual({ to: "closed", velocity: 0 });
    expect(settleSheet({ offset: 160, velocity: -800 })).toEqual({ to: "open", velocity: -800 });
    expect(settleSheet({ offset: 40, velocity: 100 })).toEqual({ to: "open", velocity: 100 });
  });
});
