import { act, screen, waitFor, within } from "@testing-library/react";
import { ApiClient, type Session, PRODUCTION_SERVER } from "@nookly/shared/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "#/features/settings/SettingsDialog.tsx";
import { settings } from "#/lib/settings/settings.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { syncRuntime } from "./sync-instance.ts";
import { useAccountDialog } from "./account-dialog-store.ts";

const ADA = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "ada",
  email: "ada@example.com",
  emailVerified: false,
  createdAt: "",
};

async function openSync() {
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  await rendered.user.click(await screen.findByRole("button", { name: "Account" }));
  return rendered;
}

async function openGeneral() {
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  await rendered.user.click(await screen.findByRole("button", { name: "General" }));
  return rendered;
}

function signedIn(sessions: Session[] = []) {
  mockCommand("sync_query", []);
  const api = new ApiClient({
    baseUrl: "https://sync.example.com",
    tokens: { load: async () => null, save: async () => {} },
  });
  vi.spyOn(api, "sessions").mockResolvedValue(sessions);
  vi.spyOn(api, "sharesWithMe").mockResolvedValue([]);
  vi.spyOn(syncRuntime, "account").mockReturnValue(api);
  act(() =>
    syncRuntime.store.setState({
      user: ADA,
      serverUrl: "https://sync.example.com",
      status: {
        state: "idle",
        pending: 0,
        conflicts: 0,
        parked: 0,
        lastSyncedAt: Date.now(),
        error: null,
        live: true,
        lastChangedAt: null,
      },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    syncRuntime.store.setState({
      user: null,
      serverUrl: null,
      status: {
        state: "off",
        pending: 0,
        conflicts: 0,
        parked: 0,
        lastSyncedAt: null,
        error: null,
        live: true,
        lastChangedAt: null,
      },
    });
    useNavStore.getState().setSettingsOpen(false);
  });
});

