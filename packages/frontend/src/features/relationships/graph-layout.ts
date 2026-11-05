import type { RelationshipGraph } from "./relationship-graph.ts";

export interface Point {
  x: number;
  y: number;
}

export interface GraphLayout {
  /// Side of the square canvas, in pixels.
  size: number;
  /// Each node's centre on that canvas.
  positions: Map<string, Point>;
}

/// Room kept free around the outermost nodes, for the node itself and its edge label.
const MARGIN = 90;
/// Room along a ring for one node, so neighbours never overlap.
const ARC_PER_NODE = 100;
const MIN_RING_1 = 130;
const RING_GAP = 130;

const TAU = Math.PI * 2;

/// A radial layout: the item in the middle, its direct links on a circle around it and, with
/// a second ring, the links of those on a bigger circle. Circles grow with the number of
/// nodes on them, so a busy ring is wide instead of crowded.
export function layoutGraph(graph: RelationshipGraph): GraphLayout {
  const ring1 = graph.nodes.filter((n) => n.ring === 1).map((n) => n.id);
  const ring2 = graph.nodes.filter((n) => n.ring === 2).map((n) => n.id);

  const radius1 = Math.max(MIN_RING_1, (ring1.length * ARC_PER_NODE) / TAU);
  const radius2 = Math.max(radius1 + RING_GAP, (ring2.length * ARC_PER_NODE) / TAU);
  const outer = ring2.length > 0 ? radius2 : ring1.length > 0 ? radius1 : 0;
  const size = Math.ceil(2 * (outer + MARGIN));
  const center = size / 2;

  const angles = new Map<string, number>();
  ring1.forEach((id, i) => angles.set(id, -Math.PI / 2 + (i / ring1.length) * TAU));

  // A ring 2 node sits on the side of the ring 1 items that link to it, so its edges stay short.
  const anchor = (id: string): number => {
    const near = graph.edges
      .filter((e) => (e.to === id ? ring1.includes(e.from) : e.from === id && ring1.includes(e.to)))
      .map((e) => angles.get(e.to === id ? e.from : e.to) ?? 0);
    if (near.length === 0) return 0;
    const sin = near.reduce((sum, a) => sum + Math.sin(a), 0);
    const cos = near.reduce((sum, a) => sum + Math.cos(a), 0);
    return Math.atan2(sin, cos);
  };
  const ordered = ring2
    .map((id) => ({ id, anchor: anchor(id) }))
    .toSorted((a, b) => a.anchor - b.anchor);
  ordered.forEach(({ id }, i) => angles.set(id, -Math.PI / 2 + ((i + 0.5) / ordered.length) * TAU));

  const positions = new Map<string, Point>([[graph.nodes[0]?.id ?? "", { x: center, y: center }]]);
  for (const id of ring1) place(positions, id, angles.get(id) ?? 0, radius1, center);
  for (const id of ring2) place(positions, id, angles.get(id) ?? 0, radius2, center);
  return { size, positions };
}

function place(
  positions: Map<string, Point>,
  id: string,
  angle: number,
  radius: number,
  c: number,
) {
  positions.set(id, { x: c + Math.cos(angle) * radius, y: c + Math.sin(angle) * radius });
}
