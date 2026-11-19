import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hearth } from "./hearth";

describe("Hearth", () => {
  it("is just the flame and its glow, with no logs or stones under it", () => {
    const { container } = render(<Hearth scene="closing" />);
    expect(container.querySelectorAll("image")).toHaveLength(1);
    expect(container.querySelector("image")?.getAttribute("href")).toBe("/hearth/flame.webp");
    expect(container.querySelector("rect")).toBeNull();
    expect(container.querySelector("path")).toBeNull();
  });

  it("stands the flame on the bottom edge, where the footer begins", () => {
    const { container } = render(<Hearth scene="closing" />);
    const svg = container.querySelector("svg");
    const flame = container.querySelector("image");
    const height = Number(svg?.getAttribute("viewBox")?.split(" ")[3]);
    const bottom = Number(flame?.getAttribute("y")) + Number(flame?.getAttribute("height"));
    expect(bottom).toBe(height);
  });
});
