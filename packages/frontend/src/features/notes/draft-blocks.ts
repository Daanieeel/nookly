import { softDeleteEntity } from "#/lib/api/entities.ts";
import { createBlock } from "#/lib/api/notes.ts";
import { ignoreError } from "#/lib/log.ts";
import { type BlockInput, type JSONNode, nodeToBlockInput } from "./block-markdown";

/// The blocks of a document that has no page yet, in order. Empty lines at the end are
/// not content, so a body nobody typed in is no blocks at all.
export function draftBlocks(nodes: JSONNode[]): BlockInput[] {
  const blocks = nodes.map(nodeToBlockInput).filter((b): b is BlockInput => b !== null);
  let end = blocks.length;
  while (end > 0 && blocks[end - 1]?.blockType === "paragraph" && !blocks[end - 1]?.content.trim())
    end -= 1;
  return blocks.slice(0, end);
}

/// Writes a draft as the blocks of a page that was just created. When a block fails the
/// page is thrown away, so trying again does not leave a second, half written one.
export async function saveDraftBlocks(entityId: string, blocks: BlockInput[]): Promise<void> {
  try {
    for (const block of blocks) {
      await createBlock(
        entityId,
        block.blockType,
        block.content,
        null,
        block.language ?? null,
        block.filename ?? null,
        block.attrs ?? null,
      );
    }
  } catch (err) {
    await softDeleteEntity(entityId).catch(ignoreError("discarding a page with a failed body"));
    throw err;
  }
}
