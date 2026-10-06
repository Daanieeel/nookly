import { outputLabel, runsWidth, textWidth, type Run } from "./label";
import type { Circuit, GateNode, GateOp, InputNode, Output, Source } from "./parse";
import {
  BUBBLE_R,
  gateSymbol,
  inputTerminal,
  outputTerminal,
  type Point,
  type GateSymbol,
} from "./symbols";

/// Turns a circuit into positions: gates in columns by depth, rows ordered to
/// keep wires from crossing, and orthogonal wires in the gaps between columns.

const WIRE_SLOT = 10;
const ROW_GAP = 18;
const BASE_GAP = 40;
const LANE_GAP = 10;
const WIRE_LABEL_SIZE = 13;
export const TAG_SIZE = 12;
export const PIN_TAG_SIZE = 11;
/// Inside a gate: from its back to a pin's label, and between the labels and the tag.
export const LABEL_INSET = 5;
const LABEL_GAP = 5;
const PAD_X = 14;
const PAD_TOP = 22;
const PAD_BOTTOM = 14;

interface Edge {
  from: LayoutNode;
  to: LayoutNode;
  pin: number;
}

export interface LayoutNode {
  key: string;
  /// A `wire` is a signal passing through a column on its way to a later one.
  kind: "input" | "gate" | "output" | "wire";
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /// Offsets from the node's top left.
  pinX: number[];
  pinY: number[];
  outX: number;
  outY: number;
  /// Which input pins carry a bubble.
  negated: boolean[];
  label: Run[];
  gate?: GateNode;
  /// A gate's number (`G1`), and what feeds each of its input pins.
  tag?: string;
  pinTags: string[];
  symbol?: GateSymbol;
  ins: Edge[];
  outs: Edge[];
}

export interface Layout {
  width: number;
  height: number;
  nodes: LayoutNode[];
  /// Path data for every wire.
  paths: string[];
  /// Where wires branch.
  dots: Point[];
}

function newNode(key: string, kind: LayoutNode["kind"], col: number): LayoutNode {
  return {
    key,
    kind,
    col,
    x: 0,
    y: 0,
    width: 0,
    height: WIRE_SLOT,
    pinX: [0],
    pinY: [WIRE_SLOT / 2],
    outX: 0,
    outY: WIRE_SLOT / 2,
    negated: [false],
    label: [],
    pinTags: [],
    ins: [],
    outs: [],
  };
}

function inputNode(input: InputNode): LayoutNode {
  const node = newNode(`i${input.id}`, "input", 0);
  const box = inputTerminal(textWidth(input.name));
  node.label = [{ text: input.name, bars: 0, italic: true }];
  Object.assign(node, {
    width: box.width,
    height: box.height,
    outX: box.outX,
    outY: box.height / 2,
    pinX: [],
    pinY: [],
    negated: [],
  });
  return node;
}

/// What a pin's source is called on the drawing: an input's name, or a gate's tag.
function tagOf(source: Source, tags: Map<GateNode, string>): string {
  return source.kind === "input" ? source.name : (tags.get(source) ?? "");
}

/// How much wider than the standard symbol a gate must be for its labels (what feeds
/// each pin, then its own tag) to sit inside it, clear of the curved front.
function labelWidening(op: GateOp, pinTags: string[], tag: string): number {
  const fit = (widen: number) => {
    const symbol = gateSymbol(op, pinTags.length, widen);
    let labelsEnd = 0;
    pinTags.forEach((text, pin) => {
      const start = (symbol.insideX[pin] ?? 0) + LABEL_INSET;
      labelsEnd = Math.max(labelsEnd, start + textWidth(text, PIN_TAG_SIZE));
    });
    const front = op === "NOT" ? symbol.body * 0.3 : 8;
    return labelsEnd + LABEL_GAP + textWidth(tag, TAG_SIZE) + front - symbol.body;
  };
  // The back curves with the width, so a second pass settles it.
  const first = Math.max(0, fit(0));
  return Math.max(first, fit(first));
}

