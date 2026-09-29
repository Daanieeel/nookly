import { useEffect } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { type BackupInfo, createBackup, listBackups } from "#/lib/api/backup.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

export const BACKUPS_KEY = "backups";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 60 * 1000;

export function backupFolder(): string | null {
  return preferences.get(STORAGE_KEYS.backupFolder);
}

export function autoBackupEnabled(): boolean {
  return preferences.get(STORAGE_KEYS.backupAuto) === "1";
}

let running: Promise<BackupInfo> | null = null;

/// Backs up to the chosen folder. Calls made while one runs share it, so the
/// button and the daily check never write two backups at once. The outcome is
/// kept in preferences so a failed automatic backup is never silent.
export function runBackup(queryClient: QueryClient): Promise<BackupInfo> {
  const folder = backupFolder();
  if (!folder) return Promise.reject(new Error("Choose a backup folder first"));
  running ??= createBackup(folder)
    .then(
      (info) => {
        preferences.remove(STORAGE_KEYS.backupError);
        return info;
      },
      (error: Error) => {
        preferences.set(STORAGE_KEYS.backupError, error.message);
        throw error;
      },
    )
    .finally(() => {
      running = null;
      void queryClient.invalidateQueries({ queryKey: [BACKUPS_KEY] });
    });
  return running;
}

async function backupIfDue(queryClient: QueryClient) {
  const folder = backupFolder();
  if (!folder || !autoBackupEnabled()) return;
  try {
    const newest = (await listBackups(folder)).find((b) => b.manifest)?.manifest?.createdAt;
    if (newest && Date.now() - Date.parse(newest) < DAY_MS) return;
    await runBackup(queryClient);
  } catch (error) {
    // `runBackup` records its own failure; this catches a folder that can't be listed.
    if (error instanceof Error) preferences.set(STORAGE_KEYS.backupError, error.message);
  }
}

/// With automatic backups on, backs up at launch and then once a day while the app stays open.
export function useAutoBackup() {
  const queryClient = useQueryClient();
  useEffect(() => {
    void backupIfDue(queryClient);
    const timer = setInterval(() => void backupIfDue(queryClient), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [queryClient]);
}
