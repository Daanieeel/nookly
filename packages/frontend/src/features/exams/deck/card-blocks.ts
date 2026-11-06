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

/// `$$…$$` over any number of lines, or its LaTeX spellings `\[…\]`, as old cards wrote
/// display math in their text.
const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;

/// The blocks an old card's text becomes when it is edited: a paragraph per line, display
/// math as an equation block, `\(…\)` as the `$…$` the editor reads.
export function textToBlocks(text: string): CardBlock[] {
  const blocks: CardBlock[] = [];
  const addLines = (chunk: string) => {
    for (const line of chunk.split("\n")) {
      blocks.push({ type: "paragraph", content: line.replace(/\\\((.+?)\\\)/g, "$$$1$$") });
    }
  };
  let last = 0;
  for (const match of text.matchAll(DISPLAY_MATH)) {
    // The line break that sets a formula apart is not an empty line of its own.
    const before = text.slice(last, match.index).replace(/\n$/, "");
    if (before || (last === 0 && match.index > 0)) addLines(before);
    blocks.push({
      type: "equation",
      content: (match[1] ?? match[2] ?? "").trim(),
      attrs: { view: "rendered" },
    });
    last = match.index + match[0].length;
    if (text[last] === "\n") last += 1;
  }
  if (last < text.length || blocks.length === 0) addLines(text.slice(last));
  return blocks;
}

/// The blocks of one side of a card: the ones it was written with, or its old text.
export function faceBlocks(card: Pick<IndexCard, Side | "frontBlocks" | "backBlocks">, side: Side) {
  const blocks = side === "front" ? card.frontBlocks : card.backBlocks;
  return blocks && blocks.length > 0 ? blocks : textToBlocks(card[side]);
}

/// Blocks that are drawn from source (formulas, diagrams, circuits, plots) show what they
/// draw rather than the source, on a card that is only read.
export function forReading(blocks: CardBlock[]): CardBlock[] {
  return blocks.map((block) =>
    ["equation", "math", "diagram", "circuit", "plot"].includes(block.type)
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
  ]);
  const lines = blocks.map((b) => {
    const name = named.get(b.type);
    if (name) return name;
    // A mention reads as its label.
    return b.content.replace(/\[([^\]]*)\]\(mention:[^)]*\)/g, "$1");
  });
  return lines.filter((l) => l.trim()).join(" ");
}
