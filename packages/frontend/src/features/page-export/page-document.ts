import { asNumber, asString, blockToNode, decodeInline } from "#/features/notes/block-markdown.ts";
import type { JSONNode } from "#/features/notes/block-markdown.ts";
import {
  parseCells,
  parseProgress,
  parseTimeline,
  parseTree,
} from "#/features/notes/custom-block-rows.ts";
import { mathBlockLatex } from "#/features/notes/math.ts";
import { parseHighlightColor } from "#/features/notes/highlight-colors.ts";
import { parseTextColor } from "#/features/notes/text-colors.ts";
import type { Block, BlockType } from "#/lib/api/types.ts";
import type {
  CalloutTone,
  ExportBlock,
  ExportDocument,
  ListItem,
  Run,
  TableCell,
  TextRun,
} from "./document-model.ts";

/// How one block type reads on paper. Every block type has one (the `satisfies` below makes
/// a new type without one a type error), the same promise the markdown export makes: a page
/// always exports whole, a custom block included.
type BlockExporter = (block: Block) => ExportBlock[];

/// A `[title](mention:id)` link, as the media, card and bookmark blocks store it.
const MENTION = /^\[([^\]]*)\]\(mention:([a-zA-Z0-9-]+)(?:#[^)]*)?\)$/;

export function runsOf(markdown: string): Run[] {
  return nodesToRuns(decodeInline(markdown));
}

function nodesToRuns(nodes: JSONNode[] | undefined): Run[] {
  return (nodes ?? []).flatMap((node): Run[] => {
    if (node.type === "inlineMath") {
      const latex = asString(node.attrs?.latex) ?? "";
      return latex ? [{ kind: "math", latex }] : [];
    }
    if (node.type !== "text" || !node.text) return [];
    const run: TextRun = { kind: "text", text: node.text };
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") run.bold = true;
      else if (mark.type === "italic") run.italic = true;
      else if (mark.type === "code") run.code = true;
      else if (mark.type === "highlight") {
        run.highlight = parseHighlightColor(asString(mark.attrs?.color)) ?? "yellow";
      } else if (mark.type === "textColor") {
        const color = parseTextColor(asString(mark.attrs?.color));
        if (color) run.color = color;
      } else if (mark.type === "link") {
        const href = asString(mark.attrs?.href);
        if (href) run.link = href;
      }
    }
    return [run];
  });
}

const text = (value: string, style: Omit<TextRun, "kind" | "text"> = {}): TextRun => ({
  kind: "text",
  text: value,
  ...style,
});

/// The text a paragraph node holds, as runs.
const paragraphRuns = (node: JSONNode | undefined) => nodesToRuns(node?.content);

/// A framed block's optional title, as the line above it.
function titled(block: Block, body: ExportBlock[]): ExportBlock[] {
  const title = block.attrs.title?.trim();
  return title ? [{ kind: "caption-title", text: title }, ...body] : body;
}

const BULLETS = ["•", "◦", "▪"];

/// The marker of item `index` (from 0) in a list counted with `marker` (`null` counts in
/// numbers), the same count the editor and the markdown export show.
export function markerFor(marker: string | null, index: number): string {
  if (!marker || !/^[aA][.)]$/.test(marker)) return `${index + 1}.`;
  const base = marker.startsWith("A") ? 65 : 97;
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    n -= 1;
    letters = String.fromCharCode(base + (n % 26)) + letters;
    n = Math.floor(n / 26);
  }
  return `${letters}${marker.slice(1)}`;
}

function listItemsOf(list: JSONNode, depth: number): ListItem[] {
  const ordered = list.type === "orderedList";
  const marker = asString(list.attrs?.marker) ?? null;
  const start = asNumber(list.attrs?.start) ?? 1;
  return (list.content ?? []).map((item, index) => {
    const [first, ...rest] = item.content ?? [];
    return {
      runs: paragraphRuns(first),
      marker: ordered
        ? markerFor(marker, start - 1 + index)
        : (BULLETS[depth % BULLETS.length] ?? "•"),
      children: rest
        .filter((child) => child.type === "bulletList" || child.type === "orderedList")
        .flatMap((child) => listItemsOf(child, depth + 1)),
    };
  });
}

function list(block: Block): ExportBlock[] {
  return [{ kind: "list", items: listItemsOf(blockToNode(block), 0) }];
}

