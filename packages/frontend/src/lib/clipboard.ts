import { readText, writeHtml, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { mentionMarkdown } from "#/features/relationships/mention-utils.ts";

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

/// A mention of an entity, or one block of a page: pasted into a Note it becomes a mention,
/// anywhere else the markdown form `[Title](mention:JOT-12)` with the readable key. The rich
/// copy keeps the id, which is what a mention is stored with.
export function copyEntityLink(entity: Entity, blockId?: string): Promise<void> {
  const title = displayTitle(entity);
  const withBlock = (target: string) => (blockId ? `${target}#${blockId}` : target);
  return writeHtml(
    `<a href="mention:${escapeHtml(withBlock(entity.id))}">${escapeHtml(title)}</a>`,
    mentionMarkdown(title, withBlock(entity.key)),
  );
}
