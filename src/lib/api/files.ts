import { invoke } from "@tauri-apps/api/core";
import type { FileEntity } from "./types";

export function importFile(spaceId: string, sourcePath: string): Promise<FileEntity> {
  return invoke("import_file", { spaceId, sourcePath });
}

export function createFileLink(spaceId: string, title: string, url: string): Promise<FileEntity> {
  return invoke("create_file_link", { spaceId, title, url });
}

export function listFiles(spaceId: string): Promise<FileEntity[]> {
  return invoke("list_files", { spaceId });
}
