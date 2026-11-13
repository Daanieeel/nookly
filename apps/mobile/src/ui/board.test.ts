import { edgeScroll, targetColumn } from "./board.ts";
import { WOBBLE, wobbleDelay } from "./motion.ts";

describe("dragging a card across a board", () => {
  it("lands in the column under the finger, scrolling counted in, never past an end", () => {
    // Columns 300 apart: a card carried 320 right from the first lands in the second.
    expect(targetColumn(0, 320, 0, 300, 4)).toBe(1);
    expect(targetColumn(0, 100, 0, 300, 4)).toBe(0);
    // Held still while the board scrolled two columns on.
    expect(targetColumn(1, 0, 600, 300, 4)).toBe(3);
    expect(targetColumn(2, -5000, 0, 300, 4)).toBe(0);
    expect(targetColumn(0, 5000, 0, 300, 4)).toBe(3);
  });

  it("scrolls the board near its edges only, faster the closer the finger is", () => {
    expect(edgeScroll(200, 400)).toBe(0);
    expect(edgeScroll(390, 400)).toBeGreaterThan(edgeScroll(360, 400));
    expect(edgeScroll(5, 400)).toBeLessThan(0);
  });

  it("starts each card at its own point in the wobble", () => {
    const delays = [0, 1, 2, 3, 4, 5].map(wobbleDelay);
    expect(new Set(delays).size).toBeGreaterThan(3);
    for (const delay of delays) expect(delay).toBeLessThan(WOBBLE.half * 2);
  });
});
