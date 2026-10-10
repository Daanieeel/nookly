import { invoke } from "@tauri-apps/api/core";
import type { Block, BlockAttrs, BlockPatch, BlockType, Entity, PageSummary } from "./types";

export function createNote(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_note", { spaceId, title });
}

export function createJot(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_jot", { spaceId, title });
}

export function countUnrefinedJots(spaceId: string): Promise<number> {
  return invoke("count_unrefined_jots", { spaceId });
}

export function countUnrefinedJotsAllSpaces(): Promise<number> {
  return invoke("count_unrefined_jots_all_spaces");
}

/// Unrefined Jots across every Space, most recently edited first.
export function listUnrefinedJotsAllSpaces(limit: number): Promise<PageSummary[]> {
  return invoke("list_unrefined_jots_all_spaces", { limit });
}

export function listRecentNotes(spaceId: string, limit = 5): Promise<Entity[]> {
  return invoke("list_recent_notes", { spaceId, limit });
}

export function listNoteSummaries(spaceId: string): Promise<PageSummary[]> {
  return invoke("list_note_summaries", { spaceId });
}

export function listJotSummaries(spaceId: string): Promise<PageSummary[]> {
  return invoke("list_jot_summaries", { spaceId });
}

export function listBlocks(entityId: string): Promise<Block[]> {
  return invoke("list_blocks", { entityId });
}

/// Right sidebar's "Mentioned in" — every other entity with a block that
/// `@mention`s this one (reverse of `extractMentionIds`).
export function listMentioningEntities(entityId: string): Promise<Entity[]> {
  return invoke("list_mentioning_entities", { entityId });
}

export function createBlock(
  entityId: string,
  blockType: BlockType,
  content: string,
  position: number | null = null,
  language: string | null = null,
  filename: string | null = null,
  attrs: BlockAttrs | null = null,
): Promise<Block> {
  return invoke("create_block", {
    entityId,
    blockType,
    content,
    position,
    language,
    filename,
    attrs,
  });
}

export function updateBlock(blockId: string, patch: BlockPatch): Promise<Block> {
  return invoke("update_block", { blockId, patch });
}

export function deleteBlock(blockId: string): Promise<void> {
  return invoke("delete_block", { blockId });
}

export function reorderBlocks(entityId: string, orderedBlockIds: string[]): Promise<void> {
  return invoke("reorder_blocks", { entityId, orderedBlockIds });
}

export function renderPageMarkdown(entityId: string): Promise<string> {
  return invoke("render_page_markdown", { entityId });
}

export function exportPageMarkdown(entityId: string, path: string): Promise<void> {
  return invoke("export_page_markdown", { entityId, path });
}

/// Writes the page as a Nookly page file: every block, ported natively, with nothing that
/// belongs to this instance (ids, labels, links, files).
export function exportPageJson(entityId: string, path: string): Promise<void> {
  return invoke("export_page_json", { entityId, path });
}

/// What importing a Nookly page file would create. Reads the file, changes nothing.
export interface PagePreview {
  kind: string;
  title: string;
  blockCount: number;
  /// Blocks of a type this version does not know, which arrive as paragraphs.
  convertedBlocks: number;
  blocks: BlockPreview[];
}

export interface BlockPreview {
  blockType: string;
  /// The first line of text, cut to fit a list row.
  firstLine: string;
  /// The type is unknown to this version, so the block arrives as a paragraph.
  converted: boolean;
}

export function previewPageJson(path: string): Promise<PagePreview> {
  return invoke("preview_page_json", { path });
}

/// `previewPageJson` for file contents the app already holds (a drop or a paste).
export function previewPageText(text: string): Promise<PagePreview> {
  return invoke("preview_page_text", { text });
}

/// `importPageJson` for file contents the app already holds.
export function importPageText(spaceId: string, text: string): Promise<Entity> {
  return invoke("import_page_text", { spaceId, text });
}

/// Creates a new page in the Space from a Nookly page file. Never changes an existing page.
export function importPageJson(spaceId: string, path: string): Promise<Entity> {
  return invoke("import_page_json", { spaceId, path });
}

/// The language a new code block in this note starts with, or null to follow the app default.
export function getNoteCodeLanguage(entityId: string): Promise<string | null> {
  return invoke("get_note_code_language", { entityId });
}
