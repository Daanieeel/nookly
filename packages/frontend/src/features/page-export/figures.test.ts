import { describe, expect, it } from "vitest";
import { fileUrl, svgSize } from "./figure-renderers.ts";
import { mathJaxMacros, texToSvg } from "./mathjax-svg.ts";

const svgOf = (markup: string) => {
  const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  if (!(svg instanceof SVGSVGElement)) throw new Error("not an svg");
  return svg;
};

describe("texToSvg", () => {
  it("draws a formula as paths, sized in ex", () => {
    const svg = texToSvg("\\frac{a}{b} + \\ce{H2O}", true, {});
    expect(svg).toMatch(/^<svg/);
    expect(svg).toMatch(/width="[\d.]+ex"/);
    expect(svg).toContain("<path");
  });

  it("knows the user's own commands, with their arguments", () => {
    expect(() =>
      texToSvg("\\sq{x} \\R", false, { "\\sq": "#1^2", "\\R": "\\mathbb{R}" }),
    ).not.toThrow();
  });

  it("knows the commands KaTeX adds, as the editor draws them", () => {
    expect(() => texToSvg("A \\Rarr B \\lrarr \\N \\isin \\reals", false, {})).not.toThrow();
  });

  it("throws on a formula that does not parse, so the export shows its source", () => {
    expect(() => texToSvg("\\frac{a", false, {})).toThrow();
    expect(() => texToSvg("\\nosuchcommand", false, {})).toThrow();
  });
});

describe("mathJaxMacros", () => {
  it("drops the backslash and counts the arguments", () => {
    expect(mathJaxMacros({ "\\R": "\\mathbb{R}", "\\pair": "(#1, #2)" })).toEqual({
      R: "\\mathbb{R}",
      pair: ["(#1, #2)", 2],
    });
  });
});

describe("svgSize", () => {
  it("reads lengths in pixels and ex, else the viewBox", () => {
    expect(
      svgSize(svgOf('<svg xmlns="http://www.w3.org/2000/svg" width="2ex" height="1.5ex"/>')),
    ).toEqual({
      width: 16,
      height: 12,
    });
    expect(
      svgSize(
        svgOf('<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 300 120"/>'),
      ),
    ).toEqual({
      width: 300,
      height: 120,
    });
    expect(svgSize(svgOf('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});

describe("fileUrl", () => {
  it("links a local path the way a browser opens it", () => {
    expect(fileUrl("/Users/ada/My Files/cat.png")).toBe("file:///Users/ada/My%20Files/cat.png");
    expect(fileUrl("C:\\Users\\ada\\cat.png")).toBe("file:///C:/Users/ada/cat.png");
  });
});
