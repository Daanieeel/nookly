import { render, screen } from "@testing-library/react";
import { IconMail } from "@tabler/icons-react";
import { describe, expect, it } from "vitest";
import { IconInput } from "@nookly/ui/components/icon-input";
import { expectNoA11yViolations } from "#/test/axe.ts";

describe("IconInput", () => {
  it("shows a decorative icon beside a normal input", () => {
    const { container } = render(<IconInput icon={IconMail} aria-label="Email" type="email" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).not.toBeNull();
    expect(input.parentElement?.querySelector("svg")).toBe(icon);
  });

  it("keeps room for the icon and sends layout classes to the wrapper", () => {
    const { container } = render(
      <IconInput icon={IconMail} aria-label="Email" className="w-56" inputClassName="font-mono" />,
    );
    expect(screen.getByRole("textbox")).toHaveClass("pl-9", "font-mono");
    expect(container.querySelector("[data-slot=icon-input]")).toHaveClass("w-56");
  });

  it("passes props through to the input", () => {
    render(<IconInput icon={IconMail} aria-label="Email" placeholder="you@example.com" disabled />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<IconInput icon={IconMail} aria-label="Email" />);
    await expectNoA11yViolations(container);
  });
});
