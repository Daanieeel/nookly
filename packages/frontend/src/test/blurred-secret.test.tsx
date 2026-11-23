import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlurredSecret } from "@nookly/ui/components/blurred-secret";
import { scramble } from "@nookly/ui/lib/scramble";
import { expectNoA11yViolations } from "#/test/axe.ts";

const KEY = "GBTX GMSJ MR2W G5KU 6789";

afterEach(() => vi.restoreAllMocks());

describe("a blurred secret", () => {
  it("shows random characters of the same kind, never the secret, until it is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<BlurredSecret value={KEY} label="key" />);
    const shown = () => container.querySelector("code")?.textContent ?? "";
    expect(shown()).not.toBe(KEY);
    // The same shape: spaces where there were spaces, digits for digits.
    expect(shown()).toHaveLength(KEY.length);
    expect(shown()).toMatch(/^[A-Z0-9]{4} [A-Z0-9]{4} [A-Z0-9]{4} [A-Z0-9]{4} [0-9]{4}$/);
    expect(container.textContent).not.toContain(KEY);
    expect(container.querySelector("code")).toHaveClass("blur-[5px]", "select-none");
    await user.click(screen.getByRole("button", { name: "Show key" }));
    expect(shown()).toBe(KEY);
    expect(container.querySelector("code")).not.toHaveClass("blur-[5px]");
    await user.click(screen.getByRole("button", { name: "Hide key" }));
    expect(shown()).not.toBe(KEY);
  });

  it("has no box behind the key", () => {
    render(<BlurredSecret value={KEY} label="key" />);
    const button = screen.getByRole("button", { name: "Show key" });
    expect(button.className).not.toMatch(/\bbg-|\bborder\b|\bpx-|\bpy-/);
  });

  it("copies the real secret even while it is blurred", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<BlurredSecret value={KEY} label="key" />);
    await user.click(screen.getByRole("button", { name: "Copy key" }));
    expect(write).toHaveBeenCalledWith(KEY);
  });

  it("scrambles letters and digits and keeps the rest", () => {
    const out = scramble("ab-12 Z");
    expect(out).toMatch(/^[A-Z]{2}-[0-9]{2} [A-Z]$/);
  });

  it("has no accessibility violations, hidden or shown", async () => {
    const user = userEvent.setup();
    render(<BlurredSecret value={KEY} label="key" />);
    await expectNoA11yViolations();
    await user.click(screen.getByRole("button", { name: "Show key" }));
    await expectNoA11yViolations();
  });
});
