import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import type { ChainedCommands, JSONContent } from "@tiptap/react";
import {
  MAX_STATS,
  parseCells,
  parseProgress,
  parseTimeline,
  parseTree,
  serializeCells,
  serializeProgress,
  serializeTimeline,
  serializeTree,
} from "./custom-block-rows";

/// What "Turn Into" can do, as rules instead of a list of pairs. Every block is
/// read into one of three shapes, and every target kind builds itself from a shape:
///
/// - `lines`: plain lines. Text, quotes, lists, toggles, code and the math and
///   diagram blocks all read as this, and all of them build from it.
/// - `rows`: a title plus rows of a primary and a secondary text (steps, details,
///   stats, timeline, progress, tree). They read as lines too, so they convert to
///   text and to each other, with nothing that has no place in the target dropped.
/// - `link`: a media, embed or bookmark block's target and caption. Only blocks of
///   its own family build from it, plus text when it is a plain URL.
///
/// A target that can't hold a shape without losing content (stats with more than
/// four rows, a bookmark of a stored file) refuses it, so it isn't offered.
/// Text kinds that keep inline formatting convert in place (`flow`) instead.

interface Row {
  primary: string;
  secondary: string;
}

type Draft =
  | { form: "lines"; lines: string[]; view?: string }
  | { form: "rows"; title: string; rows: Row[] }
  | { form: "link"; target: string; caption: string };

const URL_PATTERN = /^https?:\/\/\S+$/;
const RATIO_PATTERN = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;

const str = (value: string | null | undefined): string => value ?? "";

/// A textblock's text, inline math as `$latex$` and line breaks as `\n`.
function textOf(block: ProseMirrorNode): string {
  return block.textBetween(0, block.content.size, "\n", (leaf) =>
    leaf.type.name === "inlineMath" ? `$${str(leaf.attrs.latex)}$` : "",
  );
}

function linesOfTextblocks(node: ProseMirrorNode): string[] {
  const lines: string[] = [];
  node.descendants((child) => {
    if (!child.isTextblock) return true;
    lines.push(...textOf(child).split("\n"));
    return false;
  });
  return lines.length > 0 ? lines : [""];
}

function readCells(node: ProseMirrorNode, width: number): string[][] {
  return parseCells(str(node.attrs.rows), width);
}

const isRowBlock = (type: string): type is RowBlock => Object.hasOwn(ROW_READERS, type);

const ROW_READERS = {
  steps: (node) => readCells(node, 2).map(([primary, secondary]) => ({ primary, secondary })),
  details: (node) => readCells(node, 2).map(([primary, secondary]) => ({ primary, secondary })),
  stats: (node) =>
    readCells(node, 3).map(([value, label, hint]) => ({
      primary: hint ? `${label} (${hint})` : label,
      secondary: value,
    })),
  timeline: (node) =>
    parseTimeline(str(node.attrs.rows)).map((row) => ({ primary: row.label, secondary: row.date })),
  progress: (node) =>
    parseProgress(str(node.attrs.rows)).map((row) => ({
      primary: row.label,
      secondary: `${row.value}/${row.goal}`,
    })),
  tree: (node) =>
    parseTree(str(node.attrs.rows)).map((row) => ({ primary: row.label, secondary: "" })),
} satisfies Record<string, (node: ProseMirrorNode) => Row[]>;

type RowBlock = keyof typeof ROW_READERS;

const LINK_TYPES = new Set(["image", "video", "audio", "file", "embed", "bookmark"]);
const SOURCE_TYPES = new Set(["equation", "math", "diagram"]);

/// The block read as a shape, or `null` when it isn't something to convert
/// (tables, dividers, linked items).
function read(node: ProseMirrorNode): Draft | null {
  const type = node.type.name;
  if (isRowBlock(type)) {
    return { form: "rows", title: str(node.attrs.title), rows: ROW_READERS[type](node) };
  }
  if (LINK_TYPES.has(type)) {
    return { form: "link", target: str(node.attrs.rows).trim(), caption: str(node.attrs.caption) };
  }
  if (type === "codeBlock" || SOURCE_TYPES.has(type)) {
    const view = SOURCE_TYPES.has(type) ? str(node.attrs.view) : undefined;
    return { form: "lines", lines: node.textContent.split("\n"), view };
  }
  if (["paragraph", "heading", "callout"].includes(type)) {
    return { form: "lines", lines: textOf(node).split("\n") };
  }
  if (["blockquote", "bulletList", "orderedList", "taskList", "toggle"].includes(type)) {
    return { form: "lines", lines: linesOfTextblocks(node) };
  }
  return null;
}

const rowLine = (row: Row) => (row.secondary ? `${row.primary}: ${row.secondary}` : row.primary);

