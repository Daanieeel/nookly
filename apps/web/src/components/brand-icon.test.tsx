import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandIcon } from "./brand-icon";

/// Every colour a mark is painted with, from its fill attributes.
function fills(container: HTMLElement) {
  return new Set(
    [...container.querySelectorAll("[fill]")]
      .map((el) => el.getAttribute("fill")?.toLowerCase())
      .filter((fill): fill is string => Boolean(fill)),
  );
}

describe("BrandIcon", () => {
  // Tux used to be one flat yellow shape, eyes and body included.
  it("draws Linux as the penguin it is, not a flat yellow shape", () => {
    const { container } = render(<BrandIcon brand="linux" />);
    const colours = fills(container);
    expect(colours.size).toBeGreaterThanOrEqual(3);
    expect(colours).toContain("#fcc624");
    expect(colours).toContain("#ffffff");
    expect([...colours].some((c) => c.startsWith("#1"))).toBe(true);
  });

  // The Windows mark was only blue.
  it("draws Windows in its four colours", () => {
    const { container } = render(<BrandIcon brand="windows" />);
    expect(fills(container)).toEqual(new Set(["#f25022", "#7fba00", "#00a4ef", "#ffb900"]));
  });

  it("draws Linux and Windows in the text colour when it is not coloured", () => {
    for (const brand of ["linux", "windows"] as const) {
      const { container } = render(<BrandIcon brand={brand} colored={false} />);
      expect(fills(container)).toEqual(new Set(["currentcolor"]));
    }
  });

  it("keeps the other marks in their brand colour", () => {
    const { container } = render(<BrandIcon brand="fedora" />);
    expect(container.querySelector("svg")?.getAttribute("style")).toContain("fill");
  });

  it("hides every mark from screen readers", () => {
    for (const brand of ["linux", "windows", "apple", "debian"] as const) {
      const { container } = render(<BrandIcon brand={brand} />);
      expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
