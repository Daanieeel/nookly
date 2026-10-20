import { mathMarkup } from "./math.ts";

describe("math in a page", () => {
  it("is drawn as MathML, which the phone's web view shows without fonts or styles", () => {
    const html = mathMarkup("x^2 + y^2 = z^2", {}, false);
    expect(html).toContain("<math");
    expect(html).not.toContain("katex-html");
    expect(mathMarkup("\\frac{a}{b}", {}, true)).toContain('display="block"');
  });

  it("uses the person's own commands from Settings", () => {
    const html = mathMarkup("\\R", { "\\R": "\\mathbb{R}" }, false);
    expect(html).toContain('mathvariant="double-struck"');
  });

  it("shows what could not be drawn as the source, marked, and never throws", () => {
    const html = mathMarkup("\\frac{", {}, false);
    expect(html).toContain("math-error");
    expect(html).toContain("\\frac{");
    expect(mathMarkup("<b>", {}, false)).not.toContain("<b>");
  });

  it("shows nothing for empty source", () => {
    expect(mathMarkup("  ", {}, false)).toBe("");
  });
});
