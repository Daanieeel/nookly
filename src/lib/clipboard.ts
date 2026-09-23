import { readText, writeHtml, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { mentionMarkdown } from "@/features/relationships/mention-utils";

/// Clipboard access through the Tauri plugin rather than `navigator.clipboard`:
/// the webview asks for a separate confirmation on every read, which would turn
/// a context menu's Paste into two clicks.

export function copyText(text: string): Promise<void> {
  return writeText(text);
}

export function readClipboardText(): Promise<string> {
  return readText();
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/// A link to an entity, or one block of a page: pasted into a Note it becomes a
/// mention, anywhere else the markdown form `[Title](mention:id)`.
export function copyEntityLink(entity: Entity, blockId?: string): Promise<void> {
  const title = displayTitle(entity);
  const target = blockId ? `${entity.id}#${blockId}` : entity.id;
  return writeHtml(
    `<a href="mention:${escapeHtml(target)}">${escapeHtml(title)}</a>`,
    mentionMarkdown(title, target),
  );
}
