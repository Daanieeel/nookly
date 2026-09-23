import type { BlockAttrs, Block, BlockType } from "@/lib/api/types";
import { ATOM_BLOCK_ATTRS, isAtomBlockType } from "./custom-block-rows";

/// The only attribute value shapes this module ever reads or writes (`blockId`
/// strings, heading `level` numbers, mark `href` strings) — narrower than
/// `unknown` so callers get an actual value contract.
export type JSONAttrValue = string | number | boolean | null;

/// Minimal local shape for the slice of Tiptap/ProseMirror JSON this module reads
/// and writes — avoids depending on `@tiptap/pm`'s full `Node`/`Fragment` classes
/// for what is otherwise plain data.
export interface JSONNode {
  type: string;
  attrs?: Record<string, JSONAttrValue>;
  content?: JSONNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, JSONAttrValue> }[];
}

export interface BlockInput {
  blockId: string;
  blockType: BlockType;
  content: string;
  /// Only ever set when `blockType` is `"code"` — the header row's language
  /// select + filename input, read back off the `codeBlock` node's attrs.
  language?: string;
  filename?: string;
  /// Custom blocks only: every attr the block type declares, `""` for unset, so
  /// an update also clears what the user removed.
  attrs?: BlockAttrs;
}

/// Comparable form of a block's attrs: unset (`""`) attrs are never stored, so
/// they don't count as a difference.
export function attrsKey(attrs: BlockAttrs | undefined): string {
  return JSON.stringify(
    Object.entries(attrs ?? {})
      .filter(([, value]) => value !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function isString(value: JSONAttrValue | undefined): value is string {
  return typeof value === "string";
}

function isNumber(value: JSONAttrValue | undefined): value is number {
  return typeof value === "number";
}

export function asString(value: JSONAttrValue | undefined): string | undefined {
  return isString(value) ? value : undefined;
}

function asNumber(value: JSONAttrValue | undefined): number | undefined {
  return isNumber(value) ? value : undefined;
}

/// Every inline run this editor round-trips: a mention link (§5.4, same
/// `[title](mention:id)` shape `mention-utils.ts` already reads), bold, inline
/// code, then italic — checked in that order since `**bold**` would otherwise be
/// swallowed by a naive `*italic*` match.
const INLINE_PATTERN = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;

export function decodeInline(text: string): JSONNode[] {
  if (!text) return [];
  const nodes: JSONNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push({ type: "text", text: text.slice(lastIndex, index) });
    const [, linkText, linkHref, boldText, codeText, italicText] = match;
    if (linkText !== undefined) {
      nodes.push({
        type: "text",
        text: linkText,
        marks: [{ type: "link", attrs: { href: linkHref } }],
      });
    } else if (boldText !== undefined) {
      nodes.push({ type: "text", text: boldText, marks: [{ type: "bold" }] });
    } else if (codeText !== undefined) {
      nodes.push({ type: "text", text: codeText, marks: [{ type: "code" }] });
    } else if (italicText !== undefined) {
      nodes.push({ type: "text", text: italicText, marks: [{ type: "italic" }] });
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push({ type: "text", text: text.slice(lastIndex) });
  return nodes;
}

export function encodeInline(nodes: JSONNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type !== "text") return "";
      let text = node.text ?? "";
      const markTypes = new Set((node.marks ?? []).map((m) => m.type));
      if (markTypes.has("code")) text = `\`${text}\``;
      if (markTypes.has("bold")) text = `**${text}**`;
      if (markTypes.has("italic")) text = `*${text}*`;
      const linkMark = node.marks?.find((m) => m.type === "link");
      const href = asString(linkMark?.attrs?.href);
      if (href) text = `[${text}](${href})`;
      return text;
    })
    .join("");
}

function nonEmpty(nodes: JSONNode[]): JSONNode[] | undefined {
  return nodes.length > 0 ? nodes : undefined;
}

/// Builds this block's initial editor node from its persisted `content` string
/// (§ notes rewrite). `image`/`embed` blocks predate the rich editor and have no
/// node type here yet — they load as a plain paragraph so old content survives
/// a round trip instead of being silently dropped.
export function blockToNode(block: Block): JSONNode {
  const blockId = block.id;
  switch (block.blockType) {
    case "heading1":
    case "heading2":
    case "heading3": {
      const level = Number(block.blockType.slice(-1));
      return {
        type: "heading",
        attrs: { blockId, level },
        content: nonEmpty(decodeInline(block.content)),
      };
    }
    case "quote":
      return {
        type: "blockquote",
        attrs: { blockId },
        content: [{ type: "paragraph", content: nonEmpty(decodeInline(block.content)) }],
      };
    case "code":
      return {
        type: "codeBlock",
        attrs: { blockId, language: block.language, filename: block.filename },
        content: block.content ? [{ type: "text", text: block.content }] : undefined,
      };
    case "bulleted_list":
    case "numbered_list": {
      const lines = block.content.length > 0 ? block.content.split("\n") : [""];
      return {
        type: block.blockType === "bulleted_list" ? "bulletList" : "orderedList",
        attrs: { blockId },
        content: lines.map((line) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: nonEmpty(decodeInline(line)) }],
        })),
      };
    }
    case "callout":
      return {
        type: "callout",
        attrs: { blockId, variant: block.attrs.variant ?? "note" },
        content: nonEmpty(decodeInline(block.content)),
      };
    case "table": {
      const rows = block.content.length > 0 ? block.content.split("\n") : [""];
      return {
        type: "table",
        attrs: { blockId },
        content: rows.map((row, rowIndex) => ({
          type: "tableRow",
          content: row.split("\t").map((cell) => ({
            type: rowIndex === 0 ? "tableHeader" : "tableCell",
            content: [{ type: "paragraph", content: nonEmpty(decodeInline(cell)) }],
          })),
        })),
      };
    }
    default:
      if (isAtomBlockType(block.blockType)) {
        const named = ATOM_BLOCK_ATTRS[block.blockType].map((name) => [
          name,
          block.attrs[name] || null,
        ]);
        return {
          type: block.blockType,
          attrs: { blockId, rows: block.content, ...Object.fromEntries(named) },
        };
      }
      return {
        type: "paragraph",
        attrs: { blockId },
        content: nonEmpty(decodeInline(block.content)),
      };
  }
}