function heading(level: 1 | 2 | 3 | 4 | 5 | 6): BlockExporter {
  return (block) => [{ kind: "heading", level, runs: runsOf(block.content) }];
}

function figure(type: "math" | "diagram" | "circuit" | "plot", latex = false): BlockExporter {
  return (block) => {
    if (!block.content.trim()) return [];
    const source = latex ? mathBlockLatex(block.content) : block.content;
    return [
      {
        kind: "figure",
        source: type === "math" ? { type, latex: source } : { type, source },
        fallback: block.content,
      },
    ];
  };
}

/// A media block's name and where it points: the mention's File, or the plain URL.
function mediaTarget(block: Block): { name: string; fileId?: string; url?: string } | null {
  const content = block.content.trim();
  if (!content) return null;
  const mention = MENTION.exec(content);
  if (mention) return { name: mention[1] ?? "", fileId: mention[2] };
  return { name: content.split("/").filter(Boolean).at(-1) ?? content, url: content };
}

const MEDIA_NOUNS = { video: "Video", audio: "Audio", file: "File" } as const;

/// Video, audio and other files can't play on paper: they show as a line naming them,
/// linked to the file.
function mediaLine(kind: keyof typeof MEDIA_NOUNS): BlockExporter {
  return (block) => {
    const target = mediaTarget(block);
    if (!target) return [];
    const caption = block.attrs.caption?.trim();
    const link = target.fileId ? `mention:${target.fileId}` : target.url;
    return [
      {
        kind: "paragraph",
        runs: [
          text(`${MEDIA_NOUNS[kind]}: `, { muted: true }),
          text(caption || target.name, { link }),
        ],
      },
    ];
  };
}

/// A card or bookmark: the linked entity's title, bold, linked when it has a URL.
function mentionCard(block: Block): ExportBlock[] {
  const mention = MENTION.exec(block.content.trim());
  if (!mention)
    return block.content.trim() ? [{ kind: "paragraph", runs: runsOf(block.content) }] : [];
  return [
    {
      kind: "paragraph",
      runs: [text(mention[1] || "Untitled", { bold: true, link: `mention:${mention[2]}` })],
    },
  ];
}

const TIMELINE_STATES = { done: "Done", now: "Now", next: "Next" } as const;

const CALLOUT_TONES: readonly CalloutTone[] = ["note", "tip", "warning", "danger"];

const cell = (runs: Run[], extra: Partial<TableCell> = {}): TableCell => ({ runs, ...extra });

/// A number as the page shows it: no trailing zeros, at most two decimals.
const formatNumber = (n: number) => String(Math.round(n * 100) / 100);

