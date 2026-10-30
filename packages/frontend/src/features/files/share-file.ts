import { save } from "@tauri-apps/plugin-dialog";
import { exportFile } from "#/lib/api/files.ts";
import type { FileEntity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import type { ShareOutcome } from "#/features/notes/share-page.ts";

/// The biggest file read into memory to share. Past it the share goes through a saved
/// copy: the webview needs the whole file in hand to share it.
export const MAX_SHARE_BYTES = 25_000_000;

function fileName(file: FileEntity): string {
  return file.originalFilename ?? displayTitle(file.entity);
}

/// The file's bytes, read ahead of the click: the webview only starts a share from a
/// click, so nothing can be awaited between the two. `null` when it is too big.
export async function readFileForShare(src: string): Promise<Blob | null> {
  const response = await fetch(src);
  if (Number(response.headers.get("content-length")) > MAX_SHARE_BYTES) return null;
  const blob = await response.blob();
  return blob.size > MAX_SHARE_BYTES ? null : blob;
}

/// Asks where to put a copy of the stored file and writes it. Resolves the chosen path,
/// or `null` when the user cancels the save dialog.
export async function saveFileCopy(file: FileEntity): Promise<string | null> {
  const path = await save({ defaultPath: fileName(file) });
  if (!path) return null;
  await exportFile(file.entity.id, path);
  return path;
}

/// Opens the system share menu with the file itself. Where the webview cannot share
/// files, refuses, or the file was too big to read (`blob` is `null`), the user is asked
/// where to save a copy instead.
export async function shareFile(file: FileEntity, blob: Blob | null): Promise<ShareOutcome> {
  if (blob) {
    const name = fileName(file);
    const data = {
      files: [new File([blob], name, { type: blob.type })],
      title: displayTitle(file.entity),
    };
    if ("canShare" in navigator && navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
        // Any other refusal (no user gesture, no share targets) falls through to saving.
      }
    }
  }
  return (await saveFileCopy(file)) ? "saved" : "cancelled";
}