function listLines(node: JSONNode): string {
  return (node.content ?? []).map((item) => encodeInline(item.content?.[0]?.content)).join("\n");
}

const HEADING_BLOCK_TYPES = {
  1: "heading1",
  2: "heading2",
  3: "heading3",
} satisfies Record<1 | 2 | 3, BlockType>;

/// The inverse of `blockToNode` (§ notes rewrite) — reads back one top-level
/// editor node into what `updateBlock`/`createBlock` persist. Returns `null` for
/// a node with no `blockId` yet (assigned async by `UniqueBlockId`) or one whose
/// type this editor doesn't persist as a block (there are none today).
export function nodeToBlockInput(node: JSONNode): BlockInput | null {
  const blockId = asString(node.attrs?.blockId);
  if (!blockId) return null;
  switch (node.type) {
    case "paragraph":
      return { blockId, blockType: "paragraph", content: encodeInline(node.content) };
    case "heading": {
      const level = asNumber(node.attrs?.level) ?? 1;
      const blockType = HEADING_BLOCK_TYPES[level === 2 || level === 3 ? level : 1];
      return { blockId, blockType, content: encodeInline(node.content) };
    }
    case "blockquote":
      return { blockId, blockType: "quote", content: encodeInline(node.content?.[0]?.content) };
    case "codeBlock":
      return {
        blockId,
        blockType: "code",
        content: (node.content ?? []).map((n) => n.text ?? "").join(""),
        language: asString(node.attrs?.language),
        filename: asString(node.attrs?.filename),
      };
    case "bulletList":
      return { blockId, blockType: "bulleted_list", content: listLines(node) };
    case "orderedList":
      return { blockId, blockType: "numbered_list", content: listLines(node) };
    case "callout":
      return {
        blockId,
        blockType: "callout",
        content: encodeInline(node.content),
        attrs: { variant: asString(node.attrs?.variant) ?? "note" },
      };
    case "table": {
      const rows = (node.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => encodeInline(cell.content?.[0]?.content)).join("\t"),
      );
      return { blockId, blockType: "table", content: rows.join("\n") };
    }
    default:
      if (!isAtomBlockType(node.type)) return null;
      return {
        blockId,
        blockType: node.type,
        content: asString(node.attrs?.rows) ?? "",
        attrs: Object.fromEntries(
          ATOM_BLOCK_ATTRS[node.type].map((name) => [name, asString(node.attrs?.[name]) ?? ""]),
        ),
      };
  }
}
