import { save } from "@tauri-apps/plugin-dialog";
import { exportPageMarkdown } from "#/lib/api/notes.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";

/// The page's title as a file name: without the characters a file name cannot hold.
export function fileBaseName(entity: Entity): string {
  const base = displayTitle(entity)
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return base || "Untitled";
}

/// Resolves `false` when the user cancels the native save dialog.
export async function savePageMarkdownFile(entity: Entity): Promise<boolean> {
  const path = await save({
    defaultPath: `${fileBaseName(entity)}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!path) return false;
  await exportPageMarkdown(entity.id, path);
  return true;
}
