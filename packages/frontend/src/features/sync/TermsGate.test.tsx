import { TERMS_VERSION } from "@nookly/shared/api";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { TermsLine } from "./AccountCards.tsx";
import { TermsGate } from "./TermsGate.tsx";
import { useTermsGate } from "./terms-gate-store.ts";
import { syncRuntime } from "./sync-instance.ts";

function pend(termsPending: boolean) {
  act(() => syncRuntime.store.setState({ termsPending }));
}

beforeEach(() => mockCommand("plugin:opener|open_url", null));
afterEach(() => {
  vi.restoreAllMocks();
  pend(false);
  act(() => useTermsGate.getState().reset());
});

describe("the terms dialog", () => {
  it("stays away while nothing is owed", () => {
    renderWithProviders(<TermsGate />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens when the account has not agreed, says sync waits, and has no accessibility violations", async () => {
    renderWithProviders(<TermsGate />);
    pend(true);
    expect(
      await screen.findByRole("dialog", { name: "Agree to the terms to keep syncing" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/stays paused on this computer/)).toBeInTheDocument();
    expect(screen.getByText(/at least 18/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("agrees, and sync carries on", async () => {
    const accept = vi.spyOn(syncRuntime, "acceptTerms").mockImplementation(async () => {
      syncRuntime.store.setState({ termsPending: false });
    });
    const { user } = renderWithProviders(<TermsGate />);
    pend(true);
    await user.click(await screen.findByRole("button", { name: "Agree and Continue" }));
    expect(accept).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open with the server's reason when agreeing fails", async () => {
    vi.spyOn(syncRuntime, "acceptTerms").mockRejectedValue(new Error("Can't reach the server."));
    const { user } = renderWithProviders(<TermsGate />);
    pend(true);
    await user.click(await screen.findByRole("button", { name: "Agree and Continue" }));
    expect(await screen.findByText("Can't reach the server.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("can wait: Not Now closes it, and a notice in Settings brings it back", async () => {
    const { user } = renderWithProviders(
      <>
        <TermsGate />
        <TermsLine />
      </>,
    );
    pend(true);
    await user.click(await screen.findByRole("button", { name: "Not Now" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Sync is paused/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review Terms" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows no notice when nothing is owed", () => {
    renderWithProviders(<TermsLine />);
    expect(screen.queryByText(/Sync is paused/)).not.toBeInTheDocument();
    expect(TERMS_VERSION).toBeTruthy();
  });
});