function gateNode(gate: GateNode, col: number, tags: Map<GateNode, string>): LayoutNode {
  const node = newNode(`g${gate.id}`, "gate", col);
  const tag = tags.get(gate) ?? "";
  const pinTags = gate.inputs.map((pin) => tagOf(pin.from, tags));
  const symbol = gateSymbol(gate.op, gate.inputs.length, labelWidening(gate.op, pinTags, tag));
  Object.assign(node, {
    gate,
    tag,
    pinTags,
    symbol,
    width: symbol.width,
    height: symbol.height,
    pinX: symbol.pinX,
    pinY: symbol.pinY,
    outX: symbol.outX,
    outY: symbol.outY,
    negated: gate.inputs.map((pin) => pin.negated),
  });
  return node;
}

function outputNode(output: Output, col: number): LayoutNode {
  const node = newNode(`o${output.id}`, "output", col);
  const label = outputLabel(output);
  const box = outputTerminal(runsWidth(label));
  Object.assign(node, {
    label,
    width: box.width,
    height: box.height,
    pinX: [0],
    pinY: [box.height / 2],
    outX: 0,
    outY: box.height / 2,
  });
  return node;
}

/// Splits long edges with a `wire` node per column they cross, shared by every
/// edge from the same signal so a fanned out signal keeps to one trunk.
interface Wired {
  nodes: LayoutNode[];
  columns: LayoutNode[][];
}

function connect(circuit: Circuit): Wired {
  const nodes: LayoutNode[] = [];
  const of = new Map<Source, LayoutNode>();
  const wires = new Map<string, LayoutNode>();

  const add = (node: LayoutNode) => {
    nodes.push(node);
    return node;
  };
  const link = (from: LayoutNode, to: LayoutNode, pin: number) => {
    const edge = { from, to, pin };
    from.outs.push(edge);
    to.ins.push(edge);
  };
  const feed = (source: Source, to: LayoutNode, pin: number) => {
    // SAFETY: every source was added before anything that reads it.
    let from = of.get(source) as LayoutNode;
    for (let col = from.col + 1; col < to.col; col++) {
      const key = `w${source.id}:${col}`;
      let wire = wires.get(key);
      if (!wire) {
        wire = add(newNode(key, "wire", col));
        wires.set(key, wire);
        link(from, wire, 0);
      }
      from = wire;
    }
    link(from, to, pin);
  };

  // Gates are numbered in the order the code builds them, so a gate's sources come first.
  const tags = new Map(circuit.gates.map((gate, index) => [gate, `G${index + 1}`]));
  for (const input of circuit.inputs) of.set(input, add(inputNode(input)));
  for (const gate of circuit.gates) {
    let col = 1;
    for (const pin of gate.inputs) {
      // SAFETY: a gate's sources are created before it.
      col = Math.max(col, (of.get(pin.from) as LayoutNode).col + 1);
    }
    const node = add(gateNode(gate, col, tags));
    of.set(gate, node);
    gate.inputs.forEach((pin, index) => feed(pin.from, node, index));
  }
  const last = Math.max(0, ...nodes.map((node) => node.col)) + 1;
  for (const output of circuit.outputs) {
    const node = add(outputNode(output, last));
    feed(output.source, node, 0);
  }

  const columns: LayoutNode[][] = Array.from({ length: last + 1 }, () => []);
  for (const node of nodes) columns[node.col]?.push(node);
  return { nodes, columns };
}

function rankColumn(column: LayoutNode[], neighbors: (node: LayoutNode) => number[]) {
  const keyed = column.map((node, index) => {
    const ranks = neighbors(node);
    const key = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : index;
    return { node, key, index };
  });
  keyed.sort((a, b) => a.key - b.key || a.index - b.index);
  keyed.forEach((entry, index) => {
    column[index] = entry.node;
  });
}

