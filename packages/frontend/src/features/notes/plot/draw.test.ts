import { describe, expect, it } from "vitest";
import { drawPlot, plotWindow, gridStep, type FormulaRenderer } from "./draw";
import { parsePlot } from "./parse";

const svgOf = (markup: string) => {
  const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  if (!(svg instanceof SVGSVGElement)) throw new Error("not an svg");
  return svg;
};

describe("plotWindow", () => {
  it("shows -10 to 10 across, at the same scale up and down", () => {
    expect(plotWindow(parsePlot("y = x"), 640, 400)).toEqual({
      x: [-10, 10],
      y: [-6.25, 6.25],
    });
  });

  it("takes the window from the code, and keeps the scale for an axis it leaves out", () => {
    expect(plotWindow(parsePlot("x: 0..4\ny: -1..1"), 640, 400)).toEqual({
      x: [0, 4],
      y: [-1, 1],
    });
    expect(plotWindow(parsePlot("x: 0..16"), 640, 400)).toEqual({
      x: [0, 16],
      y: [-5, 5],
    });
  });

  it("grows to show every point", () => {
    const window = plotWindow(parsePlot("A = (30, 2)"), 640, 400);
    expect(window.x[1]).toBeGreaterThan(30);
    expect(window.x[0]).toBeLessThan(0);
  });

  it("ignores a point on a !# line when fitting the window", () => {
    expect(plotWindow(parsePlot("!# A = (30, 2)\ny = x"), 640, 400)).toEqual({
      x: [-10, 10],
      y: [-6.25, 6.25],
    });
  });

  it("grows to show the ends of every vector", () => {
    const window = plotWindow(parsePlot("(0,0) -> (0, 30)"), 640, 400);
    expect(window.y[1]).toBeGreaterThan(30);
  });
});

describe("gridStep", () => {
  it.each([
    [20, 2],
    [12.5, 1],
    [4, 0.5],
    [200, 20],
    [1000, 100],
  ])("puts about ten lines across %s units, %s apart", (span, step) => {
    expect(gridStep(span)).toBe(step);
  });
});

describe("drawPlot", () => {
  it("draws axes with numbers, a curve per function, points and a legend", () => {
    const svg = svgOf(drawPlot(parsePlot("f(x) = x^2 - 2\ny = 2x\nA = (1, -1)"), false));
    expect(svg.querySelectorAll("path[data-function]")).toHaveLength(2);
    expect(svg.querySelectorAll("circle[data-point]")).toHaveLength(1);
    const text = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(text).toEqual(expect.arrayContaining(["f(x) = x^2 - 2", "y = 2x", "A", "2", "-4"]));
  });

  it("draws the legend a fifth larger than the axis numbers", () => {
    const svg = svgOf(drawPlot(parsePlot("y = 2x"), false));
    const label = [...svg.querySelectorAll("text")].find((t) => t.textContent === "y = 2x");
    expect(label?.getAttribute("font-size")).toBe("14.4");
  });

  it("draws the legend as formulas when it can, sized to fit", () => {
    const asked: string[] = [];
    const formulas: FormulaRenderer = (latex, fontSize) => {
      asked.push(latex);
      return {
        width: 100,
        height: 30,
        at: (x, y) => `<svg data-formula="${latex}" x="${x}" y="${y}" font-size="${fontSize}"/>`,
      };
    };
    const svg = svgOf(drawPlot(parsePlot("f(x) = x^2\nx = 1\n(0,0) -> (1,1)"), false, formulas));
    expect(asked).toEqual([
      "f(x) = x^{2}",
      "x = 1",
      "\\left(0, 0\\right) \\to \\left(1, 1\\right)",
    ]);
    expect(svg.querySelectorAll("svg[data-formula]")).toHaveLength(3);
    const text = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(text).not.toContain("f(x) = x^2");
    const box = svg.querySelector("rect");
    // Three rows of 30 and their padding, 34 plus the formula's width across.
    expect(Number(box?.getAttribute("height"))).toBeGreaterThanOrEqual(90);
    expect(Number(box?.getAttribute("width"))).toBeCloseTo(34 * 1.2 + 100, 0);
  });

  it("writes a label as text when its formula can't be drawn", () => {
    const svg = svgOf(drawPlot(parsePlot("f(x) = x^2"), false, () => null));
    const text = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(text).toContain("f(x) = x^2");
  });

  it("lifts the pen at a pole instead of drawing a wall", () => {
    const svg = svgOf(drawPlot(parsePlot("y = tan(x)"), false));
    const d = svg.querySelector("path[data-function]")?.getAttribute("d") ?? "";
    expect(d.match(/M/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("leaves out what is undefined", () => {
    const svg = svgOf(drawPlot(parsePlot("y = sqrt(x)"), false));
    const d = svg.querySelector("path[data-function]")?.getAttribute("d") ?? "";
    const xs = [...d.matchAll(/[ML]([\d.-]+),/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(320 - 1);
  });

  it("escapes the legend, so the code can't break the picture", () => {
    expect(() => svgOf(drawPlot(parsePlot("y = x # <b>&"), false))).not.toThrow();
    const svg = svgOf(drawPlot(parsePlot("f(x)= x\n# <script>"), false));
    expect(svg.querySelector("script")).toBeNull();
  });

  it("draws vertical lines", () => {
    const svg = svgOf(drawPlot(parsePlot("x = 2"), false));
    expect(svg.querySelectorAll("line[data-vertical]")).toHaveLength(1);
  });

  it("draws a vector as a line with an arrowhead at its end, and lists it in the legend", () => {
    const svg = svgOf(drawPlot(parsePlot("(0,0) -> (4,0)"), false));
    const vector = svg.querySelector("g[data-vector]");
    expect(vector?.querySelector("line")).not.toBeNull();
    expect(vector?.querySelector("polygon")).not.toBeNull();
    const text = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(text).toContain("(0,0) -> (4,0)");
  });

  it("skips a vector of no length", () => {
    const svg = svgOf(drawPlot(parsePlot("(1,1) -> (1,1)"), false));
    expect(svg.querySelector("g[data-vector] polygon")).toBeNull();
  });

  it("colors in lighter shades on a dark page", () => {
    expect(drawPlot(parsePlot("y = x"), false)).toContain("#2563eb");
    expect(drawPlot(parsePlot("y = x"), true)).toContain("#60a5fa");
  });
});