describe("the Sync settings", () => {
  it("says what signing out does, and what has not been sent, before it signs out", async () => {
    signedIn();
    vi.spyOn(syncRuntime, "unsentCount").mockResolvedValue(3);
    const signOut = vi
      .spyOn(syncRuntime, "signOut")
      .mockResolvedValue({ unsent: 3, backupPath: "/backups/x" });
    const { user } = await openSync();
    await user.click(await screen.findByRole("button", { name: "Sign Out" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Sign out of this computer?" });
    expect(dialog).toHaveTextContent("Removed from this computer");
    // The files are not deleted from the disk, and the dialog doesn't claim they are.
    expect(dialog).toHaveTextContent("Attached files stay in Nookly's folder");
    await waitFor(() => expect(dialog).toHaveTextContent("3 changes not sent yet"));
    expect(signOut).not.toHaveBeenCalled();
    await expectNoA11yViolations();
    // Signing out is a warning, not a deletion: the account keeps everything, and it comes back.
    const confirm = within(dialog).getByRole("button", { name: "Sign Out" });
    expect(confirm.className).toContain("solid-warning");
    expect(confirm.className).not.toContain("solid-destructive");
    await user.click(confirm);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("has no Shared with me section, as sharing is not possible yet", async () => {
    signedIn();
    await openSync();
    expect(await screen.findByText("Devices")).toBeInTheDocument();
    expect(screen.queryByText("Shared with me")).toBeNull();
    expect(screen.queryByText(/Nothing is shared with you/)).toBeNull();
  });

  it("puts Change password above the devices, and Delete account last", async () => {
    signedIn();
    await openSync();
    const password = await screen.findByRole("heading", { name: "Password" });
    const devices = screen.getByRole("heading", { name: "Devices" });
    const remove = screen.getByRole("heading", { name: "Delete account" });
    expect(
      password.compareDocumentPosition(devices) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(devices.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the way out as a warning before the dialog opens", async () => {
    signedIn();
    await openSync();
    const button = await screen.findByRole("button", { name: "Sign Out" });
    expect(button.className).toContain("solid-warning");
  });

  it("says it in short lines, not a paragraph", async () => {
    signedIn();
    vi.spyOn(syncRuntime, "unsentCount").mockResolvedValue(0);
    const { user } = await openSync();
    await user.click(await screen.findByRole("button", { name: "Sign Out" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Sign out of this computer?" });
    const lines = within(dialog).getAllByRole("listitem");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) expect(line.textContent?.length ?? 0).toBeLessThan(70);
  });

  it("signs out without a local copy unless asked, and removes the data from this computer", async () => {
    signedIn();
    vi.spyOn(syncRuntime, "unsentCount").mockResolvedValue(0);
    const signOut = vi
      .spyOn(syncRuntime, "signOut")
      .mockResolvedValue({ unsent: 0, backupPath: null });
    const { user } = await openSync();
    await user.click(await screen.findByRole("button", { name: "Sign Out" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Sign out of this computer?" });
    const keep = within(dialog).getByRole("checkbox", { name: "Keep a local copy" });
    expect(keep).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Sign Out" }));
    expect(signOut).toHaveBeenCalledWith({ keepLocalCopy: false });
  });

  it("keeps a local copy after signing out when asked to", async () => {
    signedIn();
    vi.spyOn(syncRuntime, "unsentCount").mockResolvedValue(0);
    const signOut = vi
      .spyOn(syncRuntime, "signOut")
      .mockResolvedValue({ unsent: 0, backupPath: null });
    const { user } = await openSync();
    await user.click(await screen.findByRole("button", { name: "Sign Out" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Sign out of this computer?" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Keep a local copy" }));
    expect(dialog).toHaveTextContent("A copy stays on this computer");
    expect(dialog).not.toHaveTextContent("Removed from this computer");
    await expectNoA11yViolations();
    await user.click(within(dialog).getByRole("button", { name: "Sign Out" }));
    expect(signOut).toHaveBeenCalledWith({ keepLocalCopy: true });
  });

  it("offers to sign in, and says sync is optional", async () => {
    mockCommand("sync_query", []);
    await openSync();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getByText(/^Optional\./)).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("opens the sign in dialog, or the one to create an account", async () => {
    mockCommand("sync_query", []);
    const { user } = await openSync();
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    expect(useAccountDialog.getState()).toMatchObject({ open: true, mode: "signUp" });
    act(() => useAccountDialog.getState().close());
  });

  it("keeps the server address in General, set to Nookly's own until changed", async () => {
    mockCommand("sync_query", []);
    const account = await openSync();
    expect(screen.queryByRole("textbox", { name: "Server" })).not.toBeInTheDocument();
    await account.user.click(screen.getByRole("button", { name: "General" }));
    // The https:// is shown beside the icon, never typed.
    expect(screen.getByRole("textbox", { name: "Server" })).toHaveValue(
      PRODUCTION_SERVER.replace("https://", ""),
    );
    expect(settings.get("sync.serverUrl")).toBe(PRODUCTION_SERVER);
  });

  it("changes the server address from General", async () => {
    mockCommand("sync_query", []);
    const { user } = await openGeneral();
    const field = screen.getByRole("textbox", { name: "Server" });
    await user.clear(field);
    await user.type(field, "sync.example.com{Enter}");
    expect(settings.get("sync.serverUrl")).toBe("https://sync.example.com");
    act(() => settings.reset("sync.serverUrl"));
  });

  it("refuses a server address that isn't one", async () => {
    mockCommand("sync_query", []);
    const { user } = await openGeneral();
    const field = screen.getByRole("textbox", { name: "Server" });
    await user.clear(field);
    await user.type(field, "not a url{Enter}");
    expect(screen.getByText("Enter an address like sync.example.com")).toBeInTheDocument();
    expect(settings.get("sync.serverUrl")).toBe(PRODUCTION_SERVER);
  });

  it("locks the server address while signed in, until signing out", async () => {
    signedIn();
    await openGeneral();
    const field = screen.getByRole("textbox", { name: "Server" });
    expect(field).toBeDisabled();
    expect(field).toHaveAttribute("title", "Sign out to change the server");
  });

  it("shows the account, its status and its devices once signed in", async () => {
    signedIn([
      {
        id: "00000000-0000-4000-8000-00000000000a",
        deviceName: "Nookly on Mac",
        platform: "macos",
        createdAt: "",
        lastUsedAt: new Date().toISOString(),
        current: true,
      },
      {
        id: "00000000-0000-4000-8000-00000000000b",
        deviceName: "iPhone",
        platform: "ios",
        createdAt: "",
        lastUsedAt: new Date().toISOString(),
        current: false,
      },
    ]);
    await openSync();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Confirm ada@example.com to reset/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Synced/);
    expect(await screen.findByText("iPhone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out Device" })).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("keeps both password forms off the page and opens each in a dialog", async () => {
    signedIn();
    await openSync();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(screen.queryByLabelText(/Your password/)).toBeNull();
    expect(screen.getByRole("button", { name: "Change Password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
  });

  it("changes the password from a dialog, which closes when it is done", async () => {
    signedIn();
    const change = vi.spyOn(syncRuntime.account()!, "changePassword").mockResolvedValue();
    const { user } = await openSync();
    await user.click(screen.getByRole("button", { name: "Change Password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Password" });
    await user.type(within(dialog).getByLabelText("Current password"), "old password");
    await user.type(within(dialog).getByLabelText("New password"), "a much newer password");
    await user.type(within(dialog).getByLabelText("Repeat new password"), "a much newer password");
    await expectNoA11yViolations();
    await user.click(within(dialog).getByRole("button", { name: "Change Password" }));
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith("old password", "a much newer password"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Change Password" })).toBeNull(),
    );
  });

  it("asks for the new password twice and rates it, but never refuses a weak one", async () => {
    signedIn();
    const change = vi.spyOn(syncRuntime.account()!, "changePassword").mockResolvedValue();
    const { user } = await openSync();
    await user.click(screen.getByRole("button", { name: "Change Password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Password" });
    // Nothing to rate before there is a new password.
    expect(within(dialog).queryByRole("meter")).toBeNull();
    await user.type(within(dialog).getByLabelText("Current password"), "old password");
    await user.type(within(dialog).getByLabelText("New password"), "password1234");
    const confirm = within(dialog).getByLabelText("Repeat new password");
    // The bar sits under the second field.
    const meter = within(dialog).getByRole("meter", { name: "Password strength" });
    expect(confirm.compareDocumentPosition(meter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(meter).toHaveAttribute("aria-valuetext", expect.stringMatching(/weak/i));
    // Two different entries are caught.
    await user.type(confirm, "password12345");
    await user.click(within(dialog).getByRole("button", { name: "Change Password" }));
    expect(await within(dialog).findByText("The passwords don't match")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    // A weak password goes through once it is typed twice: the bar only advises.
    await user.clear(confirm);
    await user.type(confirm, "password1234");
    await user.click(within(dialog).getByRole("button", { name: "Change Password" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith("old password", "password1234"));
    await expectNoA11yViolations();
  });

  it("rates a strong password strong", async () => {
    signedIn();
    const { user } = await openSync();
    await user.click(screen.getByRole("button", { name: "Change Password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Password" });
    await user.type(
      within(dialog).getByLabelText("New password"),
      "violet lantern kettle orbit ferment",
    );
    expect(within(dialog).getByRole("meter", { name: "Password strength" })).toHaveAttribute(
      "aria-valuetext",
      "Strong",
    );
  });

  it("asks for the password and a typed phrase in a dialog before deleting the account", async () => {
    signedIn();
    const remove = vi.spyOn(syncRuntime.account()!, "deleteAccount").mockResolvedValue();
    vi.spyOn(syncRuntime, "detach").mockResolvedValue();
    const { user } = await openSync();
    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete your sync account forever?");
    const confirm = within(dialog).getByRole("button", { name: "Delete Account" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Your password/), "a long password");
    // The phrase is still missing.
    expect(confirm).toBeDisabled();
    await expectNoA11yViolations();
    await user.type(within(dialog).getByLabelText(/Type delete my account/), "delete my account");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(remove).toHaveBeenCalledWith("a long password"));
  });
});

describe("the conflicts summary", () => {
  /// The count is the sync status's: the device's own conflicts and the ones only the
  /// server logged, the same list the merge editor shows. It used to read only the
  /// device's own log, so a conflict the server logged never showed here.
  const withConflicts = (conflicts: number) =>
    act(() =>
      syncRuntime.store.setState({
        status: { ...syncRuntime.store.getState().status, conflicts },
      }),
    );

  it("counts the changes that need a look and opens the merge editor", async () => {
    signedIn();
    const { user } = await openSync();
    withConflicts(2);
    expect(await screen.findByText("2 changes need a look")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review Changes" }));
    expect(useAccountDialog.getState().mergeOpen).toBe(true);
    act(() => useAccountDialog.getState().setMergeOpen(false));
    withConflicts(0);
    await expectNoA11yViolations();
  });

  it("shows nothing at all when there are none", async () => {
    signedIn();
    await openSync();
    withConflicts(0);
    expect(screen.queryByText("Nothing to review")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review Changes" })).toBeNull();
  });
});
