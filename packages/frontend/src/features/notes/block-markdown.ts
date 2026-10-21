import type { BlockAttrs, Block, BlockType } from "#/lib/api/types.ts";
import { HIGHLIGHT_COLOR_PATTERN, parseHighlightColor } from "./highlight-colors";
import { parseTextColor, TEXT_COLOR_PATTERN } from "./text-colors";
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

export function asNumber(value: JSONAttrValue | undefined): number | undefined {
  return isNumber(value) ? value : undefined;
}

/// Every inline run this editor round-trips: a mention link (§5.4, same
/// `[title](mention:id)` shape `mention-utils.ts` already reads), bold and italic
/// together, bold, a highlight, inline code, then italic — checked in that order since
/// `**bold**` would otherwise be swallowed by a naive `*italic*` match. Before all of
/// them, an escaped `\$` and inline math `$…$`: no space just inside either dollar and no
/// digit right after the closing one, so "$5 and $10" stays text (the pandoc rule). A
/// formula that is clearly TeX (a `\`, `^`, `_` or brace in it) may have a digit right after,
/// since "$5-$10" has none of those. `\$` inside a formula is a dollar sign. A
/// highlight is `==text==` with no space just inside either pair, so "a == b" stays text.
/// Coloured text is `{red}text{/}`, only for the colours in `text-colors.ts`.
const MATH_BODY = String.raw`(?:\\\$|[^\s$])(?:(?:\\\$|[^$\n])*?(?:\\\$|[^\s$\\]))?`;

const INLINE_PATTERN = new RegExp(
  [
    String.raw`\\\$`,
    String.raw`\$(?=[^$\n]*[\\^_{}])(${MATH_BODY})\$`,
    String.raw`\$(${MATH_BODY})\$(?!\d)`,
    String.raw`\[([^\]]+)\]\(([^)]+)\)`,
    String.raw`\*\*\*(.+?)\*\*\*`,
    String.raw`\*\*(.+?)\*\*`,
    // A highlight, with an optional colour: `=={green}text==`.
    String.raw`==(?:\{(${HIGHLIGHT_COLOR_PATTERN})\})?(?!\s)(.+?)(?<!\s)==`,
    String.raw`\{(${TEXT_COLOR_PATTERN})\}(.+?)\{\/\}`,
    "`([^`]+)`",
    String.raw`\*([^*]+)\*`,
  ].join("|"),
  "g",
);

type Mark = NonNullable<JSONNode["marks"]>[number];

/// `nodes` with `marks` added after the marks they have, adjacent text of the same
/// marks joined back into one run.
function withMarks(nodes: JSONNode[], ...marks: Mark[]): JSONNode[] {
  const marked = nodes.map((node) =>
    node.type === "text" || node.type === "inlineMath"
      ? { ...node, marks: [...(node.marks ?? []), ...marks] }
      : node,
  );
  return marked.reduce<JSONNode[]>((joined, node) => {
    const last = joined[joined.length - 1];
    const same = JSON.stringify(last?.marks) === JSON.stringify(node.marks);
    if (last?.type === "text" && node.type === "text" && same) {
      last.text = (last.text ?? "") + (node.text ?? "");
    } else {
      joined.push({ ...node });
    }
    return joined;
  }, []);
}

