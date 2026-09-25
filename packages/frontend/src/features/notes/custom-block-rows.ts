/// Content formats of the row based custom blocks, the same line formats the
/// backend validates and exports (`block_types.rs`): one row per line, cells
/// separated by a tab. Every row is kept, blank ones included, so a row the user
/// just added survives a save.

/// Blocks edited through their own UI rather than as document text. The editor
/// node and the backend block type share the name; the node keeps the block's
/// content in `rows` and each attr listed here as a string, `null` when unset.
export const ATOM_BLOCK_ATTRS = {
  timeline: ["title"],
  progress: ["title"],
  tree: ["title"],
  steps: ["title", "current"],
  stats: ["title"],
  details: ["title"],
  divider: [],
  entity_card: [],
  image: ["caption"],
  video: ["caption"],
  audio: ["caption"],
  file: ["caption"],
  embed: [],
  bookmark: [],
} as const satisfies Record<string, readonly string[]>;
export type AtomBlockType = keyof typeof ATOM_BLOCK_ATTRS;

export function isAtomBlockType(type: string): type is AtomBlockType {
  return Object.hasOwn(ATOM_BLOCK_ATTRS, type);
}

/// Tabs and line breaks separate cells and rows, so they can't live inside one.
export function sanitizeCell(text: string): string {
  return text.replace(/[\t\r\n]+/g, " ");
}

function lines(content: string): string[] {
  return content.length > 0 ? content.split("\n") : [""];
}

export type TimelineState = "done" | "now" | "next";

export interface TimelineRow {
  date: string;
  label: string;
  state: TimelineState;
}

export function parseTimeline(content: string): TimelineRow[] {
  return lines(content).map((line) => {
    const [date = "", label = "", state = ""] = line.split("\t");
    return { date, label, state: state === "now" || state === "next" ? state : "done" };
  });
}

export function serializeTimeline(rows: TimelineRow[]): string {
  return rows
    .map((row) => {
      const cells = [sanitizeCell(row.date), sanitizeCell(row.label)];
      if (row.state !== "done") cells.push(row.state);
      return cells.join("\t");
    })
    .join("\n");
}

export interface ProgressRow {
  label: string;
  value: number;
  goal: number;
}

function parseNumber(text: string | undefined, fallback: number): number {
  const n = Number(text);
  return text !== undefined && text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function parseProgress(content: string): ProgressRow[] {
  return lines(content).map((line) => {
    const [label = "", value, goal] = line.split("\t");
    const parsedGoal = parseNumber(goal, 10);
    return { label, value: parseNumber(value, 0), goal: parsedGoal > 0 ? parsedGoal : 10 };
  });
}

export function serializeProgress(rows: ProgressRow[]): string {
  return rows.map((row) => `${sanitizeCell(row.label)}\t${row.value}\t${row.goal}`).join("\n");
}

export interface TreeRow {
  depth: number;
  label: string;
}

/// Two leading spaces per level. Depth never jumps more than one level below the
/// row above, the same rule the export follows.
export function normalizeDepths(rows: TreeRow[]): TreeRow[] {
  let previous = -1;
  return rows.map((row) => {
    const depth = Math.max(0, Math.min(row.depth, previous + 1));
    previous = depth;
    return depth === row.depth ? row : { ...row, depth };
  });
}

export function parseTree(content: string): TreeRow[] {
  return normalizeDepths(
    lines(content).map((line) => {
      const indent = line.length - line.trimStart().length;
      return { depth: Math.floor(indent / 2), label: line.trimStart() };
    }),
  );
}

export function serializeTree(rows: TreeRow[]): string {
  return normalizeDepths(rows)
    .map((row) => `${"  ".repeat(row.depth)}${sanitizeCell(row.label).trimStart()}`)
    .join("\n");
}

/// Connector lines for each tree row: `through[level]` is true where an
/// ancestor's vertical line passes this row, `last` whether no later sibling
/// follows it (its elbow stops halfway).
export interface TreeConnectors {
  through: boolean[];
  last: boolean;
}

export function treeConnectors(rows: TreeRow[]): TreeConnectors[] {
  const hasLaterSibling = rows.map((row, i) => {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].depth < row.depth) return false;
      if (rows[j].depth === row.depth) return true;
    }
    return false;
  });
  // The nearest row above at each depth is that depth's current ancestor.
  const ancestors: number[] = [];
  return rows.map((row, i) => {
    ancestors[row.depth] = i;
    ancestors.length = row.depth + 1;
    const through = ancestors.slice(1, row.depth).map((index) => hasLaterSibling[index]);
    return { through, last: !hasLaterSibling[i] };
  });
}

/// Rows of plain text cells (steps, stats, details): `width` cells per row,
/// missing ones read as empty.
export function parseCells(content: string, width: number): string[][] {
  return lines(content).map((line) => {
    const cells = line.split("\t");
    return Array.from({ length: width }, (_, i) => cells[i] ?? "");
  });
}

/// Trailing empty cells are dropped, so an optional last cell stays optional.
export function serializeCells(rows: string[][]): string {
  return rows
    .map((row) => {
      const cells = row.map(sanitizeCell);
      while (cells.length > 1 && cells[cells.length - 1] === "") cells.pop();
      return cells.join("\t");
    })
    .join("\n");
}

export const MAX_STATS = 4;
