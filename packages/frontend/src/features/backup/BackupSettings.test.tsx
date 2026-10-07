import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsDialog } from "#/features/settings/SettingsDialog.tsx";
import type { BackupInfo } from "#/lib/api/backup.ts";
import { settings } from "#/lib/settings/settings.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";

const BACKUP: BackupInfo = {
  path: "/b/nookly-backup.zip",
  name: "nookly-backup.zip",
  size: 2048,
  manifest: {
    appVersion: "0.18.37",
    createdAt: "2026-10-01T10:00:00Z",
    fileCount: 4,
    bytes: 4096,
    referencedFiles: 0,
  },
};

async function openBackupTab() {
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  await rendered.user.click(await screen.findByRole("button", { name: "Backup" }));
  return rendered;
}

beforeEach(() => {
  act(() => useNavStore.getState().setSettingsOpen(false));
  settings.set("backup.folder", "/b");
  settings.set("backup.auto", false);
  mockCommand("list_backups", [BACKUP]);
});

describe("the Backup tab in Settings", () => {
  it("is a category of its own after Notes, and General no longer has a backup row", async () => {
    const { user } = await openBackupTab();
    const nav = screen.getByRole("navigation", { name: "Settings categories" });
    const names = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names.indexOf("Backup")).toBe(names.indexOf("Notes") + 1);
    expect(screen.getByRole("heading", { level: 2, name: "Backup" })).toBeInTheDocument();
    await user.click(within(nav).getByRole("button", { name: "General" }));
    expect(screen.queryByText("Back up and restore")).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage" })).toBeNull();
  });

  it("shows the folder, the daily switch, backing up now and the backups to restore", async () => {
    await openBackupTab();
    expect(document.querySelector('[data-setting-id="backup.folder"]')).not.toBeNull();
    expect(document.querySelector('[data-setting-id="backup.auto"]')).not.toBeNull();
    expect(screen.getByText("/b")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Back up every day" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "From a file" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("backs up to the chosen folder", async () => {
    mockCommand("create_backup", BACKUP);
    const { user } = await openBackupTab();
    await user.click(screen.getByRole("button", { name: "Back up now" }));
    await waitFor(() => expect(callsOf("create_backup")).toEqual([{ folder: "/b", keep: 10 }]));
  });

  it("will not restore until the phrase is typed", async () => {
    mockCommand("restore_backup", BACKUP.manifest);
    mockCommand("plugin:process|restart", null);
    const { user } = await openBackupTab();
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Replace and Restart" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(callsOf("restore_backup")).toEqual([]);
    await user.type(within(dialog).getByRole("textbox"), "RESTORE");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(callsOf("restore_backup")).toEqual([{ path: BACKUP.path }]));
  });

  it("restores nothing when the confirmation is cancelled", async () => {
    const { user } = await openBackupTab();
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(callsOf("restore_backup")).toEqual([]);
  });

  it("has no restore without a folder, and disables the daily switch", async () => {
    settings.set("backup.folder", null);
    await openBackupTab();
    expect(screen.getByRole("switch", { name: "Back up every day" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back up now" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it.each(["export", "restore", "save", "copy", "archive"])(
    "is found by searching %j",
    async (word) => {
      const { user } = renderWithProviders(<SettingsDialog />);
      act(() => useNavStore.getState().setSettingsOpen(true));
      await user.type(await screen.findByRole("searchbox"), word);
      expect(document.querySelector('[data-setting-id="backup.folder"]')).not.toBeNull();
      expect(screen.getByRole("group", { name: "Back up now" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Restore from a backup" })).toBeInTheDocument();
    },
  );

  it("has no axe violations, with the restore confirmation open too", async () => {
    const { user } = await openBackupTab();
    await expectNoA11yViolations();
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    await screen.findByRole("alertdialog");
    await expectNoA11yViolations();
  });
});
