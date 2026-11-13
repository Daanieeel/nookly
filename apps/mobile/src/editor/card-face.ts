import { type Block, type BlockType, pageBlocks, seedPage } from "@nookly/shared/blocks";
import type { CardBlock } from "@nookly/shared/data";
import * as Y from "yjs";

/// A card's face in the page editor: its blocks as a document of their own, kept only while
/// the card is written, and read back as blocks, the way the desktop's card writer does.

let next = 0;

/// A document holding a face's blocks, in order. An empty face is one empty line.
export function faceDoc(
  blocks: Pick<CardBlock, "type" | "content" | "language" | "filename" | "attrs">[],
): Y.Doc {
  const doc = new Y.Doc();
  const now = new Date().toISOString();
  seedPage(
    doc,
    blocks.map((block, position): Block => ({
      id: `face-${++next}`,
      entityId: "",
      position,
      // SAFETY: a face's blocks were written by an editor on the same page schema.
      blockType: block.type as BlockType,
      content: block.content,
      language: block.language,
      filename: block.filename,
      attrs: block.attrs,
      createdAt: now,
      updatedAt: now,
    })),
  );
  return doc;
}

/// What a face's document holds, as the blocks a card stores.
export function docFace(doc: Y.Doc): CardBlock[] {
  return pageBlocks(doc).map((block) => ({
    type: block.blockType,
    content: block.content,
    language: block.language ?? null,
    filename: block.filename ?? null,
    attrs: block.attrs ?? {},
  }));
}

const key = (blocks: Pick<CardBlock, "type" | "content" | "language" | "filename">[]) =>
  JSON.stringify(blocks.map((b) => [b.type, b.content, b.language ?? null, b.filename ?? null]));

/// Whether two faces read the same, so a face left as it was is not written again.
export function sameFace(
  a: Pick<CardBlock, "type" | "content" | "language" | "filename">[],
  b: Pick<CardBlock, "type" | "content" | "language" | "filename">[],
): boolean {
  return key(a) === key(b);
}
