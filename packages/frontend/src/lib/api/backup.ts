import { invoke } from "@tauri-apps/api/core";

/// Backups of the whole app to a folder. See `src-tauri/src/backup/mod.rs`.

/// How many backups a folder keeps; the oldest beyond this are removed after a new one is verified.
export const BACKUP_KEEP = 10;

export interface BackupManifest {
  appVersion: string;
  createdAt: string;
  /// Files besides the database.
  fileCount: number;
  bytes: number;
  /// Files added by reference, which stay where they are and are not in the backup.
  referencedFiles: number;
}

export interface BackupInfo {
  path: string;
  name: string;
  size: number;
  /// Null when the zip is not a readable Nookly backup.
  manifest: BackupManifest | null;
}

export function createBackup(folder: string): Promise<BackupInfo> {
  return invoke("create_backup", { folder, keep: BACKUP_KEEP });
}

export function listBackups(folder: string): Promise<BackupInfo[]> {
  return invoke("list_backups", { folder });
}

export function inspectBackup(path: string): Promise<BackupManifest> {
  return invoke("inspect_backup", { path });
}

/// Stages the restore; it installs when the app restarts.
export function restoreBackup(path: string): Promise<BackupManifest> {
  return invoke("restore_backup", { path });
}
