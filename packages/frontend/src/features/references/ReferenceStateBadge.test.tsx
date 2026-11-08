import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { ReferenceStateBadge } from "./ReferenceStateBadge.tsx";

describe("ReferenceStateBadge", () => {
  it("says the state and explains it on hover", async () => {
    renderWithProviders(
      <ReferenceStateBadge status={{ state: "notOnThisDevice", asOf: null }} provider="file" />,
    );
    const badge = screen.getByText("Not on this device");
    expect(badge.dataset.stateKey).toBe("notOnThisDevice");
    await userEvent.hover(badge);
    expect((await screen.findAllByText(/added on another device/)).length).toBeGreaterThan(0);
  });

  it("is reachable by keyboard and has no accessibility violations", async () => {
    const { container } = renderWithProviders(
      <ReferenceStateBadge status={{ state: "missing", asOf: null }} provider="link" />,
    );
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByText("Missing"));
    await expectNoA11yViolations(container);
  });
});
