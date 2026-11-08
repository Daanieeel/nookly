import type { MindOffset } from "./positions";
import type { MindNode, Mindmap } from "./parse";

/// Pixels. A row is the height one leaf takes; a node is a little shorter than that.
const ROW = 36;
const NODE_HEIGHT = 26;
const ROOT_HEIGHT = 34;
/// Space between a column of nodes and the next one, where the connectors run.
const COLUMN_GAP = 36;
const PADDING = 12;
/// A node's text is cut after this many characters; the full text stays in its tooltip.
const MAX_TEXT = 40;
const CHAR_WIDTH = 7;
const NODE_PADDING = 22;

export interface PlacedNode {
  /// The node's place in the outline as sibling indexes ("0.2.1"). Collapsing is keyed by it.
  id: string;
  /// The line of the outline text the node is written on. What a drag is stored by.
  line: number;
  text: string;
  /// The text as drawn: cut off when it is long.
  label: string;
  depth: number;
  /// Which side of the root the node hangs on. Top level lines of an outline with
  /// several of them all sit on the right.
  side: "left" | "right";
  /// Top left corner is `x`; `y` is the middle of the node.
  x: number;
  y: number;
  width: number;
  height: number;
  /// Whether the node has children, shown or folded away.
  expandable: boolean;
  collapsed: boolean;
  /// How many nodes a collapsed node hides.
  hiddenCount: number;
  /// The top level branch the node belongs to, for coloring.
  branch: number;
  /// Whether this is the middle of the map: the one top level line, with branches on its sides.
  root: boolean;
}

interface PlacedEdge {
  from: string;
  to: string;
}

export interface MindmapLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

/// A node on its way to being placed: its size and subtree rows, before it has a position.
interface Item {
  node: MindNode;
  id: string;
  depth: number;
  branch: number;
  width: number;
  height: number;
  collapsed: boolean;
  /// What is shown under it.
  kids: Item[];
  /// Rows the subtree takes, one per shown leaf.
  rows: number;
  hiddenCount: number;
}

interface Size {
  width: number;
  height: number;
}

const countAll = (node: MindNode): number =>
  node.children.reduce((sum, child) => sum + 1 + countAll(child), 0);

function label(text: string): string {
  const chars = [...text];
  return chars.length > MAX_TEXT ? `${chars.slice(0, MAX_TEXT - 1).join("")}…` : text;
}

/// The size of a node, from how much text it shows.
function sizeOf(text: string, root: boolean): Size {
  const chars = [...label(text)].length;
  return {
    width: Math.max(root ? 72 : 48, chars * CHAR_WIDTH + NODE_PADDING * (root ? 1.4 : 1)),
    height: root ? ROOT_HEIGHT : NODE_HEIGHT,
  };
}

function build(
  node: MindNode,
  id: string,
  depth: number,
  branch: number,
  root: boolean,
  collapsed: ReadonlySet<string>,
): Item {
  const folded = node.children.length > 0 && collapsed.has(id);
  const kids = folded
    ? []
    : node.children.map((child, i) =>
        // The middle of the map starts a new branch with each child; everywhere else a branch goes on.
        build(child, `${id}.${i}`, depth + 1, root ? i : branch, false, collapsed),
      );
  return {
    node,
    id,
    depth,
    branch,
    ...sizeOf(node.text, root),
    collapsed: folded,
    kids,
    rows: kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + kid.rows, 0),
    hiddenCount: folded ? countAll(node) : 0,
  };
}

/// The branches on each side of the middle of the map.
interface Sides {
  right: Item[];
  left: Item[];
}

