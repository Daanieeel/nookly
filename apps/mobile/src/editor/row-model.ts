import {
  MAX_STATS,
  type TimelineRow,
  type TimelineState,
  normalizeDepths,
  parseCells,
  parseProgress,
  parseTimeline,
  parseTree,
  serializeCells,
  serializeProgress,
  serializeTimeline,
  serializeTree,
} from "@nookly/shared/blocks/custom-rows";

/// The row blocks (Steps, Tree, Details, Stats, Progress, Timeline) as the phone edits them:
/// each row is a list of the text of its fields, and each block says how its `rows` attribute
/// reads into those and writes back, in the same line format every other client uses.

export const ROW_BLOCK_TYPES = [
  "steps",
  "tree",
  "details",
  "stats",
  "progress",
  "timeline",
] as const;
export type RowBlockType = (typeof ROW_BLOCK_TYPES)[number];

export interface RowField {
  name: string;
  placeholder: string;
  /// A number goes in, from a number pad.
  numeric?: boolean;
}

export interface RowSpec {
  /// The icon the block's menu item has.
  icon: string;
  titlePlaceholder: string;
  addLabel: string;
  removeLabel: string;
  fields: RowField[];
  /// Most rows the block holds.
  max?: number;
  read: (rows: string) => string[][];
  write: (cells: string[][]) => string;
  /// A new row below `index`, from the rows as they are.
  blank: (cells: string[][], index: number) => string[];
}

const empty = (width: number) => Array.from({ length: width }, () => "");

/// A number as the block keeps it: not negative, `fallback` when it is not a number.
function number(text: string, fallback: number): number {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

const TIMELINE_STATES: readonly TimelineState[] = ["done", "now", "next"];

/// What a timeline row's marker does when pressed: done, now, next, and round again.
export function nextTimelineState(state: string): TimelineState {
  const at = TIMELINE_STATES.indexOf(state === "now" || state === "next" ? state : "done");
  return TIMELINE_STATES[(at + 1) % TIMELINE_STATES.length];
}

const timelineRows = (cells: string[][]): TimelineRow[] =>
  cells.map(([date, label, state]) => ({
    date,
    label,
    state: state === "now" || state === "next" ? state : "done",
  }));

export const ROW_SPECS = {
  steps: {
    icon: "steps",
    titlePlaceholder: "Steps",
    addLabel: "Add step",
    removeLabel: "Remove Step",
    fields: [
      { name: "title", placeholder: "Step" },
      { name: "detail", placeholder: "Add detail" },
    ],
    read: (rows) => parseCells(rows, 2),
    write: serializeCells,
    blank: () => empty(2),
  },
  details: {
    icon: "details",
    titlePlaceholder: "Details",
    addLabel: "Add detail",
    removeLabel: "Remove Detail",
    fields: [
      { name: "label", placeholder: "Label" },
      { name: "value", placeholder: "Value" },
    ],
    read: (rows) => parseCells(rows, 2),
    write: serializeCells,
    blank: () => empty(2),
  },
  stats: {
    icon: "stats",
    titlePlaceholder: "Stats",
    addLabel: "Add stat",
    removeLabel: "Remove Stat",
    fields: [
      { name: "value", placeholder: "0" },
      { name: "label", placeholder: "Label" },
      { name: "hint", placeholder: "Hint" },
    ],
    max: MAX_STATS,
    read: (rows) => parseCells(rows, 3),
    write: serializeCells,
    blank: () => empty(3),
  },
  progress: {
    icon: "progress",
    titlePlaceholder: "Progress",
    addLabel: "Add goal",
    removeLabel: "Remove Goal",
    fields: [
      { name: "label", placeholder: "Goal" },
      { name: "value", placeholder: "0", numeric: true },
      { name: "goal", placeholder: "10", numeric: true },
    ],
    read: (rows) => parseProgress(rows).map((r) => [r.label, String(r.value), String(r.goal)]),
    write: (cells) =>
      serializeProgress(
        cells.map(([label, value, goal]) => {
          const target = number(goal, 10);
          return { label, value: number(value, 0), goal: target > 0 ? target : 10 };
        }),
      ),
    blank: (cells, index) => ["", "0", cells[index]?.[2] ?? "10"],
  },
  timeline: {
    icon: "timeline",
    titlePlaceholder: "Timeline",
    addLabel: "Add event",
    removeLabel: "Remove Event",
    fields: [
      { name: "date", placeholder: "Date" },
      { name: "label", placeholder: "Event" },
    ],
    read: (rows) => parseTimeline(rows).map((r) => [r.date, r.label, r.state]),
    write: (cells) => serializeTimeline(timelineRows(cells)),
    blank: () => ["", "", "done"],
  },
  tree: {
    icon: "tree",
    titlePlaceholder: "Tree",
    addLabel: "Add item",
    removeLabel: "Remove Item",
    fields: [{ name: "label", placeholder: "Item" }],
    read: (rows) => parseTree(rows).map((r) => [String(r.depth), r.label]),
    write: (cells) =>
      serializeTree(cells.map(([depth, label]) => ({ depth: Number(depth) || 0, label }))),
    // Below an item that has children the new one is its first child; else a sibling.
    blank: (cells, index) => {
      const depth = Number(cells[index]?.[0]) || 0;
      const next = cells[index + 1];
      return [String(depth + (next && Number(next[0]) > depth ? 1 : 0)), ""];
    },
  },
} satisfies Record<RowBlockType, RowSpec>;

/// Where each field's text sits in a cell row: a tree and a timeline keep their own extras
/// (depth, state) in front of or behind the fields, so the field index is not the cell's.
export const FIELD_CELLS = {
  steps: [0, 1],
  details: [0, 1],
  stats: [0, 1, 2],
  progress: [0, 1, 2],
  timeline: [0, 1],
  tree: [1],
} satisfies Record<RowBlockType, number[]>;

/// Moves a tree item, and everything nested under it, `by` levels: in only as far as the item
/// above it allows, out never past the top.
export function shiftTree(cells: string[][], index: number, by: 1 | -1): string[][] {
  const depth = Number(cells[index][0]) || 0;
  const limit = by > 0 ? (Number(cells[index - 1]?.[0]) || 0) + 1 : 0;
  if (index === 0 && by > 0) return cells;
  if (by > 0 ? depth >= limit : depth <= limit) return cells;
  let end = index + 1;
  while (end < cells.length && (Number(cells[end][0]) || 0) > depth) end++;
  return cells.map((row, i) =>
    i >= index && i < end ? [String((Number(row[0]) || 0) + by), row[1]] : row,
  );
}

/// The steps' current step, from the `current` attribute: a 1 based number, none before starting.
export const currentStep = (attr: string | null | undefined): number | null => {
  if (!attr) return null;
  const n = Number(attr);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/// The tree's depths, as the writer will keep them (never more than one below the row above).
export const treeDepths = (cells: string[][]): number[] =>
  normalizeDepths(cells.map(([depth, label]) => ({ depth: Number(depth) || 0, label }))).map(
    (r) => r.depth,
  );
