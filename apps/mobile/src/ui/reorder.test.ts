import { moveItem, shiftFor, slotAt } from "./reorder.ts";

describe("dragging a row to a new place", () => {
  it("moves one item, leaving the rest in order", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("lands on the slot under the finger, never past either end", () => {
    // The second of four rows of 50, dragged 60 down, lands third.
    expect(slotAt(1, 60, 50, 4)).toBe(2);
    expect(slotAt(1, 20, 50, 4)).toBe(1);
    expect(slotAt(0, -500, 50, 4)).toBe(0);
    expect(slotAt(0, 5000, 50, 4)).toBe(3);
  });

  it("makes room by shifting the rows between where it was and where it goes", () => {
    // Row 0 dragged to slot 2: rows 1 and 2 move up a row, row 3 stays.
    expect([1, 2, 3].map((i) => shiftFor(i, 0, 2, 50))).toEqual([-50, -50, 0]);
    // Row 3 dragged to slot 1: rows 1 and 2 move down.
    expect([0, 1, 2].map((i) => shiftFor(i, 3, 1, 50))).toEqual([0, 50, 50]);
  });
});
