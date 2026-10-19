import { describe, expect, it } from "vitest";
import { latexToText } from "./latex-text.ts";

describe("latexToText", () => {
  it.each([
    ["E = mc^2", "E = mc²"],
    ["x_1 + x_{12}", "x₁ + x₁₂"],
    ["\\alpha \\leq \\beta", "α ≤ β"],
    ["\\frac{a}{b}", "a/b"],
    ["\\frac{x+1}{2}", "(x+1)/2"],
    ["\\sqrt{x+1}", "√(x+1)"],
    ["\\ce{H2O}", "H₂O"],
    ["\\ce{SO4^2-}", "SO₄²⁻"],
    ["a \\cdot b \\to \\infty", "a · b → ∞"],
    ["\\text{rate} = 5", "rate = 5"],
    ["\\$5", "$5"],
  ])("spells %s as %s", (latex, text) => {
    expect(latexToText(latex)).toBe(text);
  });

  it.each([
    "\\begin{matrix} a \\end{matrix}",
    "x^{y+z}_{\\alpha}",
    "\\unknown",
    "\\frac{a",
    "e^{i\\pi}",
  ])("leaves %s to the TeX itself", (latex) => {
    expect(latexToText(latex)).toBeNull();
  });
});