/// Plain lines out of a shape, or `null` for a link that isn't a bare URL.
function asLines(draft: Draft): string[] | null {
  if (draft.form === "lines") return draft.lines;
  if (draft.form === "rows") {
    return [...(draft.title ? [draft.title] : []), ...draft.rows.map(rowLine)];
  }
  if (!URL_PATTERN.test(draft.target)) return null;
  return draft.caption ? [draft.target, draft.caption] : [draft.target];
}

function asRows(draft: Draft): { title: string; rows: Row[] } | null {
  if (draft.form === "rows") return draft;
  if (draft.form === "link") return null;
  return { title: "", rows: draft.lines.map((line) => ({ primary: line, secondary: "" })) };
}

/// A link out of a shape: itself, or one text line that is a URL.
function asLink(draft: Draft): { target: string; caption: string } | null {
  if (draft.form === "link") return draft;
  if (draft.form === "rows") return null;
  const urls = draft.lines.filter((line) => line.trim() !== "");
  return urls.length === 1 && URL_PATTERN.test(urls[0].trim())
    ? { target: urls[0].trim(), caption: "" }
    : null;
}

type Build = (draft: Draft) => JSONContent[] | null;

const inline = (line: string): JSONContent[] => (line ? [{ type: "text", text: line }] : []);
const paragraphs = (lines: string[]): JSONContent[] =>
  lines.map((line) => ({ type: "paragraph", content: inline(line) }));

const textBuild =
  (build: (lines: string[]) => JSONContent[]): Build =>
  (draft) => {
    const lines = asLines(draft);
    return lines ? build(lines) : null;
  };

const headingBuild = (level: number, toggle: string | null) =>
  textBuild((lines) =>
    lines.map((line) => ({
      type: "heading",
      attrs: { level, toggle },
      content: inline(line),
    })),
  );

const listBuild = (type: string, itemType: string) =>
  textBuild((lines) => [
    {
      type,
      content: lines.map((line) => ({
        type: itemType,
        content: [{ type: "paragraph", content: inline(line) }],
      })),
    },
  ]);

const sourceBuild = (type: string) =>
  textBuild((lines) => [{ type, attrs: { view: "source" }, content: inline(lines.join("\n")) }]);

const ratio = (secondary: string) => {
  const match = RATIO_PATTERN.exec(secondary.trim());
  return match && Number(match[2]) > 0 ? { value: Number(match[1]), goal: Number(match[2]) } : null;
};

const rowBuild =
  (type: string, rows: (rows: Row[]) => string | null): Build =>
  (draft) => {
    const source = asRows(draft);
    const content = source && rows(source.rows);
    if (content === null || !source) return null;
    return [{ type, attrs: { rows: content, title: source.title || null } }];
  };

const cellRows = (cells: (row: Row) => string[]) => (rows: Row[]) =>
  serializeCells(rows.map(cells));

const BUILDERS = {
  steps: (draft) =>
    rowBuild(
      "steps",
      cellRows((row) => [row.primary, row.secondary]),
    )(draft)?.map((block) => ({
      ...block,
      attrs: { ...block.attrs, current: null },
    })) ?? null,
  details: rowBuild(
    "details",
    cellRows((row) => [row.primary, row.secondary]),
  ),
  stats: rowBuild("stats", (rows) =>
    rows.length > MAX_STATS
      ? null
      : serializeCells(rows.map((row) => [row.secondary, row.primary])),
  ),
  timeline: rowBuild("timeline", (rows) =>
    serializeTimeline(
      rows.map((row) => ({ date: row.secondary, label: row.primary, state: "done" as const })),
    ),
  ),
  progress: rowBuild("progress", (rows) =>
    serializeProgress(
      rows.map((row) => {
        const parsed = ratio(row.secondary);
        return parsed
          ? { label: row.primary, ...parsed }
          : { label: rowLine(row), value: 0, goal: 10 };
      }),
    ),
  ),
  tree: rowBuild("tree", (rows) =>
    serializeTree(rows.map((row) => ({ depth: 0, label: rowLine(row) }))),
  ),
} satisfies Record<RowBlock, Build>;

const linkBuild =
  (type: string, plainOnly: boolean): Build =>
  (draft) => {
    const link = asLink(draft);
    if (!link || (plainOnly && !URL_PATTERN.test(link.target))) return null;
    const attrs = plainOnly
      ? { rows: link.target }
      : { rows: link.target, caption: link.caption || null };
    return [{ type, attrs }];
  };

/// A block type existing content can turn into. `title` names its entry in
/// `SLASH_ITEMS`, whose icon and description the picker shows, so it reads
/// exactly like the "/" and gutter "+" menus.
export interface BlockKind {
  title: string;
  matches: (node: ProseMirrorNode) => boolean;
  /// Converts text kinds in place, keeping their inline formatting.
  flow?: (chain: ChainedCommands) => ChainedCommands;
  build: Build;
}

