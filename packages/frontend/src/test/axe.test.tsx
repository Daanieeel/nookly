import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "./axe.ts";

describe("the axe helper", () => {
  it("passes an accessible fragment", async () => {
    render(<button type="button">Save</button>);
    await expectNoA11yViolations();
  });

  it("catches a button with no accessible name", async () => {
    // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the violation under test
    render(<button type="button" />);
    await expect(expectNoA11yViolations()).rejects.toThrow();
  });

  it("catches an image with no alt text", async () => {
    // oxlint-disable-next-line jsx-a11y/alt-text -- the violation under test
    render(<img src="/x.png" />);
    await expect(expectNoA11yViolations()).rejects.toThrow();
  });
});
