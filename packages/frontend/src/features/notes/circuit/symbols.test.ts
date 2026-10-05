import { describe, expect, it } from "vitest";
import { BUBBLE_R, gateSymbol, pinBubbles } from "./symbols";

describe("gateSymbol", () => {
  it("draws AND as a flat back and a round front", () => {
    const symbol = gateSymbol("AND", 2);
    expect(symbol.height).toBe(48);
    expect(symbol.pinY).toEqual([16, 32]);
    expect(symbol.pinX).toEqual([0, 0]);
    expect(symbol.outX).toBe(symbol.width);
    expect(symbol.outY).toBe(24);
    expect(symbol.paths).toHaveLength(1);
    expect(symbol.paths[0]).toContain("A24 24");
    expect(symbol.outBubble).toBeNull();
  });

  it("adds a bubble to the output of the negated gates", () => {
    const and = gateSymbol("AND", 2);
    const nand = gateSymbol("NAND", 2);
    expect(nand.outBubble).toEqual({ cx: and.width + BUBBLE_R, cy: 24 });
    expect(nand.outX).toBe(and.outX + 2 * BUBBLE_R);
    expect(gateSymbol("NOR", 2).outBubble).not.toBeNull();
    expect(gateSymbol("XNOR", 2).outBubble).not.toBeNull();
  });

  it("lets OR wires end on its curved back", () => {
    const symbol = gateSymbol("OR", 2);
    for (const x of symbol.pinX) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(symbol.width / 2);
    }
    expect(symbol.pinX[0]).toBe(symbol.pinX[1]);
  });

  it("draws XOR as OR with a second curve behind it", () => {
    const or = gateSymbol("OR", 2);
    const xor = gateSymbol("XOR", 2);
    expect(xor.paths).toHaveLength(2);
    expect(xor.width).toBeGreaterThan(or.width);
    expect(xor.pinX).toEqual(or.pinX);
  });

  it("draws NOT as a triangle with a bubble", () => {
    const symbol = gateSymbol("NOT", 1);
    expect(symbol.pinY).toEqual([symbol.height / 2]);
    expect(symbol.pinX).toEqual([0]);
    expect(symbol.outBubble).not.toBeNull();
    expect(symbol.paths[0]).toContain("L");
  });

  it("grows to keep the pins apart", () => {
    const symbol = gateSymbol("AND", 4);
    expect(symbol.height).toBe(70);
    const gaps = symbol.pinY.slice(1).map((y, i) => y - (symbol.pinY[i] ?? 0));
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBeGreaterThanOrEqual(14);
  });
});

describe("pinBubbles", () => {
  it("puts a circle just left of each negated pin", () => {
    const symbol = gateSymbol("AND", 2);
    expect(pinBubbles(symbol, [true, false])).toEqual([{ cx: -BUBBLE_R, cy: 16 }]);
  });

  it("follows the curve of an OR gate", () => {
    const symbol = gateSymbol("OR", 2);
    const [bubble] = pinBubbles(symbol, [false, true]);
    expect(bubble).toEqual({ cx: (symbol.pinX[1] ?? 0) - BUBBLE_R, cy: 32 });
  });
});
