import { invoke } from "@tauri-apps/api/core";
import type { FileEntity } from "./types";

export function importFile(spaceId: string, sourcePath: string): Promise<FileEntity> {
  return invoke("import_file", { spaceId, sourcePath });
}

/// What a link turned into: a stored File, or a webpage to save as a Bookmark.
export type LinkImport = { kind: "file"; file: FileEntity } | { kind: "webpage" };

/// Downloads the file behind a link (share links included) into storage.
export function importFileFromUrl(spaceId: string, url: string): Promise<LinkImport> {
  return invoke("import_file_from_url", { spaceId, url });
}

/// Downloads the file behind a link-only File, from before links were stored.
export function downloadLinkedFile(entityId: string): Promise<LinkImport> {
  return invoke("download_linked_file", { entityId });
}

export function getFile(entityId: string): Promise<FileEntity> {
  return invoke("get_file", { entityId });
}

export function listFiles(spaceId: string): Promise<FileEntity[]> {
  return invoke("list_files", { spaceId });
}

/// Copies an imported file out of Nookly's storage to `destination`.
export function exportFile(entityId: string, destination: string): Promise<void> {
  return invoke("export_file", { entityId, destination });
}

/// Swaps the stored copy for a newer version; same File, labels and relationships.
export function replaceFile(entityId: string, sourcePath: string): Promise<FileEntity> {
  return invoke("replace_file", { entityId, sourcePath });
}

/// Corrects a File's Added date; it otherwise defaults to the day it was
/// imported or downloaded.
export function setFileAddedAt(entityId: string, addedAt: string): Promise<FileEntity> {
  return invoke("set_file_added_at", { entityId, addedAt });
}

/// Adds a file from disk by reference, leaving it where it is.
export function referenceFile(spaceId: string, path: string): Promise<FileEntity> {
  return invoke("reference_file", { spaceId, path });
}

/// Copies a referenced file into Nookly's own storage.
export function copyFileIntoStorage(entityId: string): Promise<FileEntity> {
  return invoke("copy_file_into_storage", { entityId });
}

/// Opens the file (stored copy or referenced original) in its default app.
export function openFile(entityId: string): Promise<void> {
  return invoke("open_file", { entityId });
}

/// Shows the file in Finder or the platform's file manager.
export function revealFile(entityId: string): Promise<void> {
  return invoke("reveal_file", { entityId });
}

export interface OpenWithApp {
  name: string;
  path: string;
  isDefault: boolean;
  /// PNG data URL, when the platform provides one.
  icon: string | null;
}

/// Apps the system says can open this file, its default app first. Empty where
/// the platform can't be asked (only macOS so far).
export function listOpenWithApps(entityId: string): Promise<OpenWithApp[]> {
  return invoke("list_open_with_apps", { entityId });
}

/// Opens the file with a specific app, by name or path.
export function openFileWith(entityId: string, appPath: string): Promise<void> {
  return invoke("open_file_with", { entityId, appPath });
}
