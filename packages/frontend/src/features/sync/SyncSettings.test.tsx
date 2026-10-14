import { act, screen, waitFor } from "@testing-library/react";
import { ApiClient, type Session } from "@nookly/shared/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "#/features/settings/SettingsDialog.tsx";
import { settings } from "#/lib/settings/settings.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { syncRuntime } from "./sync-instance.ts";

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
  await rendered.user.click(await screen.findByRole("button", { name: "Sync" }));
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
      },
    });
    useNavStore.getState().setSettingsOpen(false);
  });
});

describe("the Sync settings", () => {
  it("offers to sign in, and says sync is optional", async () => {
    mockCommand("sync_query", []);
    await openSync();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getByText(/It is optional/)).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("needs a server before signing in", async () => {
    mockCommand("sync_query", []);
    const { user } = await openSync();
    await user.type(screen.getByLabelText(/Username or email/), "ada@example.com");
    await user.type(screen.getByLabelText(/^Password/), "a long password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("Enter the server address above first.")).toBeInTheDocument();
  });

  it("refuses a server address that isn't one", async () => {
    mockCommand("sync_query", []);
    const { user } = await openSync();
    await user.type(screen.getByRole("textbox", { name: "Server" }), "not a url{Enter}");
    expect(screen.getByText("Enter an address like https://sync.example.com")).toBeInTheDocument();
    expect(settings.get("sync.serverUrl")).toBe("");
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
    expect(screen.getByText("Email not confirmed")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Synced/);
    expect(await screen.findByText("iPhone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out Device" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Server" })).toBeDisabled();
    await expectNoA11yViolations();
  });

  it("asks to type a phrase before deleting the account", async () => {
    signedIn();
    const { user } = await openSync();
    await user.type(screen.getByLabelText(/Delete account/), "a long password");
    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Delete your sync account forever?");
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Delete Account" }).at(-1)).toBeDisabled(),
    );
    await expectNoA11yViolations();
  });
});

describe("the conflicts list", () => {
  it("brings a lost change back or dismisses it", async () => {
    const conflict = {
      id: "c1",
      table: "tasks",
      pk: "t1",
      field: "effort",
      losingValue: 3,
      losingClock: null,
      winningClock: null,
      createdAt: new Date().toISOString(),
    };
    vi.spyOn(syncRuntime.engine, "conflicts").mockResolvedValue([
      conflict,
      { ...conflict, id: "c2", field: "due_date", losingValue: "2026-10-20" },
    ]);
    const restore = vi.spyOn(syncRuntime.engine, "restoreConflict").mockResolvedValue();
    const dismiss = vi.spyOn(syncRuntime.engine, "dismissConflict").mockResolvedValue();
    const { user } = await openSync();
    const [bringBack] = await screen.findAllByRole("button", { name: "Bring Back" });
    await user.click(bringBack);
    await waitFor(() => expect(restore).toHaveBeenCalledWith("c1"));
    await user.click(screen.getAllByRole("button", { name: "Dismiss Conflict" })[1]);
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith("c2"));
    await expectNoA11yViolations();
  });
});
