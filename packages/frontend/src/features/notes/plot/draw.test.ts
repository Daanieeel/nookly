import { describe, expect, it } from "vitest";
import { drawPlot, plotWindow, gridStep } from "./draw";
import { parsePlot } from "./parse";

const svgOf = (markup: string) => {
  const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  if (!(svg instanceof SVGSVGElement)) throw new Error("not an svg");
  return svg;
};

describe("plotWindow", () => {
  it("shows -10 to 10 across, at the same scale up and down", () => {
    expect(plotWindow(parsePlot("y = x"), 640, 400)).toEqual({ x: [-10, 10], y: [-6.25, 6.25] });
  });

  it("takes the window from the code, and keeps the scale for an axis it leaves out", () => {
    expect(plotWindow(parsePlot("x: 0..4\ny: -1..1"), 640, 400)).toEqual({ x: [0, 4], y: [-1, 1] });
    expect(plotWindow(parsePlot("x: 0..16"), 640, 400)).toEqual({ x: [0, 16], y: [-5, 5] });
  });

  it("grows to show every point", () => {
    const window = plotWindow(parsePlot("A = (30, 2)"), 640, 400);
    expect(window.x[1]).toBeGreaterThan(30);
    expect(window.x[0]).toBeLessThan(0);
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

  it("colors in lighter shades on a dark page", () => {
    expect(drawPlot(parsePlot("y = x"), false)).toContain("#2563eb");
    expect(drawPlot(parsePlot("y = x"), true)).toContain("#60a5fa");
  });
});
