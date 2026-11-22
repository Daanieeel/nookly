import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "#/components/password-input.tsx";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";

describe("PasswordInput", () => {
  it("hides the text until the eye is pressed, and hides it again after", async () => {
    const { user } = renderWithProviders(
      <PasswordInput aria-label="Password" defaultValue="hunter22" />,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show Password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide Password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Hide Password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("keeps what was typed and the focus in the field when revealing", async () => {
    const { user } = renderWithProviders(<PasswordInput aria-label="Password" />);
    const input = screen.getByLabelText("Password");
    await user.type(input, "abc");
    await user.click(screen.getByRole("button", { name: "Show Password" }));
    expect(input).toHaveValue("abc");
    expect(input).toHaveFocus();
  });

  it("has a lock icon on the left by default", () => {
    const { container } = renderWithProviders(<PasswordInput aria-label="Password" />);
    expect(container.querySelector("[data-slot=icon-input] > svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("does not let the eye be pressed while the field is disabled", () => {
    renderWithProviders(<PasswordInput aria-label="Password" disabled />);
    expect(screen.getByRole("button", { name: "Show Password" })).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<PasswordInput aria-label="Password" />);
    await expectNoA11yViolations(container);
  });
});
