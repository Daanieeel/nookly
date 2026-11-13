import { SPRING, dragFrom, rubberBand, settleDetent, settleSheet } from "./motion.ts";

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

  describe("a tall sheet's detents", () => {
    const medium = 400;
    it("rests on the stop nearest where it was let go", () => {
      expect(settleDetent({ offset: 120, velocity: 0, medium })).toEqual({
        to: "large",
        velocity: 0,
      });
      expect(settleDetent({ offset: 330, velocity: 0, medium })).toEqual({
        to: "medium",
        velocity: 0,
      });
    });

    it("follows a flick to the next stop, keeping its speed", () => {
      expect(settleDetent({ offset: 60, velocity: 1200, medium }).to).toBe("medium");
      expect(settleDetent({ offset: 380, velocity: -1200, medium }).to).toBe("large");
    });

    it("goes away when pulled well past the medium stop or flung down from it", () => {
      expect(settleDetent({ offset: 560, velocity: 0, medium }).to).toBe("closed");
      expect(settleDetent({ offset: 420, velocity: 1500, medium }).to).toBe("closed");
    });
  });
});
