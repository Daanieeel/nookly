import { ApiClient, ApiRequestError, type SecuritySummary } from "@nookly/shared/api";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { SecurityDialog } from "./SecurityDialog.tsx";
import { useSecurityDialog } from "./security-dialog-store.ts";
import { recheck } from "./recheck-gate.ts";
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
  act(() => recheck.finish(false));
  vi.restoreAllMocks();
  act(() => {
    useSecurityDialog.getState().close();
    syncRuntime.store.setState({ user: null });
  });
});

function signedIn(extra: { twoFactorRequired?: boolean } = {}) {
  act(() => syncRuntime.store.setState({ user: { ...ADA, ...extra } }));
}

/// Turns on emailed codes through the dialog, as a person does, and leaves the account no
/// longer owing two-factor (the dialog stays, being set up).
async function turnOnEmail(user: ReturnType<typeof renderWithProviders>["user"]) {
  vi.spyOn(api, "enableEmailTwoFactor").mockImplementation(async () => {
    summary = { ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } };
    return summary;
  });
  await user.click(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  signedIn({ twoFactorRequired: false });
  await screen.findByRole("button", { name: "Turn Off Emailed Codes" });
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
    // The rows say what they are by their title; no sentence explaining the obvious.
    expect(screen.queryByText("A code from an app on your phone.")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs an email address.")).not.toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("keeps a long key inside the window instead of stretching it, and scrolls when tall", async () => {
    openFromSettings();
    const dialog = await screen.findByRole("dialog", { name: "Two-factor sign in" });
    // One column that cannot grow past the window, like the account dialog.
    expect(dialog).toHaveClass("grid-cols-1", "overflow-y-auto", "max-h-[calc(100dvh-2rem)]");
  });

  it("turns on emailed codes", async () => {
    const enable = vi.spyOn(api, "enableEmailTwoFactor").mockImplementation(async () => {
      summary = { ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } };
      return summary;
    });
    const { user } = openFromSettings();
    await user.click(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
    // The step says what happens; no password is asked here.
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    await expectNoA11yViolations();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(enable).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Turn Off Emailed Codes" })).toBeVisible();
    expect(syncRuntime.twoFactorChanged).toHaveBeenCalled();
  });

  it("asks to confirm it is you when the server wants that, then goes on", async () => {
    const enable = vi
      .spyOn(api, "enableEmailTwoFactor")
      .mockRejectedValueOnce(new ApiRequestError(403, "recheck_required", "Confirm it's you."))
      .mockImplementation(async () => {
        summary = { ...NOTHING, enabled: true, email: { ...NOTHING.email, enabled: true } };
        return summary;
      });
    const { user } = openFromSettings();
    await user.click(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(recheck.store.getState().asking).toBe(true));
    act(() => recheck.finish(true));
    expect(await screen.findByRole("button", { name: "Turn Off Emailed Codes" })).toBeVisible();
    expect(enable).toHaveBeenCalledTimes(2);
  });

  it("says nothing went wrong when the person closes that question", async () => {
    vi.spyOn(api, "enableEmailTwoFactor").mockRejectedValue(
      new ApiRequestError(403, "recheck_required", "Confirm it's you."),
    );
    const { user } = openFromSettings();
    await user.click(await screen.findByRole("button", { name: "Turn On Emailed Codes" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(recheck.store.getState().asking).toBe(true));
    act(() => recheck.finish(false));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
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
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("img", { name: /QR code/ })).toBeVisible();
    // The key is for typing by hand when scanning can't: shown as it is, above the boxes under
    // its separator, with a button to copy it.
    const separator = screen.getByText("or set up manually");
    const key = screen.getByText("ABCD EFGH IJKL");
    const boxes = screen.getByLabelText("Code from the app");
    expect(screen.queryByRole("button", { name: "Show key" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
    expect(separator.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(key.compareDocumentPosition(boxes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expectNoA11yViolations();
    // Six boxes, not one field; the last digit turns it on.
    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Turn On" })).toBeDisabled();
    // The boxes need no written label or hint (they are still named for a screen reader).
    expect(screen.queryByText("Code from the app")).not.toBeInTheDocument();
    expect(screen.queryByText("The 6 digits it shows now.")).not.toBeInTheDocument();
    // Centered under the key, not pushed to the left.
    expect(
      screen.getByLabelText(/^Code from the app/).closest("[data-input-otp-container]"),
    ).toHaveClass("justify-center");
    await user.type(screen.getByLabelText(/^Code from the app/), "123 456");
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("123456"));

    expect(await screen.findByText("aaaaa-bbbbb")).toBeVisible();
    expect(screen.getByText("ccccc-ddddd")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "I Saved Them" }));
    expect(screen.queryByText("aaaaa-bbbbb")).not.toBeInTheDocument();
    expect(syncRuntime.twoFactorChanged).toHaveBeenCalled();
  });

  it("turns the boxes red and empties them when the code is wrong", async () => {
    vi.spyOn(api, "startAuthenticator").mockResolvedValue({
      uri: "otpauth://totp/x?secret=ABC",
      key: "ABCD",
    });
    vi.spyOn(api, "confirmAuthenticator").mockRejectedValue(
      new ApiRequestError(400, "invalid_code", "That code isn't right."),
    );
    const { user } = openFromSettings();
    await user.click(await screen.findByRole("button", { name: "Set Up Authenticator App" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Code from the app"), "000000");
    await waitFor(() =>
      expect(document.querySelector('[data-slot="input-otp-slot"]')).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    // Red boxes are the message: no sentence under them.
    expect(screen.queryByText(/That code isn't right/)).not.toBeInTheDocument();
    const slots = () => [...document.querySelectorAll('[data-slot="input-otp-slot"]')];
    expect(slots().every((slot) => slot.getAttribute("aria-invalid") === "true")).toBe(true);
    expect(slots().every((slot) => slot.textContent === "")).toBe(true);
    await user.type(screen.getByLabelText("Code from the app"), "1");
    expect(slots().some((slot) => slot.hasAttribute("aria-invalid"))).toBe(false);
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
    // There is no close button, and Escape does not get out of it either.
    expect(screen.getByRole("dialog")).toHaveClass("[&>button]:hidden");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    // Leaving is the destructive way out: the solid red button.
    expect(screen.getByRole("button", { name: "Sign Out" })).toHaveClass(
      "[--solid:var(--color-solid-destructive)]",
    );
    await user.click(screen.getByRole("button", { name: "Sign Out" }));
    // The usual question, with the copy kept: nothing leaves this computer by accident.
    const leaving = await screen.findByRole("alertdialog", { name: "Sign out of this computer?" });
    expect(within(leaving).getByRole("checkbox", { name: "Keep a local copy" })).toBeChecked();
    expect(signOut).not.toHaveBeenCalled();
    await expectNoA11yViolations();
    await user.click(within(leaving).getByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ keepLocalCopy: true }));
  });

  it("keeps its close button when it was opened from Settings", async () => {
    renderWithProviders(<SecurityDialog />);
    signedIn({ twoFactorRequired: false });
    act(() => useSecurityDialog.getState().show());
    expect(await screen.findByRole("dialog", { name: "Two-factor sign in" })).not.toHaveClass(
      "[&>button]:hidden",
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("lists emailed codes first, the standard way, and the authenticator app after it", async () => {
    openFromSettings();
    const email = await screen.findByText("Emailed codes");
    const app = screen.getByText("Authenticator app");
    expect(email.compareDocumentPosition(app) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("returns to the list after a method is set up, and goes on to the recovery codes from Continue", async () => {
    summary = { ...NOTHING, required: true };
    const { user } = renderWithProviders(<SecurityDialog />);
    signedIn({ twoFactorRequired: true });
    expect(await screen.findByRole("dialog", { name: "Set up two-factor sign in" })).toBeVisible();
    // Nothing to continue with yet: no method is on.
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    vi.spyOn(api, "startAuthenticator").mockResolvedValue({
      uri: "otpauth://totp/Nookly:ada?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=Nookly",
      key: "ABCD EFGH IJKL",
    });
    vi.spyOn(api, "confirmAuthenticator").mockImplementation(async () => {
      summary = { ...NOTHING, enabled: true, authenticator: { enabled: true }, backupCodesLeft: 2 };
      return ["aaaaa-bbbbb", "ccccc-ddddd"];
    });
    await user.click(await screen.findByRole("button", { name: "Set Up Authenticator App" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Code from the app"), "123456");

    // Back on the list, where another way can be added, with Continue at the bottom right.
    signedIn({ twoFactorRequired: false });
    expect(await screen.findByRole("button", { name: "Turn On Emailed Codes" })).toBeVisible();
    expect(screen.queryByText("aaaaa-bbbbb")).not.toBeInTheDocument();
    expect(screen.queryByText("Recovery codes")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Set up two-factor sign in" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("aaaaa-bbbbb")).toBeVisible();
    expect(screen.getByText("ccccc-ddddd")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "I Saved Them" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("makes recovery codes when only emailed codes are on", async () => {
    summary = { ...NOTHING, required: true };
    const { user } = renderWithProviders(<SecurityDialog />);
    signedIn({ twoFactorRequired: true });
    await screen.findByRole("dialog", { name: "Set up two-factor sign in" });
    const codes = vi.spyOn(api, "newBackupCodes").mockResolvedValue(["eeeee-fffff"]);
    await turnOnEmail(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(codes).toHaveBeenCalled();
    expect(await screen.findByText("eeeee-fffff")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "I Saved Them" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cannot be closed while it is being set up, even once a method is on", async () => {
    summary = { ...NOTHING, required: true };
    const { user } = renderWithProviders(<SecurityDialog />);
    signedIn({ twoFactorRequired: true });
    await screen.findByRole("dialog", { name: "Set up two-factor sign in" });
    await turnOnEmail(user);
    await screen.findByRole("button", { name: "Continue" });
    expect(screen.getByRole("dialog")).toHaveClass("[&>button]:hidden");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("does not tell an unconfirmed address to be confirmed first", async () => {
    summary = {
      ...NOTHING,
      email: { enabled: false, possible: false, address: "ada@example.com", confirmed: false },
    };
    openFromSettings();
    expect(await screen.findByRole("button", { name: "Send Confirmation Link" })).toBeVisible();
    expect(screen.queryByText(/Confirm ada@example.com first/)).not.toBeInTheDocument();
  });

  it("keeps every button in the footer, with Sign Out at its left, while two-factor is required", async () => {
    summary = { ...NOTHING, required: true };
    const { user } = renderWithProviders(<SecurityDialog />);
    signedIn({ twoFactorRequired: true });
    await user.click(await screen.findByRole("button", { name: "Set Up Authenticator App" }));
    const footer = screen.getByRole("button", { name: "Sign Out" }).parentElement;
    if (!footer) throw new Error("Sign Out has no footer");
    expect(footer.firstElementChild).toBe(screen.getByRole("button", { name: "Sign Out" }));
    // The step's own buttons are down here too, not above the footer.
    expect(within(footer).getByRole("button", { name: "Back" })).toBeVisible();
    // The footer's button sends the form that sits above it.
    expect(within(footer).getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("says so when an older server has none for an account without a password", async () => {
    summary = { ...NOTHING, available: false };
    openFromSettings();
    await waitFor(() => expect(api.security).toHaveBeenCalled());
    expect(await screen.findByText(/only for accounts with a password/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set Up Authenticator App" })).toBeNull();
  });
});