/// Splits a root's branches into those on its right and those on its left, in outline
/// order, so both sides carry about the same number of rows. Both sides get at least one
/// branch when there are two or more.
function split(branches: Item[]): Sides {
  if (branches.length < 2) return { right: branches, left: [] };
  const total = branches.reduce((sum, b) => sum + b.rows, 0);
  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  let before = 0;
  for (let i = 1; i < branches.length; i++) {
    before += branches[i - 1]?.rows ?? 0;
    const gap = Math.abs(total - before - before);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return { right: branches.slice(0, best), left: branches.slice(best) };
}

/// A side of the map: columns of nodes going outward from `start`, placed top down.
class Side {
  /// The widest node of each depth, which is how wide its column is.
  readonly columns = new Map<number, number>();
  readonly placed: PlacedNode[] = [];
  readonly edges: PlacedEdge[] = [];

  constructor(
    private readonly direction: 1 | -1,
    readonly roots: Item[],
  ) {
    const measure = (item: Item) => {
      this.columns.set(item.depth, Math.max(this.columns.get(item.depth) ?? 0, item.width));
      item.kids.forEach(measure);
    };
    roots.forEach(measure);
  }

  /// How far the side reaches out from its start, from the column `first` on.
  reach(first: number): number {
    let total = 0;
    for (const [depth, width] of this.columns) if (depth >= first) total += width + COLUMN_GAP;
    return total;
  }

  get rows(): number {
    return this.roots.reduce((sum, item) => sum + item.rows, 0);
  }

  /// Distance from the start line to the near edge of a depth's column.
  private offset(depth: number, first: number): number {
    let distance = 0;
    for (let d = first; d < depth; d++) distance += (this.columns.get(d) ?? 0) + COLUMN_GAP;
    return distance;
  }

  /// Places the side's nodes, its top row starting at `top`, its first column `first` deep
  /// and beginning at `start`. A column of nodes lines up on the edge facing the root.
  place(start: number, top: number, first: number, parent?: string): void {
    let row = top;
    const visit = (item: Item): number => {
      const rowsTop = row;
      let middle: number;
      if (item.kids.length === 0) {
        middle = rowsTop + ROW / 2;
        row += ROW;
      } else {
        const ys = item.kids.map(visit);
        middle = ((ys[0] ?? 0) + (ys[ys.length - 1] ?? 0)) / 2;
      }
      const distance = this.offset(item.depth, first);
      this.placed.push({
        id: item.id,
        line: item.node.line,
        text: item.node.text,
        label: label(item.node.text),
        depth: item.depth,
        side: this.direction === 1 ? "right" : "left",
        x: this.direction === 1 ? start + distance : start - distance - item.width,
        y: middle,
        width: item.width,
        height: item.height,
        expandable: item.node.children.length > 0,
        collapsed: item.collapsed,
        hiddenCount: item.hiddenCount,
        branch: item.branch,
        root: false,
      });
      for (const kid of item.kids) this.edges.push({ from: item.id, to: kid.id });
      return middle;
    };
    for (const item of this.roots) {
      if (parent) this.edges.push({ from: parent, to: item.id });
      visit(item);
    }
  }
}

/// Lays an outline out the same way every time, then moves the nodes the user dragged:
/// a node's offset adds to its parent's, so a dragged branch takes its subtree along. A single top level line is the middle
/// of the map, its branches split over its two sides; several top level lines are
/// separate trees stacked down the right. `collapsed` holds the ids of the nodes whose
/// children are folded away.
export function layoutMindmap(
  map: Mindmap,
  collapsed: ReadonlySet<string>,
  /// How far the user dragged nodes from their automatic place, by outline line.
  offsets: ReadonlyMap<number, MindOffset> = new Map(),
): MindmapLayout {
  if (map.roots.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const single = map.roots.length === 1 ? map.roots[0] : undefined;
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];

  if (single) {
    const rootItem = build(single, "0", 0, 0, true, collapsed);
    const { right, left } = split(rootItem.kids);
    const sides = [new Side(1, right), new Side(-1, left)] as const;
    const rows = Math.max(rootItem.height / ROW, ...sides.map((s) => s.rows));
    const height = rows * ROW;
    const leftReach = sides[1].reach(1);
    const rootX = leftReach;
    const rootMiddle = height / 2;
    nodes.push({
      id: rootItem.id,
      line: single.line,
      text: single.text,
      label: label(single.text),
      depth: 0,
      side: "right",
      x: rootX,
      y: rootMiddle,
      width: rootItem.width,
      height: rootItem.height,
      expandable: single.children.length > 0,
      collapsed: rootItem.collapsed,
      hiddenCount: rootItem.hiddenCount,
      branch: 0,
      root: true,
    });
    // Each side is centered on the root, the shorter one lower than the taller one's top.
    sides[0].place(rootX + rootItem.width + COLUMN_GAP, (height - sides[0].rows * ROW) / 2, 1, "0");
    sides[1].place(rootX - COLUMN_GAP, (height - sides[1].rows * ROW) / 2, 1, "0");
    for (const side of sides) {
      nodes.push(...side.placed);
      edges.push(...side.edges);
    }
  } else {
    const trees = map.roots.map((root, i) => build(root, String(i), 0, i, false, collapsed));
    const side = new Side(1, trees);
    side.place(0, 0, 0);
    nodes.push(...side.placed);
    edges.push(...side.edges);
  }

  moveDragged(nodes, offsets);

  // Everything moves so the picture starts at its padding.
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const minY = Math.min(...nodes.map((n) => n.y - n.height / 2));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height / 2));
  const shifted = nodes.map((n) => ({ ...n, x: n.x - minX + PADDING, y: n.y - minY + PADDING }));
  return {
    nodes: sortOutline(shifted),
    edges,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
}

/// Moves each dragged node, and everything under it, by the offsets of the line it is
/// written on and of every line above it.
function moveDragged(nodes: PlacedNode[], offsets: ReadonlyMap<number, MindOffset>): void {
  if (offsets.size === 0) return;
  const total = new Map<string, MindOffset>();
  const depthOf = (node: PlacedNode) => node.id.split(".").length;
  for (const node of [...nodes].sort((a, b) => depthOf(a) - depthOf(b))) {
    const above = total.get(node.id.split(".").slice(0, -1).join(".")) ?? { x: 0, y: 0 };
    const own = offsets.get(node.line) ?? { x: 0, y: 0 };
    const sum = { x: above.x + own.x, y: above.y + own.y };
    total.set(node.id, sum);
    node.x += sum.x;
    node.y += sum.y;
  }
}

/// The nodes in outline order, which is the order a screen reader meets them in.
function sortOutline(nodes: PlacedNode[]): PlacedNode[] {
  const key = (id: string) => id.split(".").map(Number);
  return [...nodes].sort((a, b) => {
    const [ka, kb] = [key(a.id), key(b.id)];
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
      const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return ka.length - kb.length;
  });
}
