import { ApiClient, type SecuritySummary } from "@nookly/shared/api";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { SecurityDialog } from "./SecurityDialog.tsx";
import { useSecurityDialog } from "./security-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

const ADA = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "ada",
  email: "ada@example.com",
  emailVerified: true,
  createdAt: "",
  termsVersion: null,
  needsUsername: false,
};

const NOTHING: SecuritySummary = {
  available: true,
  required: false,
  enabled: false,
  email: { enabled: false, possible: true, address: "ada@example.com", confirmed: true },
  authenticator: { enabled: false },
  backupCodesLeft: 0,
};

let api: ApiClient;
let summary: SecuritySummary;

beforeEach(() => {
  summary = NOTHING;
  api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  vi.spyOn(api, "security").mockImplementation(async () => summary);
  vi.spyOn(syncRuntime, "account").mockReturnValue(api);
  vi.spyOn(syncRuntime, "twoFactorChanged").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    useSecurityDialog.getState().close();
    syncRuntime.store.setState({ user: null });
  });
});

function signedIn(extra: { twoFactorRequired?: boolean } = {}) {
  act(() => syncRuntime.store.setState({ user: { ...ADA, ...extra } }));
}

function openFromSettings() {
  const rendered = renderWithProviders(<SecurityDialog />);
  signedIn();
  act(() => useSecurityDialog.getState().show());
  return rendered;
}

describe("the security dialog", () => {
  it("lists what the account has, with no accessibility violations", async () => {
    openFromSettings();
    expect(await screen.findByRole("dialog", { name: "Two-factor sign in" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Set Up Authenticator App" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Turn On Emailed Codes" })).toBeVisible();
    await expectNoA11yViolations();
  });

  it("turns on emailed codes with the password", async () => {
    const enable = vi.spyOn(api, "enableEmailTwoFactor").mockImplementation(async () => {
      summary = { ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } };
      return summary;
    });
    const { user } = openFromSettings();
    await user.click(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(enable).toHaveBeenCalledWith("a long password");
    expect(await screen.findByRole("button", { name: "Turn Off Emailed Codes" })).toBeVisible();
    expect(syncRuntime.twoFactorChanged).toHaveBeenCalled();
  });

  it("adds an authenticator app: the key to scan, a code to prove it, and recovery codes shown once", async () => {
    vi.spyOn(api, "startAuthenticator").mockResolvedValue({
      uri: "otpauth://totp/Nookly:ada?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Nookly",
      key: "ABCD EFGH IJKL",
    });
    const confirm = vi
      .spyOn(api, "confirmAuthenticator")
      .mockResolvedValue(["aaaaa-bbbbb", "ccccc-ddddd"]);
    const { user } = openFromSettings();
    await user.click(await screen.findByRole("button", { name: "Set Up Authenticator App" }));
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("img", { name: /QR code/ })).toBeVisible();
    expect(screen.getByText("ABCD EFGH IJKL")).toBeVisible();
    await expectNoA11yViolations();
    await user.type(screen.getByLabelText(/^Code from the app/), "123 456");
    await user.click(screen.getByRole("button", { name: "Turn On" }));
    expect(confirm).toHaveBeenCalledWith("123456");

    expect(await screen.findByText("aaaaa-bbbbb")).toBeVisible();
    expect(screen.getByText("ccccc-ddddd")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "I Saved Them" }));
    expect(screen.queryByText("aaaaa-bbbbb")).not.toBeInTheDocument();
    expect(syncRuntime.twoFactorChanged).toHaveBeenCalled();
  });

  it("asks an account with no email for one, before codes can be emailed", async () => {
    summary = {
      ...NOTHING,
      email: { enabled: false, possible: false, address: null, confirmed: false },
    };
    const add = vi.spyOn(api, "addEmail").mockResolvedValue({ ...ADA, email: "ada@new.test" });
    const { user } = openFromSettings();
    await user.click(await screen.findByRole("button", { name: "Add an Email Address" }));
    await user.type(screen.getByLabelText(/^Email/), "ada@new.test");
    await user.click(screen.getByRole("button", { name: "Send Confirmation" }));
    expect(add).toHaveBeenCalledWith("ada@new.test");
  });

  it("cannot be closed while the account owes two-factor, and offers the way out", async () => {
    summary = { ...NOTHING, required: true };
    const signOut = vi
      .spyOn(syncRuntime, "signOut")
      .mockResolvedValue({ unsent: 0, backupPath: null });
    const { user } = renderWithProviders(<SecurityDialog />);
    signedIn({ twoFactorRequired: true });
    expect(await screen.findByRole("dialog", { name: "Set up two-factor sign in" })).toBeVisible();
    // Neither Escape nor the close button gets out of it.
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("stays away from an account that signs in with another provider", async () => {
    summary = { ...NOTHING, available: false };
    openFromSettings();
    await waitFor(() => expect(api.security).toHaveBeenCalled());
    expect(await screen.findByText(/signs in with another account/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set Up Authenticator App" })).toBeNull();
  });
});
