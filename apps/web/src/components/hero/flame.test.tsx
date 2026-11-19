import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Flame } from "./flame";

describe("Flame", () => {
  it("is just the flame, with no logs or stones around it", () => {
    const { container } = render(<Flame />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toBe("/hearth/flame.webp");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("is decoration, hidden from screen readers", () => {
    const { container } = render(<Flame />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("dances more than the quiet flicker the other flames use", () => {
    const { container } = render(<Flame />);
    expect(container.querySelector("img")?.className).toContain("flame-dance");
  });

  it("takes the size it is given", () => {
    const { container } = render(<Flame className="h-20" />);
    expect(container.firstElementChild?.className).toContain("h-20");
  });
});
