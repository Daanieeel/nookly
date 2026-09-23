import { invoke } from "@tauri-apps/api/core";
import type { Block, BlockPatch, BlockType, Entity, PageSummary } from "./types";

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
): Promise<Block> {
  return invoke("create_block", { entityId, blockType, content, position, language, filename });
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
