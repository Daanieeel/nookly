import { describe, expect, it } from "vitest";
import { drawPlot } from "./draw";
import { loadFormulas } from "./formula";
import { parsePlot } from "./parse";

describe("loadFormulas", () => {
  it("draws a formula as paths sized for the legend text", async () => {
    const formulas = await loadFormulas();
    const formula = formulas("z_{1}(x) = \\frac{\\sqrt{x}}{2}", 14.4);
    expect(formula?.width).toBeGreaterThan(40);
    expect(formula?.height).toBeGreaterThan(14);
    const svg = new DOMParser().parseFromString(formula?.at(10, 20) ?? "", "image/svg+xml");
    const root = svg.documentElement;
    expect(root.getAttribute("x")).toBe("10");
    expect(root.getAttribute("y")).toBe("20");
    expect(root.getAttribute("style")).toBeNull();
    expect(root.querySelectorAll("path").length).toBeGreaterThan(3);
  });

  it("draws every legend line of a plot with named vectors", async () => {
    const plot = parsePlot(
      "z_1 = (3, 1)\nz_2 = (1, 3)\na = 0 -> z_1\nb = 0 -> z_2\na + b\na-b\nc = -a + b\n(0,0) -> z_1",
    );
    const formulas = await loadFormulas();
    expect(plot.vectors).toHaveLength(6);
    for (const vector of plot.vectors) expect(formulas(vector.latex, 14.4)).not.toBeNull();
  });

  it("gives null for a formula MathJax can't read", async () => {
    expect((await loadFormulas())("\\frac{", 14.4)).toBeNull();
  });

  it("puts the formulas in the legend of a plot", async () => {
    const markup = drawPlot(
      parsePlot("f(x) = x^2\nA = (1, 1)\nz_1 = 2"),
      false,
      await loadFormulas(),
    );
    const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
    expect(svg.querySelectorAll("svg[x]")).toHaveLength(2);
    const text = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(text).not.toContain("f(x) = x^2");
  });
});