export const BLOCK_EXPORTERS = {
  paragraph: (block) => [{ kind: "paragraph", runs: runsOf(block.content) }],
  heading1: heading(1),
  heading2: heading(2),
  heading3: heading(3),
  heading4: heading(4),
  heading5: heading(5),
  heading6: heading(6),
  quote: (block) => [{ kind: "quote", runs: runsOf(block.content) }],
  code: (block) => [
    {
      kind: "code",
      text: block.content,
      label: block.filename?.trim() || block.language?.trim() || undefined,
    },
  ],
  bulleted_list: list,
  numbered_list: list,
  checklist: (block) => {
    const node = blockToNode(block);
    const items = (node.content ?? []).map((item): ListItem => ({
      runs: paragraphRuns(item.content?.[0]),
      marker: "",
      checked: item.attrs?.checked === true,
      children: [],
    }));
    return [{ kind: "list", items }];
  },
  table: (block) => {
    const rows = block.content
      .split("\n")
      .map((row) => row.split("\t").map((c) => cell(runsOf(c))));
    return [{ kind: "table", header: true, rows }];
  },
  callout: (block) => {
    const tone = CALLOUT_TONES.find((t) => t === block.attrs.variant) ?? "note";
    return [{ kind: "callout", tone, runs: runsOf(block.content) }];
  },
  timeline: (block) =>
    titled(block, [
      {
        kind: "table",
        header: false,
        lines: "rows",
        columns: ["fit", "fill", "fit"],
        rows: parseTimeline(block.content).map((row) => [
          cell([text(row.date, { bold: true })]),
          cell(runsOf(row.label)),
          cell([text(TIMELINE_STATES[row.state], { muted: true })]),
        ]),
      },
    ]),
  progress: (block) =>
    titled(block, [
      {
        kind: "table",
        header: false,
        lines: "rows",
        columns: ["fill", "fit", "fit"],
        rows: parseProgress(block.content).map((row) => {
          const share = Math.min(1, row.value / row.goal);
          return [
            cell(runsOf(row.label)),
            cell([text(`${formatNumber(row.value)} of ${formatNumber(row.goal)}`)], {
              bar: share,
            }),
            cell([text(`${Math.round(share * 100)}%`, { muted: true })]),
          ];
        }),
      },
    ]),
  tree: (block) => {
    const roots: ListItem[] = [];
    const levels: ListItem[][] = [roots];
    for (const row of parseTree(block.content)) {
      levels.length = row.depth + 1;
      const item: ListItem = {
        runs: runsOf(row.label),
        marker: BULLETS[row.depth % BULLETS.length] ?? "•",
        children: [],
      };
      (levels[row.depth] ?? roots).push(item);
      levels[row.depth + 1] = item.children;
    }
    return titled(block, [{ kind: "list", items: roots }]);
  },
  steps: (block) => {
    const current = Number(block.attrs.current) || 0;
    const items = parseCells(block.content, 2).map(([step = "", detail = ""], index): ListItem => {
      const done = current > 0 && index + 1 < current;
      return {
        runs: index + 1 === current ? [text(step, { bold: true })] : runsOf(step),
        marker: done ? "✓" : `${index + 1}.`,
        children: detail
          ? [{ runs: [text(detail, { muted: true })], marker: "", children: [] }]
          : [],
      };
    });
    return titled(block, [{ kind: "list", items }]);
  },
  stats: (block) =>
    titled(block, [
      {
        kind: "table",
        header: false,
        lines: "rows",
        rows: [
          parseCells(block.content, 3).map(([value = "", label = "", hint = ""]) =>
            cell([
              text(value, { bold: true }),
              text(`\n${label}`),
              ...(hint ? [text(`\n${hint}`, { muted: true })] : []),
            ]),
          ),
        ],
      },
    ]),
  details: (block) =>
    titled(block, [
      {
        kind: "table",
        header: false,
        lines: "rows",
        columns: ["fit", "fill"],
        rows: parseCells(block.content, 2).map(([label = "", value = ""]) => [
          cell([text(label, { muted: true })]),
          cell(runsOf(value)),
        ]),
      },
    ]),
  toggle: (block) => {
    const [summary = "", ...body] = block.content.split("\n");
    return [
      { kind: "paragraph", runs: runsOf(summary).map((run) => ({ ...run, bold: true })) },
      ...body.map((line): ExportBlock => ({ kind: "paragraph", runs: runsOf(line) })),
    ];
  },
  divider: () => [{ kind: "rule" }],
  equation: figure("math", false),
  math: figure("math", true),
  diagram: figure("diagram"),
  circuit: figure("circuit"),
  plot: figure("plot"),
  entity_card: mentionCard,
  bookmark: mentionCard,
  embed: (block) => {
    const url = block.content.trim();
    return url ? [{ kind: "paragraph", runs: [text(url, { link: url })] }] : [];
  },
  image: (block) => {
    const target = mediaTarget(block);
    if (!target) return [];
    const caption = block.attrs.caption?.trim() || undefined;
    return [
      {
        kind: "figure",
        source: { type: "image", fileId: target.fileId, url: target.url },
        fallback: caption ?? target.name,
        caption,
      },
    ];
  },
  video: mediaLine("video"),
  audio: mediaLine("audio"),
  file: mediaLine("file"),
} satisfies Record<BlockType, BlockExporter>;

/// The page's blocks in order, laid out for print. A block type this version does not know
/// (from a newer app) still exports its text as a paragraph.
const hasExporter = (type: string): type is keyof typeof BLOCK_EXPORTERS =>
  Object.hasOwn(BLOCK_EXPORTERS, type);

export function pageDocument(title: string, blocks: Block[]): ExportDocument {
  return {
    title,
    blocks: [...blocks]
      .sort((a, b) => a.position - b.position)
      .flatMap((block): ExportBlock[] => {
        return hasExporter(block.blockType)
          ? BLOCK_EXPORTERS[block.blockType](block)
          : [{ kind: "paragraph", runs: runsOf(block.content) }];
      }),
  };
}
