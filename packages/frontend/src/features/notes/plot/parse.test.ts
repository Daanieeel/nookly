import { describe, expect, it } from "vitest";
import { parsePlot } from "./parse";

const fn = (source: string, x: number) => {
  const plot = parsePlot(source);
  const first = plot.functions[0];
  if (!first) throw new Error("no function");
  return first.at(x);
};

describe("parsePlot", () => {
  it("reads named and unnamed functions, labelled as typed", () => {
    const plot = parsePlot("f(x) = x^2 - 2\ny = 2x + 1\nsin(x)");
    expect(plot.functions.map((f) => f.label)).toEqual(["f(x) = x^2 - 2", "y = 2x + 1", "sin(x)"]);
    expect(plot.functions.map((f) => f.at(3))).toEqual([7, 7, Math.sin(3)]);
  });

  it("follows the usual order of operations", () => {
    expect(fn("y = -x^2", 3)).toBe(-9);
    expect(fn("y = 2^3^2 + 0x", 0)).toBe(512);
    expect(fn("y = 1 + 2 * 3 / 4 - x", 0)).toBe(2.5);
    expect(fn("y = (x + 1)(x - 1)", 3)).toBe(8);
    expect(fn("y = 2x^2", 3)).toBe(18);
    expect(fn("y = 3sin(x)cos(x)", 1)).toBeCloseTo(3 * Math.sin(1) * Math.cos(1));
    expect(fn("y = 2pi x", 1)).toBeCloseTo(2 * Math.PI);
    expect(fn("y = sqrt(abs(x)) + ln(e) + log(100)", -4)).toBe(5);
  });

  it("uses constants, other functions and its own parameter name", () => {
    const plot = parsePlot("g(t) = f(t) + a\nf(x) = a x\na = 3");
    expect(plot.functions.map((f) => f.at(2))).toEqual([9, 6]);
  });

  it("reads points, with expressions for coordinates", () => {
    const plot = parsePlot("f(x) = x^2\nA = (2, f(2))\n(-1, 0.5)");
    expect(plot.points).toEqual([
      { name: "A", x: 2, y: 4 },
      { name: "", x: -1, y: 0.5 },
    ]);
  });

  it("reads vertical lines, the window and comments", () => {
    const plot = parsePlot("x = 4 # a wall\nx: -5..5\ny: -2 .. 8\n# nothing here");
    expect(plot.verticals).toEqual([{ label: "x = 4", x: 4 }]);
    expect(plot.window).toEqual({ x: [-5, 5], y: [-2, 8] });
  });

  it("reads the window across, and up and down after a comma", () => {
    expect(parsePlot("window: -10..10").window).toEqual({ x: [-10, 10] });
    expect(parsePlot("window: -5 .. 5, -2..8").window).toEqual({ x: [-5, 5], y: [-2, 8] });
  });

  it("gives a value outside a function's domain as NaN, not an error", () => {
    expect(fn("y = sqrt(x)", -1)).toBeNaN();
    expect(fn("y = 1/x", 0)).toBe(Infinity);
  });

  it.each([
    ["y = x +", "Line 1: the expression ends too early"],
    ["y = q x", 'Line 1: unknown name "q"'],
    ["\ny = (x", 'Line 2: a "(" is never closed'],
    ["f(x) = g(x)\ng(x) = f(x)", 'Line 1: "f" depends on itself'],
    ["x: 5..1", "Line 1: the window must go from smaller to larger"],
    ["window: 0..4, 3..1", "Line 1: the window must go from smaller to larger"],
    ["window: 0..4, 1", "Line 1: the window is written like -10..10"],
    ["A = (1, 2, 3)", "Line 1: a point has two coordinates"],
    ["f(x) = x\nf(x) = 2", 'Line 2: "f" is defined twice'],
    ["y = sin(1, 2)", 'Line 1: "sin" takes one value'],
  ])("explains what is wrong with %j", (source, message) => {
    expect(() => parsePlot(source)).toThrow(expect.objectContaining({ message, located: true }));
  });
});
