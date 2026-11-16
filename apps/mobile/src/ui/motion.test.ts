import {
  EDGE_BACK,
  SPRING,
  SWIPE,
  dragFrom,
  rubberBand,
  settleDetent,
  settleEdgeBack,
  settleSheet,
  settleSwipe,
  swipeDrag,
} from "./motion.ts";

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

// A row's swipe, as iOS Mail's: the row follows the finger, a side without an action
// resists, a pull past most of the row acts at once, a shorter one rests on the button.
describe("a row's swipe", () => {
  const width = 400;
  it("follows the finger towards an action, and resists where there is none", () => {
    const drag = swipeDrag({ start: 0, left: true, right: false, width });
    expect(drag(120)).toBe(120);
    expect(drag(-120)).toBeLessThan(0);
    expect(drag(-120)).toBeGreaterThan(-120);
  });

  it("carries on from where an open row rests", () => {
    const drag = swipeDrag({ start: SWIPE.button, left: true, right: true, width });
    expect(drag(10)).toBe(SWIPE.button + 10);
  });

  it("acts when pulled past most of the row", () => {
    expect(settleSwipe({ offset: width * 0.7, velocity: 0, width }).to).toBe("full");
    expect(settleSwipe({ offset: -width * 0.7, velocity: 0, width }).to).toBe("full");
  });

  it("does not act when the finger was heading back", () => {
    expect(settleSwipe({ offset: width * 0.7, velocity: -2000, width }).to).not.toBe("full");
  });

  it("rests on the button after a shorter pull or a flick, and closes after a small one", () => {
    expect(settleSwipe({ offset: SWIPE.button, velocity: 0, width }).to).toBe("open");
    expect(settleSwipe({ offset: 30, velocity: 1500, width }).to).toBe("open");
    expect(settleSwipe({ offset: 20, velocity: 0, width }).to).toBe("closed");
    expect(settleSwipe({ offset: SWIPE.button, velocity: -1500, width }).to).toBe("closed");
  });

  it("names the point where letting go would act", () => {
    expect(SWIPE.full).toBeGreaterThan(0.4);
    expect(SWIPE.full).toBeLessThan(0.8);
  });
});

describe("a swipe back from a page's left edge", () => {
  const width = 800;
  it("goes back past a third of the page, or on a flick to the right", () => {
    expect(settleEdgeBack({ offset: width * 0.5, velocity: 0, width })).toBe(true);
    expect(settleEdgeBack({ offset: 40, velocity: EDGE_BACK.flick * 2, width })).toBe(true);
  });

  it("stays on a short pull, or one flicked back to the left", () => {
    expect(settleEdgeBack({ offset: 60, velocity: 0, width })).toBe(false);
    expect(settleEdgeBack({ offset: width * 0.6, velocity: -EDGE_BACK.flick * 2, width })).toBe(
      false,
    );
  });
});
