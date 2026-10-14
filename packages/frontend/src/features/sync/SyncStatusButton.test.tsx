import type { SyncStatus } from "@nookly/shared/sync";
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
import { SyncStatusButton, syncSummary } from "./SyncStatusButton.tsx";
import { useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

const ADA = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "ada",
  email: null,
  emailVerified: false,
  createdAt: "",
};

const status = (patch: Partial<SyncStatus>): SyncStatus => ({
  state: "idle",
  pending: 0,
  conflicts: 0,
  parked: 0,
  lastSyncedAt: null,
  error: null,
  ...patch,
});

afterEach(() => {
  act(() => {
    syncRuntime.store.setState({
      user: null,
      status: status({ state: "off" }),
      migration: null,
      files: null,
    });
    useAccountDialog.getState().close();
    useNavStore.getState().setSettingsOpen(false);
  });
});

describe("the sync status", () => {
  it("offers to sign in while this device doesn't sync", async () => {
    const { user } = renderWithProviders(<SyncStatusButton />);
    const button = screen.getByRole("button", { name: "Not syncing. Sign in to sync." });
    await expectNoA11yViolations();
    await user.click(button);
    expect(useAccountDialog.getState().open).toBe(true);
  });

  it("says synced, syncing, offline with what waits, and conflicts, quietly", () => {
    const signedIn = (s: Partial<SyncStatus>) => ({
      user: ADA,
      status: status(s),
      migration: null,
      files: null,
    });
    expect(syncSummary(signedIn({ state: "idle" })).label).toBe("Synced");
    expect(syncSummary(signedIn({ state: "syncing" })).label).toBe("Syncing");
    expect(syncSummary(signedIn({ state: "offline", pending: 3 })).label).toBe(
      "Offline. 3 changes wait to sync.",
    );
    expect(syncSummary(signedIn({ state: "idle", conflicts: 2 })).label).toBe(
      "2 changes need a look",
    );
    expect(syncSummary(signedIn({ state: "error", error: "Server down" })).label).toBe(
      "Sync stopped: Server down",
    );
  });

  it("opens Account in Settings once signed in", async () => {
    act(() => syncRuntime.store.setState({ user: ADA, status: status({ state: "idle" }) }));
    const { user } = renderWithProviders(<SyncStatusButton />);
    await user.click(screen.getByRole("button", { name: "Synced" }));
    expect(useNavStore.getState().settingsOpen).toBe(true);
  });
});
