import type { MigrationState } from "@nookly/shared/sync";
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { FirstSyncDialog } from "./FirstSyncDialog.tsx";
import { useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

const BASE: MigrationState = {
  phase: "sending",
  items: 1204,
  itemsSent: 400,
  files: 37,
  filesSent: 12,
  backupPath: "/Users/ada/Library/Application Support/com.nookly.app/pre-sync-backups/b.zip",
  startedAt: "2026-10-14T10:00:00.000Z",
  finishedAt: null,
  error: null,
};

function show(migration: MigrationState) {
  act(() => syncRuntime.store.setState({ migration }));
  const rendered = renderWithProviders(<FirstSyncDialog />);
  act(() => useAccountDialog.getState().setFirstSyncOpen(true));
  return rendered;
}

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    syncRuntime.store.setState({ migration: null });
    useAccountDialog.getState().setFirstSyncOpen(false);
  });
});

describe("the first sync", () => {
  it("shows the backup, then how much of the items and files went up", async () => {
    show(BASE);
    expect(
      screen.getByRole("dialog", { name: "Bringing this device into your account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Backed up this device")).toBeInTheDocument();
    expect(screen.getByText("400 of 1,204 items")).toBeInTheDocument();
    expect(screen.getByText("12 of 37 files")).toBeInTheDocument();
    const bars = screen.getAllByRole("progressbar");
    expect(bars[0]).toHaveAttribute("aria-valuenow", "400");
    expect(
      screen.getByRole("button", { name: "Keep Going in the Background" }),
    ).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("says when everything is checked and in the account, and that nothing was removed", async () => {
    show({
      ...BASE,
      phase: "done",
      itemsSent: 1204,
      filesSent: 37,
      finishedAt: "2026-10-14T10:05:00.000Z",
    });
    expect(
      screen.getByText(
        "All 1,204 items and 37 files are in your account, checked with the server.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing on this device was removed/)).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("explains a failed backup and tries again on request", async () => {
    const retry = vi.spyOn(syncRuntime, "retryFirstSync").mockResolvedValue();
    const { user } = show({
      ...BASE,
      phase: "failed",
      itemsSent: 0,
      error: "Nookly couldn't back up this device first, so nothing was sent. The disk is full.",
    });
    expect(screen.getByText(/The disk is full/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(retry).toHaveBeenCalled();
  });
});