/// Reorders each column by the average position of its neighbours, back and
/// forth, which untangles most crossings.
function orderColumns(columns: LayoutNode[][]) {
  const rank = new Map<LayoutNode, number>();
  const rerank = (column: LayoutNode[]) => column.forEach((node, i) => rank.set(node, i));
  columns.forEach(rerank);
  for (let round = 0; round < 8; round++) {
    for (let c = 1; c < columns.length; c++) {
      const column = columns[c];
      rankColumn(column, (n) => n.ins.map((e) => rank.get(e.from) ?? 0));
      rerank(column);
    }
    for (let c = columns.length - 2; c >= 0; c--) {
      const column = columns[c];
      rankColumn(column, (n) => n.outs.map((e) => rank.get(e.to) ?? 0));
      rerank(column);
    }
  }
}

/// Moves a column's nodes as close to `wanted` as they can get without
/// overlapping or changing order: an isotonic regression, so a node pulled two
/// ways settles in between instead of pushing the rest down.
function place(column: LayoutNode[], wanted: (node: LayoutNode) => number | null) {
  const offsets: number[] = [];
  let offset = 0;
  for (const node of column) {
    offsets.push(offset);
    offset += node.height + ROW_GAP;
  }
  const blocks: { sum: number; count: number; first: number }[] = [];
  column.forEach((node, index) => {
    const target = (wanted(node) ?? node.y) - (offsets[index] ?? 0);
    blocks.push({ sum: target, count: 1, first: index });
    for (;;) {
      const top = blocks[blocks.length - 1];
      const below = blocks[blocks.length - 2];
      if (!top || !below || below.sum / below.count <= top.sum / top.count) break;
      below.sum += top.sum;
      below.count += top.count;
      blocks.pop();
    }
  });
  for (const block of blocks) {
    for (let i = block.first; i < block.first + block.count; i++) {
      const node = column[i];
      if (node) node.y = block.sum / block.count + (offsets[i] ?? 0);
    }
  }
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function placeRows(columns: LayoutNode[][]) {
  for (const column of columns) {
    let y = 0;
    for (const node of column) {
      node.y = y;
      y += node.height + ROW_GAP;
    }
  }
  for (let round = 0; round < 5; round++) {
    for (let c = 1; c < columns.length; c++) {
      place(columns[c], (node) =>
        mean(node.ins.map((e) => e.from.y + e.from.outY - (node.pinY[e.pin] ?? 0))),
      );
    }
    for (let c = columns.length - 2; c >= 0; c--) {
      place(columns[c], (node) =>
        mean(node.outs.map((e) => e.to.y + (e.to.pinY[e.pin] ?? 0) - node.outY)),
      );
    }
  }
  const top = Math.min(...columns.flat().map((node) => node.y));
  for (const node of columns.flat()) node.y += PAD_TOP - top;
}

/// Where an edge leaves its source and where it meets the pin it feeds.
const startOf = (e: Edge): Point => ({ cx: e.from.x + e.from.outX, cy: e.from.y + e.from.outY });
const endOf = (e: Edge): Point => ({
  cx: e.to.x + (e.to.pinX[e.pin] ?? 0) - (e.to.negated[e.pin] ? 2 * BUBBLE_R : 0),
  cy: e.to.y + (e.to.pinY[e.pin] ?? 0),
});

interface Group {
  from: LayoutNode;
  edges: Edge[];
  low: number;
  high: number;
  lane: number;
  /// Whether any branch leaves the trunk's height.
  bends: boolean;
}

/// Groups the edges of a gap by their source and gives each group that bends a
/// lane, so two vertical runs that share heights don't share a column.
interface Gap {
  groups: Group[];
  lanes: number;
}

function groupGap(edges: Edge[]): Gap {
  const bySource = new Map<LayoutNode, Edge[]>();
  for (const edge of edges) {
    bySource.set(edge.from, [...(bySource.get(edge.from) ?? []), edge]);
  }
  const groups: Group[] = [...bySource].map(([from, list]) => {
    const ys = [startOf(list[0]).cy, ...list.map((e) => endOf(e).cy)];
    const low = Math.min(...ys);
    const high = Math.max(...ys);
    return { from, edges: list, low, high, lane: 0, bends: low !== high };
  });
  const ends: number[] = [];
  for (const group of groups.filter((g) => g.bends).sort((a, b) => a.low - b.low)) {
    let lane = ends.findIndex((end) => end < group.low);
    if (lane < 0) lane = ends.length;
    ends[lane] = group.high;
    group.lane = lane;
  }
  return { groups, lanes: ends.length };
}

interface Route {
  path: string;
  dots: Point[];
}

function routeGroup(group: Group, channel: number): Route {
  const start = startOf(group.edges[0]);
  if (!group.bends) {
    const path = group.edges.map((e) => `M${start.cx} ${start.cy}H${endOf(e).cx}`).join("");
    return { path, dots: [] };
  }
  let path = `M${start.cx} ${start.cy}H${channel}M${channel} ${group.low}V${group.high}`;
  const ends = group.edges.map((e) => endOf(e));
  for (const end of ends) path += `M${channel} ${end.cy}H${end.cx}`;
  // A dot wherever three or more lines meet on the vertical.
  const dots: Point[] = [];
  for (const y of new Set([start.cy, ...ends.map((end) => end.cy)])) {
    let lines = 0;
    if (y === start.cy) lines++;
    lines += ends.filter((end) => end.cy === y).length;
    if (y > group.low) lines++;
    if (y < group.high) lines++;
    if (lines >= 3) dots.push({ cx: channel, cy: y });
  }
  return { path, dots };
}

export function layoutCircuit(circuit: Circuit): Layout {
  const { nodes, columns } = connect(circuit);
  orderColumns(columns);
  placeRows(columns);

  const width = columns.map((column) => Math.max(0, ...column.map((n) => n.width)));
  const pad = columns.map((column) =>
    Math.max(
      0,
      ...column.map((n) => (n.gate?.name ? textWidth(n.gate.name, WIRE_LABEL_SIZE) + 8 : 0)),
    ),
  );
  const gaps = columns.map((column) => {
    const edges = column.flatMap((node) => node.outs);
    return edges.length ? groupGap(edges) : { groups: [], lanes: 0 };
  });

  let x = PAD_X;
  const left: number[] = [];
  columns.forEach((column, c) => {
    left.push(x);
    for (const node of column) {
      node.x = x;
      if (node.kind === "wire") {
        node.width = width[c] ?? 0;
        node.outX = node.width;
      }
    }
    const lanes = gaps[c]?.lanes ?? 0;
    const last = c === columns.length - 1;
    x +=
      (width[c] ?? 0) + (last ? 0 : BASE_GAP + (pad[c] ?? 0) + Math.max(0, lanes - 1) * LANE_GAP);
  });

  const paths: string[] = [];
  const dots: Point[] = [];
  gaps.forEach((gap, c) => {
    const base = (left[c] ?? 0) + (width[c] ?? 0) + (pad[c] ?? 0) + BASE_GAP / 2;
    for (const group of gap.groups) {
      const routed = routeGroup(group, base + group.lane * LANE_GAP);
      paths.push(routed.path);
      dots.push(...routed.dots);
    }
  });
  // A wire node is only a stretch of wire across its column.
  for (const node of nodes.filter((n) => n.kind === "wire")) {
    const y = node.y + node.outY;
    paths.push(`M${node.x} ${y}H${node.x + node.width}`);
  }

  return {
    width: x + PAD_X,
    height: Math.max(...nodes.map((n) => n.y + n.height)) + PAD_BOTTOM,
    nodes,
    paths,
    dots,
  };
}