export function decodeInline(text: string): JSONNode[] {
  if (!text) return [];
  const nodes: JSONNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push({ type: "text", text: text.slice(lastIndex, index) });
    const [
      ,
      texLatex,
      plainLatex,
      linkText,
      linkHref,
      boldItalic,
      boldText,
      highlightColor,
      highlightText,
      textColor,
      coloredText,
      codeText,
      italicText,
    ] = match;
    const latex = texLatex ?? plainLatex;
    if (match[0] === "\\$") {
      nodes.push({ type: "text", text: "$" });
    } else if (latex !== undefined) {
      nodes.push({ type: "inlineMath", attrs: { latex } });
    } else if (linkText !== undefined) {
      nodes.push(...withMarks(decodeInline(linkText), { type: "link", attrs: { href: linkHref } }));
    } else if (boldItalic !== undefined) {
      nodes.push(...withMarks(decodeInline(boldItalic), { type: "bold" }, { type: "italic" }));
    } else if (boldText !== undefined) {
      nodes.push(...withMarks(decodeInline(boldText), { type: "bold" }));
    } else if (highlightText !== undefined) {
      const color = parseHighlightColor(highlightColor);
      nodes.push(
        ...withMarks(
          decodeInline(highlightText),
          color ? { type: "highlight", attrs: { color } } : { type: "highlight" },
        ),
      );
    } else if (coloredText !== undefined) {
      nodes.push(
        ...withMarks(decodeInline(coloredText), {
          type: "textColor",
          attrs: { color: parseTextColor(textColor) },
        }),
      );
    } else if (codeText !== undefined) {
      nodes.push({ type: "text", text: codeText, marks: [{ type: "code" }] });
    } else if (italicText !== undefined) {
      nodes.push(...withMarks(decodeInline(italicText), { type: "italic" }));
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push({ type: "text", text: text.slice(lastIndex) });
  return nodes;
}

const hasMark = (node: JSONNode | undefined, type: string) =>
  node?.marks?.some((m) => m.type === type) ?? false;

/// The colour a node's highlight has, null for the default one.
function highlightColorOf(node: JSONNode | undefined): string | null {
  const mark = node?.marks?.find((m) => m.type === "highlight");
  return parseHighlightColor(asString(mark?.attrs?.color));
}

/// A run of nodes that are all highlighted in one colour, written once as `==…==` (with the
/// colour as `=={green}…==` unless it is the default). The markers hug the text, so spaces at
/// either end of the run go outside them.
function encodeHighlight(run: JSONNode[]): string {
  const inner = encodeInline(
    run.map((node) => ({ ...node, marks: node.marks?.filter((m) => m.type !== "highlight") })),
  );
  const [, before = "", body = "", after = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? [];
  const color = highlightColorOf(run[0]);
  return body ? `${before}==${color ? `{${color}}` : ""}${body}==${after}` : inner;
}

/// The colour a node's text has, null for none.
function textColorOf(node: JSONNode | undefined): string | null {
  const mark = node?.marks?.find((m) => m.type === "textColor");
  return parseTextColor(asString(mark?.attrs?.color));
}

/// A run of nodes that all have one text colour, written once as `{red}…{/}`.
function encodeTextColor(run: JSONNode[]): string {
  const inner = encodeInline(
    run.map((node) => ({ ...node, marks: node.marks?.filter((m) => m.type !== "textColor") })),
  );
  const color = textColorOf(run[0]);
  return inner && color ? `{${color}}${inner}{/}` : inner;
}

/// A formula as `$…$`, written so reading it back gives the same formula: line breaks and
/// the spaces around it go (a space just inside a dollar is not math), an empty one is
/// dropped, and one that a digit follows and that would then read as text ends in `{}`,
/// which TeX ignores.
function encodeMath(latex: string, next: JSONNode | undefined): string {
  const clean = latex.replace(/\s*\n\s*/g, " ").trim();
  if (!clean) return "";
  const digitNext = next?.type === "text" && /^\d/.test(next.text ?? "");
  const [first] = decodeInline(`$${clean}$${digitNext ? "0" : ""}`);
  const readsBack = first?.type === "inlineMath" && first.attrs?.latex === clean;
  return readsBack || clean.endsWith("\\") ? `$${clean}$` : `$${clean}{}$`;
}

export function encodeInline(nodes: JSONNode[] = []): string {
  const parts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    if (textColorOf(node)) {
      let end = i;
      while (textColorOf(nodes[end + 1]) === textColorOf(node)) end++;
      parts.push(encodeTextColor(nodes.slice(i, end + 1)));
      i = end;
      continue;
    }
    if (hasMark(node, "highlight")) {
      let end = i;
      while (
        hasMark(nodes[end + 1], "highlight") &&
        highlightColorOf(nodes[end + 1]) === highlightColorOf(node)
      )
        end++;
      parts.push(encodeHighlight(nodes.slice(i, end + 1)));
      i = end;
      continue;
    }
    if (node.type === "inlineMath") {
      parts.push(encodeMath(asString(node.attrs?.latex) ?? "", nodes[i + 1]));
      continue;
    }
    if (node.type !== "text") continue;
    let text = node.text ?? "";
    const markTypes = new Set((node.marks ?? []).map((m) => m.type));
    if (markTypes.has("code")) text = `\`${text}\``;
    else text = text.replaceAll("$", "\\$");
    if (markTypes.has("bold")) text = `**${text}**`;
    if (markTypes.has("italic")) text = `*${text}*`;
    const linkMark = node.marks?.find((m) => m.type === "link");
    const href = asString(linkMark?.attrs?.href);
    if (href) text = `[${text}](${href})`;
    parts.push(text);
  }
  return parts.join("");
}

/// One checklist line: `[ ] ` or `[x] `, then the item's inline markdown.
const CHECKLIST_ITEM = /^\s*\[([ xX])\]\s?(.*)$/;

function nonEmpty(nodes: JSONNode[]): JSONNode[] | undefined {
  return nodes.length > 0 ? nodes : undefined;
}

/// Builds this block's initial editor node from its persisted `content` string
/// (§ notes rewrite). A block type this editor has no node for loads as a plain
/// paragraph, so its content survives a round trip instead of being dropped.
export function blockToNode(block: Block): JSONNode {
  const blockId = block.id;
  switch (block.blockType) {
    case "heading1":
    case "heading2":
    case "heading3":
    case "heading4":
    case "heading5":
    case "heading6": {
      const level = Number(block.blockType.slice(-1));
      return {
        type: "heading",
        attrs: { blockId, level, toggle: block.attrs.toggle ?? null },
        content: nonEmpty(decodeInline(block.content)),
      };
    }
    case "equation":
    case "math":
    case "diagram":
    case "circuit":
    case "plot":
      return {
        type: block.blockType,
        attrs: {
          blockId,
          view: block.attrs.view ?? "source",
          // Only a circuit has a hand drawing to keep.
          ...(block.blockType === "circuit" && { drawing: block.attrs.drawing ?? "" }),
        },
        content: block.content ? [{ type: "text", text: block.content }] : undefined,
      };
    case "toggle": {
      const lines = block.content.length > 0 ? block.content.split("\n") : [""];
      return {
        type: "toggle",
        attrs: { blockId, toggle: block.attrs.toggle ?? "closed" },
        content: lines.map((line) => ({
          type: "paragraph",
          content: nonEmpty(decodeInline(line)),
        })),
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
      const listType = block.blockType === "bulleted_list" ? "bulletList" : "orderedList";
      const marker = block.attrs.marker || null;
      const start = Math.max(1, Math.floor(Number(block.attrs.start))) || 1;
      return {
        type: listType,
        attrs: block.blockType === "numbered_list" ? { blockId, marker, start } : { blockId },
        content: listItems(block.content, listType, {
          marker,
          nestedStarts: parseNestedStarts(block.attrs.nestedStarts),
        }),
      };
    }
    case "callout":
      return {
        type: "callout",
        attrs: { blockId, variant: block.attrs.variant ?? "note" },
        content: nonEmpty(decodeInline(block.content)),
      };
    case "checklist": {
      const lines = block.content.length > 0 ? block.content.split("\n") : ["[ ] "];
      return {
        type: "taskList",
        attrs: { blockId },
        content: lines.map((line) => {
          const item = CHECKLIST_ITEM.exec(line);
          return {
            type: "taskItem",
            attrs: { checked: item?.[1] !== undefined && item[1] !== " " },
            content: [{ type: "paragraph", content: nonEmpty(decodeInline(item?.[2] ?? line)) }],
          };
        }),
      };
    }
    case "table": {
      const rows = block.content.length > 0 ? block.content.split("\n") : [""];
      return {
        type: "table",
        attrs: { blockId, pinned: block.attrs.pinned || null },
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

const LIST_TYPES = new Set(["bulletList", "orderedList"]);

/// What a list saves as: its items, one line each, a nested item with one leading tab per
/// level (the same format the backend reads, `list_items` in `block_types.rs`), and where each
/// nested numbered list starts when it is not at one, as `line:start` pairs (the line is the
/// nested list's first). Only the first paragraph of an item and the lists under it are kept.
interface ListLines {
  content: string;
  nestedStarts: string;
}

function listLines(node: JSONNode): ListLines {
  const lines: string[] = [];
  const starts: string[] = [];
  const collect = (list: JSONNode, depth: number) => {
    for (const item of list.content ?? []) {
      const [first, ...rest] = item.content ?? [];
      lines.push("\t".repeat(depth) + encodeInline(first?.content));
      for (const child of rest) {
        if (!LIST_TYPES.has(child.type) || (child.content ?? []).length === 0) continue;
        const start = asNumber(child.attrs?.start) ?? 1;
        if (child.type === "orderedList" && start > 1) starts.push(`${lines.length}:${start}`);
        collect(child, depth + 1);
      }
    }
  };
  collect(node, 0);
  return { content: lines.join("\n"), nestedStarts: starts.join(",") };
}

/// `line:start` pairs of a saved list, by line.
function parseNestedStarts(saved: string | undefined): Map<number, number> {
  const starts = new Map<number, number>();
  for (const pair of (saved ?? "").split(",")) {
    const [line, start] = pair.split(":").map(Number);
    if (Number.isInteger(line) && Number.isInteger(start) && (start ?? 0) > 1) {
      starts.set(Number(line), Number(start));
    }
  }
  return starts;
}

/// The inverse of `listLines`: list items with their nested lists. A line nests at most
/// one level under the line above it, and the first line cannot nest. A nested numbered list
/// is counted like the list it is in, from where `nestedStarts` says.
function listItems(
  content: string,
  listType: string,
  style: { marker: string | null; nestedStarts: Map<number, number> },
): JSONNode[] {
  const root: JSONNode[] = [];
  // The items of the list at each level, down to the one the last line went into.
  const levels: JSONNode[][] = [root];
  const lines = content.length > 0 ? content.split("\n") : [""];
  for (const [index, line] of lines.entries()) {
    const text = line.replace(/^\t+/, "");
    const last = levels[levels.length - 1] ?? root;
    const deepest = last.length > 0 ? levels.length : levels.length - 1;
    const depth = Math.min(line.length - text.length, deepest);
    if (depth === levels.length) {
      const nested: JSONNode = {
        type: listType,
        ...(listType === "orderedList" && {
          attrs: { marker: style.marker, start: style.nestedStarts.get(index) ?? 1 },
        }),
        content: [],
      };
      (last[last.length - 1]?.content ?? []).push(nested);
      levels.push(nested.content ?? []);
    } else {
      levels.length = depth + 1;
    }
    levels[depth]?.push({
      type: "listItem",
      content: [{ type: "paragraph", content: nonEmpty(decodeInline(text)) }],
    });
  }
  return root;
}

const HEADING_BLOCK_TYPES = {
  1: "heading1",
  2: "heading2",
  3: "heading3",
  4: "heading4",
  5: "heading5",
  6: "heading6",
} satisfies Record<1 | 2 | 3 | 4 | 5 | 6, BlockType>;

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
      // SAFETY: an unknown level misses the lookup and falls back to heading1.
      const blockType =
        HEADING_BLOCK_TYPES[level as keyof typeof HEADING_BLOCK_TYPES] ?? "heading1";
      return {
        blockId,
        blockType,
        content: encodeInline(node.content),
        // Toggle headings only; `""` keeps a plain heading plain.
        attrs: { toggle: asString(node.attrs?.toggle) ?? "" },
      };
    }
    case "equation":
    case "math":
    case "diagram":
    case "circuit":
    case "plot":
      return {
        blockId,
        blockType: node.type,
        content: (node.content ?? []).map((n) => n.text ?? "").join(""),
        attrs: {
          view: asString(node.attrs?.view) ?? "source",
          ...(node.type === "circuit" && { drawing: asString(node.attrs?.drawing) ?? "" }),
        },
      };
    case "toggle":
      return {
        blockId,
        blockType: "toggle",
        content: (node.content ?? []).map((p) => encodeInline(p.content)).join("\n"),
        attrs: { toggle: asString(node.attrs?.toggle) ?? "closed" },
      };
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
      return { blockId, blockType: "bulleted_list", content: listLines(node).content };
    case "orderedList": {
      const { content, nestedStarts } = listLines(node);
      const start = asNumber(node.attrs?.start) ?? 1;
      return {
        blockId,
        blockType: "numbered_list",
        content,
        attrs: {
          // Lettered lists only; `""` keeps a plain list counting 1, 2, 3.
          marker: asString(node.attrs?.marker) ?? "",
          // Where the list starts counting; `""` for one.
          start: start > 1 ? String(start) : "",
          nestedStarts,
        },
      };
    }
    case "taskList":
      return {
        blockId,
        blockType: "checklist",
        content: (node.content ?? [])
          .map((item) => {
            const mark = item.attrs?.checked === true ? "[x]" : "[ ]";
            return `${mark} ${encodeInline(item.content?.[0]?.content)}`;
          })
          .join("\n"),
      };
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
      return {
        blockId,
        blockType: "table",
        content: rows.join("\n"),
        // How many leftmost columns stay in place; `""` for none.
        attrs: { pinned: asString(node.attrs?.pinned) ?? "" },
      };
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
