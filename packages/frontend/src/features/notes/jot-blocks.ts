import type { BlockAttrs, BlockType } from "#/lib/api/types.ts";

export interface JotBlock {
  blockType: BlockType;
  content: string;
  language: string | null;
  /// A lettered list's `marker` (`a)`, `A.`, ...); absent on every other block.
  attrs?: BlockAttrs;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const CHECK = /^[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const LETTERED = /^([a-zA-Z])([.)])\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```\s*(\S*)/;

const HEADING_TYPES: BlockType[] = [
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
];

/// Splits plain Jot text into the blocks the page editor stores, so markdown typed in
/// the quick capture box opens as real headings, lists, quotes and code. Every other
/// line becomes its own paragraph, since a paragraph block holds a single line.
export function jotTextToBlocks(text: string): JotBlock[] {
  const blocks: JotBlock[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const push = (
    blockType: BlockType,
    content: string,
    language: string | null = null,
    attrs?: BlockAttrs,
  ) => {
    const last = blocks.at(-1);
    // Consecutive list items share one block, one item per line.
    const mergeable =
      blockType === "bulleted_list" || blockType === "numbered_list" || blockType === "checklist";
    if (mergeable && last?.blockType === blockType && last.attrs?.marker === attrs?.marker) {
      last.content += `\n${content}`;
    } else blocks.push({ blockType, content, language, ...(attrs && { attrs }) });
  };
  /// A line like `a) text` or `B. text`: it starts a lettered list at `a`, or carries one on
  /// when it is the next letter, in the same case and punctuation, of the list just before.
  const lettered = (line: string): { marker: string; text: string } | null => {
    const match = LETTERED.exec(line);
    if (!match) return null;
    const [, letter = "", delimiter = "", text = ""] = match;
    const marker = `${letter.toLowerCase() === letter ? "a" : "A"}${delimiter}`;
    const last = blocks.at(-1);
    const items = last?.attrs?.marker === marker ? last.content.split("\n").length : 0;
    const expected = String.fromCharCode(marker.charCodeAt(0) + items);
    return letter === expected ? { marker, text } : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const fence = FENCE.exec(line.trim());
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !(lines[i] ?? "").trim().startsWith("```"); i++) {
        body.push(lines[i] ?? "");
      }
      blocks.push({ blockType: "code", content: body.join("\n"), language: fence[1] || null });
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      // A blank line ends a list or quote, so the next item starts a new block.
      blocks.push({ blockType: "paragraph", content: "", language: null });
      continue;
    }
    const heading = HEADING.exec(trimmed);
    const check = CHECK.exec(trimmed);
    const bullet = BULLET.exec(trimmed);
    const numbered = NUMBERED.exec(trimmed);
    const letters = lettered(trimmed);
    const quote = QUOTE.exec(trimmed);
    if (heading) push(HEADING_TYPES[heading[1].length - 1] ?? "heading1", heading[2].trim());
    else if (check) push("checklist", `[${check[1] === " " ? " " : "x"}] ${check[2]}`);
    else if (bullet) push("bulleted_list", bullet[1]);
    else if (numbered) push("numbered_list", numbered[1]);
    else if (letters) push("numbered_list", letters.text, null, { marker: letters.marker });
    else if (quote) push("quote", quote[1]);
    else push("paragraph", trimmed);
  }
  // The blank line markers only served as separators.
  return blocks.filter((b) => b.blockType !== "paragraph" || b.content !== "");
}