const is = (name: string) => (node: ProseMirrorNode) => node.type.name === name;
const isHeading = (level: number) => (node: ProseMirrorNode) =>
  node.type.name === "heading" && node.attrs.level === level && !node.attrs.toggle;

const headingKind = (level: number): BlockKind => ({
  title: `Heading ${level}`,
  matches: isHeading(level),
  flow: (chain) => chain.setNode("heading", { level, toggle: null }),
  build: headingBuild(level, null),
});

const rowKind = (title: string, type: RowBlock): BlockKind => ({
  title,
  matches: is(type),
  build: BUILDERS[type],
});

const sourceKind = (title: string, type: string): BlockKind => ({
  title,
  matches: is(type),
  build: sourceBuild(type),
});

const linkKind = (title: string, type: string, plainOnly = false): BlockKind => ({
  title,
  matches: is(type),
  build: linkBuild(type, plainOnly),
});

/// Same order as the slash menu, minus the blocks nothing turns into (Divider,
/// Table, Inline math, Linked item).
export const BLOCK_KINDS: BlockKind[] = [
  {
    title: "Text",
    matches: is("paragraph"),
    flow: (chain) => chain.setParagraph(),
    build: textBuild(paragraphs),
  },
  headingKind(1),
  headingKind(2),
  headingKind(3),
  headingKind(4),
  headingKind(5),
  headingKind(6),
  {
    title: "Toggle heading",
    matches: (node) => node.type.name === "heading" && Boolean(node.attrs.toggle),
    flow: (chain) => chain.setNode("heading", { level: 2, toggle: "open" }),
    build: headingBuild(2, "open"),
  },
  {
    title: "Toggle",
    matches: is("toggle"),
    build: textBuild((lines) => [
      { type: "toggle", attrs: { toggle: "open" }, content: paragraphs(lines) },
    ]),
  },
  {
    title: "Quote",
    matches: is("blockquote"),
    flow: (chain) => chain.toggleBlockquote(),
    build: textBuild((lines) => [{ type: "blockquote", content: paragraphs(lines) }]),
  },
  {
    title: "Callout",
    matches: is("callout"),
    flow: (chain) => chain.setNode("callout", { variant: "note" }),
    build: textBuild((lines) => [
      {
        type: "callout",
        attrs: { variant: "note" },
        content: lines.flatMap((line, i) => [
          ...(i > 0 ? [{ type: "hardBreak" }] : []),
          ...inline(line),
        ]),
      },
    ]),
  },
  {
    title: "Code block",
    matches: is("codeBlock"),
    flow: (chain) => chain.toggleCodeBlock(),
    build: textBuild((lines) => [{ type: "codeBlock", content: inline(lines.join("\n")) }]),
  },
  {
    title: "Bulleted list",
    matches: is("bulletList"),
    flow: (chain) => chain.toggleBulletList(),
    build: listBuild("bulletList", "listItem"),
  },
  {
    title: "Numbered list",
    matches: is("orderedList"),
    flow: (chain) => chain.toggleOrderedList(),
    build: listBuild("orderedList", "listItem"),
  },
  {
    title: "Checklist",
    matches: is("taskList"),
    flow: (chain) => chain.toggleTaskList(),
    build: listBuild("taskList", "taskItem"),
  },
  rowKind("Steps", "steps"),
  rowKind("Tree", "tree"),
  rowKind("Details", "details"),
  rowKind("Stats", "stats"),
  rowKind("Progress", "progress"),
  rowKind("Timeline", "timeline"),
  sourceKind("Equation", "equation"),
  sourceKind("Math block", "math"),
  sourceKind("Diagram", "diagram"),
  linkKind("Image", "image"),
  linkKind("Video", "video"),
  linkKind("Audio", "audio"),
  linkKind("File", "file"),
  linkKind("Web bookmark", "bookmark", true),
  linkKind("Embed", "embed", true),
];

/// Types whose text converts in place, with inline formatting kept.
const FLOW_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "callout",
  "bulletList",
  "orderedList",
  "taskList",
  "codeBlock",
]);

export const isFlowBlock = (node: ProseMirrorNode) => FLOW_TYPES.has(node.type.name);

/// `node` as blocks of `kind`, or `null` when `kind` can't hold it. Their first
/// block still needs the original's `blockId`.
export function convertedBlocks(
  node: ProseMirrorNode,
  kind: BlockKind,
  schema: Schema,
): ProseMirrorNode[] | null {
  const draft = read(node);
  const json = draft && kind.build(draft);
  return json ? json.map((block) => schema.nodeFromJSON(block)) : null;
}

/// Every kind `node` can turn into, in menu order. The block's own kind is left
/// out, since turning a block into what it already is does nothing.
export function turnIntoKinds(node: ProseMirrorNode): BlockKind[] {
  const draft = read(node);
  if (!draft) return [];
  return BLOCK_KINDS.filter((kind) => !kind.matches(node) && kind.build(draft) !== null);
}
