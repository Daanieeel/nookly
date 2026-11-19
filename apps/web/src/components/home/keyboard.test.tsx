import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Keyboard } from "./sections";

describe("Keyboard", () => {
  // The glow behind the palette reaches past the page's edges on a phone. Unclipped, it
  // widens the page, so iOS lets the visitor zoom out onto an empty strip beside it.
  it("keeps the glow behind the palette inside the page's width", () => {
    const { container } = render(<Keyboard locale="en" />);
    expect(container.querySelector("section")?.className.split(" ")).toContain("overflow-x-clip");
  });
});
