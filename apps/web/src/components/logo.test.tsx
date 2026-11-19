import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./logo";

describe("Logo", () => {
  // An inline logo sits on the text baseline of the link around it, which leaves room for
  // descenders under it and lifts it above the nav's other items. A block box does not.
  it("is a block level box, so it centres on the bar's line like the links beside it", () => {
    const { container } = render(<Logo />);
    const classes = container.firstElementChild?.className.split(" ") ?? [];
    expect(classes).toContain("flex");
    expect(classes).not.toContain("inline-flex");
  });
});
