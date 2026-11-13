import { textFaceBlocks } from "@nookly/shared/data";
import type { CardBlock, IndexCard } from "#/lib/api/types.ts";
import {
  attrsKey,
  blockToNode,
  type JSONNode,
  nodeToBlockInput,
} from "#/features/notes/block-markdown.ts";

export type Side = "front" | "back";

/// A face the way the card editor holds it: nothing written yet is one empty paragraph.
export const EMPTY_FACE: CardBlock[] = [{ type: "paragraph", content: "" }];

/// The blocks an old card's text becomes when it is edited (shared with the phone).
export function textToBlocks(text: string): CardBlock[] {
  // SAFETY: a text face's block (a type, its text, a language for code) is a `CardBlock`.
  return textFaceBlocks(text) as CardBlock[];
}

/// The blocks of one side of a card: the ones it was written with, or its old text.
export function faceBlocks(card: Pick<IndexCard, Side | "frontBlocks" | "backBlocks">, side: Side) {
  const blocks = side === "front" ? card.frontBlocks : card.backBlocks;
  return blocks && blocks.length > 0 ? blocks : textToBlocks(card[side]);
}

/// Blocks that are drawn from source (formulas, diagrams, circuits, plots, mind maps) show what they
/// draw rather than the source, on a card that is only read.
export function forReading(blocks: CardBlock[]): CardBlock[] {
  return blocks.map((block) =>
    ["equation", "math", "diagram", "circuit", "plot", "mindmap"].includes(block.type)
      ? { ...block, attrs: { ...block.attrs, view: "rendered" } }
      : block,
  );
}

/// Blocks in the shape the editor reads.
export function blocksToNodes(blocks: CardBlock[]): JSONNode[] {
  return blocks.map((block, index) =>
    blockToNode({
      id: `card-${index}`,
      entityId: "",
      position: index,
      blockType: block.type,
      content: block.content,
      language: block.language ?? null,
      filename: block.filename ?? null,
      attrs: block.attrs ?? {},
      createdAt: "",
      updatedAt: "",
    }),
  );
}

/// What the editor holds, as blocks to save. A setting left empty is not stored.
export function nodesToBlocks(nodes: JSONNode[]): CardBlock[] {
  const blocks: CardBlock[] = [];
  for (const node of nodes) {
    const input = nodeToBlockInput(node);
    if (!input) continue;
    const attrs = Object.fromEntries(
      Object.entries(input.attrs ?? {}).filter(([, value]) => value !== ""),
    );
    const block: CardBlock = { type: input.blockType, content: input.content };
    if (input.language) block.language = input.language;
    if (input.filename) block.filename = input.filename;
    if (Object.keys(attrs).length > 0) block.attrs = attrs;
    blocks.push(block);
  }
  return blocks;
}

const TEXT_BLOCKS = new Set(["paragraph", "heading1", "heading2", "heading3", "quote"]);

/// A face with nothing on it: no blocks, or only blank lines.
export function isFaceEmpty(blocks: CardBlock[]): boolean {
  return blocks.every((b) => TEXT_BLOCKS.has(b.type) && !b.content.trim());
}

/// Whether two faces hold the same blocks, ignoring blank lines at the end.
export function sameFace(a: CardBlock[], b: CardBlock[]): boolean {
  const key = (blocks: CardBlock[]) => {
    const trimmed = [...blocks];
    while (trimmed.length > 1 && isFaceEmpty(trimmed.slice(-1))) trimmed.pop();
    return JSON.stringify(
      trimmed.map((x) => [
        x.type,
        x.content,
        x.language ?? "",
        x.filename ?? "",
        attrsKey(x.attrs),
      ]),
    );
  };
  return key(a) === key(b);
}

/// The one line a face reads as in a list of cards and to a screen reader: its text, with
/// pictures and formulas named.
export function faceSummary(
  card: Pick<IndexCard, Side | "frontBlocks" | "backBlocks">,
  side: Side,
): string {
  const blocks = side === "front" ? card.frontBlocks : card.backBlocks;
  if (!blocks) return card[side];
  const named = new Map([
    ["image", "Image"],
    ["video", "Video"],
    ["audio", "Audio"],
    ["file", "File"],
    ["diagram", "Diagram"],
    ["circuit", "Circuit"],
    ["plot", "Plot"],
    ["mindmap", "Mind map"],
  ]);
  const lines = blocks.map((b) => {
    const name = named.get(b.type);
    if (name) return name;
    // A mention reads as its label.
    return b.content.replace(/\[([^\]]*)\]\(mention:[^)]*\)/g, "$1");
  });
  return lines.filter((l) => l.trim()).join(" ");
}
