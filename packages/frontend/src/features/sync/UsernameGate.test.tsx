import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { UsernameGate } from "./UsernameGate.tsx";
import { useUsernameGate } from "./username-gate-store.ts";
import { syncRuntime } from "./sync-instance.ts";

const GRACE = {
  id: "00000000-0000-4000-8000-000000000002",
  username: "Grace Hopper",
  email: "grace@example.com",
  emailVerified: true,
  createdAt: "",
  termsVersion: null,
  needsUsername: true,
};

function signedInAs(user: typeof GRACE | null) {
  act(() => syncRuntime.store.setState({ user }));
}

afterEach(() => {
  vi.restoreAllMocks();
  signedInAs(null);
  act(() => useUsernameGate.getState().reset());
});

describe("the username dialog", () => {
  it("stays away from an account that has a username", () => {
    renderWithProviders(<UsernameGate />);
    signedInAs({ ...GRACE, needsUsername: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks an account made with a provider for one, suggesting a name, with no accessibility violations", async () => {
    renderWithProviders(<UsernameGate />);
    signedInAs(GRACE);
    expect(await screen.findByRole("dialog", { name: "Choose a username" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toHaveValue("grace_hopper");
    await expectNoA11yViolations();
  });

  it("saves the name, then goes away", async () => {
    const choose = vi.spyOn(syncRuntime, "chooseUsername").mockImplementation(async (username) => {
      const user = { ...GRACE, username, needsUsername: false };
      signedInAs(user);
      return user;
    });
    const { user } = renderWithProviders(<UsernameGate />);
    signedInAs(GRACE);
    const field = await screen.findByLabelText(/^Username/);
    await user.clear(field);
    await user.type(field, "grace_h");
    await user.click(screen.getByRole("button", { name: "Save Username" }));
    expect(choose).toHaveBeenCalledWith("grace_h");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("checks the name before sending it", async () => {
    const choose = vi.spyOn(syncRuntime, "chooseUsername");
    const { user } = renderWithProviders(<UsernameGate />);
    signedInAs(GRACE);
    const field = await screen.findByLabelText(/^Username/);
    await user.clear(field);
    await user.type(field, "no spaces");
    await user.click(screen.getByRole("button", { name: "Save Username" }));
    expect(await screen.findByText(/letters, numbers, dots or underscores/)).toBeInTheDocument();
    expect(choose).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the reason when the name is taken", async () => {
    vi.spyOn(syncRuntime, "chooseUsername").mockRejectedValue(
      new Error("That username is taken. Try another one."),
    );
    const { user } = renderWithProviders(<UsernameGate />);
    signedInAs(GRACE);
    await screen.findByRole("dialog", { name: "Choose a username" });
    await user.click(screen.getByRole("button", { name: "Save Username" }));
    expect(await screen.findByText("That username is taken. Try another one.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("can be put off, and the account keeps working under its provider name", async () => {
    const { user } = renderWithProviders(<UsernameGate />);
    signedInAs(GRACE);
    await screen.findByRole("dialog", { name: "Choose a username" });
    await user.click(screen.getByRole("button", { name: "Not Now" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
