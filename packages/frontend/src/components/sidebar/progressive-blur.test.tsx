import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressiveBlur } from "./progressive-blur";

describe("the blur behind the Space switcher", () => {
  // The bug: the fade reached 40px above the switcher and covered the last row of the
  // list, which stopped right at the switcher.
  it("reaches only a little above the switcher", () => {
    const { container } = render(<ProgressiveBlur />);
    const blur = container.firstElementChild;
    expect(blur?.className).toContain("-top-3");
    expect(blur?.className).not.toContain("-top-10");
  });
});
