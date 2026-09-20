import { invoke } from "@tauri-apps/api/core";
import type { Block, BlockPatch, BlockType, Entity } from "./types";

export function createNote(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_note", { spaceId, title });
}

export function createJot(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_jot", { spaceId, title });
}

export function createRefinement(spaceId: string, title: string): Promise<Entity> {
  return invoke("create_refinement", { spaceId, title });
}

export function listBlocks(entityId: string): Promise<Block[]> {
  return invoke("list_blocks", { entityId });
}

export function createBlock(
  entityId: string,
  blockType: BlockType,
  content: string,
  position: number | null = null,
): Promise<Block> {
  return invoke("create_block", { entityId, blockType, content, position });
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
