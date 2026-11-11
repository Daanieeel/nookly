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

  it("reads vectors between points, named or written out, in any order", () => {
    const plot = parsePlot(
      "(0,0) -> z_1\nz_2 -> (0,0)\nz_1 -> z_2\nz_1 = (1,2)\nz_2 = (2, -1)\n(f(1), 1) → (0, 2*3)\nf(x) = x",
    );
    expect(plot.vectors).toEqual([
      {
        label: "(0,0) -> z_1",
        latex: "\\left(0, 0\\right) \\to z_{1}",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 2 },
      },
      {
        label: "z_2 -> (0,0)",
        latex: "z_{2} \\to \\left(0, 0\\right)",
        from: { x: 2, y: -1 },
        to: { x: 0, y: 0 },
      },
      {
        label: "z_1 -> z_2",
        latex: "z_{1} \\to z_{2}",
        from: { x: 1, y: 2 },
        to: { x: 2, y: -1 },
      },
      {
        label: "(f(1), 1) → (0, 2*3)",
        latex: "\\left(f\\left(1\\right), 1\\right) \\to \\left(0, 2 \\cdot 3\\right)",
        from: { x: 1, y: 1 },
        to: { x: 0, y: 6 },
      },
    ]);
    expect(plot.points.map((p) => p.name)).toEqual(["z_1", "z_2"]);
  });

  it("names vectors from the origin, then adds and subtracts them by name", () => {
    const plot = parsePlot(
      "z_1 = (3, 1)\nz_2 = (1, 3)\n\na = 0 -> z_1\nb = 0 -> z_2\n\na + b\na-b",
    );
    expect(plot.vectors).toEqual([
      {
        label: "a = 0 -> z_1",
        latex: "\\vec{a} = 0 \\to z_{1}",
        from: { x: 0, y: 0 },
        to: { x: 3, y: 1 },
      },
      {
        label: "b = 0 -> z_2",
        latex: "\\vec{b} = 0 \\to z_{2}",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 3 },
      },
      { label: "a + b", latex: "\\vec{a} + \\vec{b}", from: { x: 0, y: 0 }, to: { x: 4, y: 4 } },
      { label: "a-b", latex: "\\vec{a} - \\vec{b}", from: { x: 0, y: 0 }, to: { x: 2, y: -2 } },
    ]);
  });

  it("starts a sum where its first vector starts, and lets a sum be named and reused", () => {
    const plot = parsePlot(
      "c = a + b\nd = c - a\nb + a\n-a\na = 0 -> (1, 0)\nb = (1, 0) -> (1, 2)",
    );
    const at = (label: string) => plot.vectors.find((v) => v.label === label);
    expect(at("c = a + b")).toMatchObject({
      latex: "\\vec{c} = \\vec{a} + \\vec{b}",
      from: { x: 0, y: 0 },
      to: { x: 1, y: 2 },
    });
    expect(at("d = c - a")).toMatchObject({ from: { x: 0, y: 0 }, to: { x: 0, y: 2 } });
    expect(at("b + a")).toMatchObject({ from: { x: 1, y: 0 }, to: { x: 2, y: 2 } });
    expect(at("-a")).toMatchObject({
      latex: "-\\vec{a}",
      from: { x: 0, y: 0 },
      to: { x: -1, y: 0 },
    });
    expect(plot.functions).toEqual([]);
  });

  it("still reads a bare line as a function when it names no vector", () => {
    expect(parsePlot("a = 0 -> (1, 0)\ny = 2x\nsin(x) + 1").functions).toHaveLength(2);
  });

  it("reads a line after !# but leaves what it makes out of the picture", () => {
    const plot = parsePlot(
      [
        "# a comment line",
        "!# A = (1, 1)",
        "!#a = 0 -> A",
        "!# k = 2",
        "!# z = 5",
        "!# f(x) = x + 1",
        "!# g(x) = 3",
        "!# x = 3",
        "!# (0, 0) -> (2, 0)",
        "!# # only a comment",
        "y = f(k)",
        "A -> (3, 3)",
        "a + a",
      ].join("\n"),
    );
    expect(plot.points).toEqual([]);
    expect(plot.verticals).toEqual([]);
    expect(plot.functions.map((f) => [f.label, f.at(0)])).toEqual([["y = f(k)", 3]]);
    expect(plot.vectors.map((v) => [v.label, v.to])).toEqual([
      ["A -> (3, 3)", { x: 3, y: 3 }],
      ["a + a", { x: 2, y: 2 }],
    ]);
  });

  it("still sets the window and explains mistakes on a !# line", () => {
    expect(parsePlot("!# window: -1..5, -3..5").window).toEqual({ x: [-1, 5], y: [-3, 5] });
    expect(() => parsePlot("y = x\n!# y = q")).toThrow(
      expect.objectContaining({ message: 'Line 2: unknown name "q"' }),
    );
  });

  it("reads vertical lines, the window and comments", () => {
    const plot = parsePlot("x = 4 # a wall\nx: -5..5\ny: -2 .. 8\n# nothing here");
    expect(plot.verticals).toEqual([{ label: "x = 4", latex: "x = 4", x: 4 }]);
    expect(plot.window).toEqual({ x: [-5, 5], y: [-2, 8] });
  });

  it("reads the window across, and up and down after a comma", () => {
    expect(parsePlot("window: -10..10").window).toEqual({ x: [-10, 10] });
    expect(parsePlot("window: -5 .. 5, -2..8").window).toEqual({
      x: [-5, 5],
      y: [-2, 8],
    });
  });

  it("writes each line as LaTeX for the legend", () => {
    const latex = (source: string) => parsePlot(source).functions.map((f) => f.latex);
    expect(latex("f(x) = x^2 - 2\ny = 2x + 1\nsin(x)")).toEqual([
      "f(x) = x^{2} - 2",
      "y = 2 x + 1",
      "\\sin\\left(x\\right)",
    ]);
    expect(latex("g(t) = sqrt(t)/2 + 3*pi")).toEqual([
      "g(t) = \\frac{\\sqrt{t}}{2} + 3 \\cdot \\pi",
    ]);
    expect(latex("y = (x + 1)(x - 1) - -x")).toEqual([
      "y = \\left(x + 1\\right) \\left(x - 1\\right) - -x",
    ]);
    expect(latex("y = (x + 1)^2 + 2^-x + 2^3^2 + abs(x) + x2")).toEqual([
      "y = \\left(x + 1\\right)^{2} + 2^{-x} + 2^{3^{2}} + \\left|x\\right| + x \\cdot 2",
    ]);
    expect(latex("z_1(x) = a_1 x\na_1 = 2")).toEqual(["z_{1}(x) = a_{1} x"]);
  });

  it("draws a constant nothing else uses as a horizontal line, like f(x) = 2", () => {
    const plot = parsePlot("z_1 = 2");
    expect(plot.functions.map((f) => [f.label, f.latex, f.at(7), f.at(-3)])).toEqual([
      ["z_1 = 2", "z_{1} = 2", 2, 2],
    ]);
  });

  it("puts a constant line among the functions in the order written", () => {
    const plot = parsePlot("y = x\nz_1 = 2\nz_2 = z_1 + 1");
    expect(plot.functions.map((f) => f.label)).toEqual(["y = x", "z_2 = z_1 + 1"]);
  });

  it("keeps a constant other lines use as a number, not a line", () => {
    const plot = parsePlot("a = 3\ny = a x\nA = (a, 0)\nb = 1\nx = b");
    expect(plot.functions.map((f) => f.label)).toEqual(["y = a x"]);
    expect(plot.points[0]?.x).toBe(3);
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
    ["(0,0) -> q", 'Line 1: unknown point "q"'],
    ["a = 3\n(0,0) -> a", 'Line 2: "a" is not a point'],
    ["(0,0) -> (1,2) -> (3,4)", "Line 1: a vector goes from one point to another"],
    ["(0,0) ->", "Line 1: a vector goes from one point to another"],
    ["(0,0) -> 5", "Line 1: a vector goes from one point to another"],
    ["a = 0 -> (1, 0)\na + q", 'Line 2: unknown vector "q"'],
    ["a = 0 -> (1, 0)\nA = (1, 1)\na + A", 'Line 3: unknown vector "A"'],
    ["a = 0 -> (1, 0)\na + 2", "Line 2: a sum of vectors is written like a + b - c"],
    ["a = 0 -> (1, 0)\na b", "Line 2: a sum of vectors is written like a + b - c"],
    ["c = d + a\nd = c - a\na = 0 -> (1, 0)", 'Line 1: "c" depends on itself'],
    ["a = 0 -> (1, 0)\na = 1", 'Line 2: "a" is defined twice'],
    ["f(x) = x\nf(x) = 2", 'Line 2: "f" is defined twice'],
    ["y = sin(1, 2)", 'Line 1: "sin" takes one value'],
  ])("explains what is wrong with %j", (source, message) => {
    expect(() => parsePlot(source)).toThrow(expect.objectContaining({ message, located: true }));
  });
});
