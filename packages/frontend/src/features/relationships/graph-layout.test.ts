import { describe, expect, it } from "vitest";
import { layoutGraph } from "./graph-layout.ts";
import {
  buildRelationshipGraph,
  GRAPH_RING_CAP,
  type RelationshipGraph,
} from "./relationship-graph.ts";

function graphWith(ring1: number, ring2: number): RelationshipGraph {
  const rel = (id: string, from: string, to: string) => ({
    id,
    fromEntityId: from,
    toEntityId: to,
    relationshipType: "blocks",
    fromBlockId: null,
    toBlockId: null,
    createdAt: "",
  });
  return buildRelationshipGraph({
    rootId: "me",
    types: [],
    rings: 2,
    relationshipsOf: {
      me: Array.from({ length: ring1 }, (_, i) => rel(`m${i}`, "me", `a${i}`)),
      a0: Array.from({ length: ring2 }, (_, i) => rel(`s${i}`, "a0", `c${i}`)),
    },
  });
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("layoutGraph", () => {
  it("puts the item in the middle and each ring on its own circle", () => {
    const layout = layoutGraph(graphWith(6, 4));
    const center = layout.positions.get("me");
    expect(center).toEqual({ x: layout.size / 2, y: layout.size / 2 });
    const r1 = [0, 1, 2, 3, 4, 5].map((i) => dist(center!, layout.positions.get(`a${i}`)!));
    expect(new Set(r1.map((r) => Math.round(r))).size).toBe(1);
    const r2 = dist(center!, layout.positions.get("c0")!);
    expect(r2).toBeGreaterThan(r1[0]! + 60);
  });

  it("keeps every item apart and inside the canvas, even at the cap", () => {
    const layout = layoutGraph(graphWith(GRAPH_RING_CAP, GRAPH_RING_CAP));
    const points = [...layout.positions.values()];
    expect(points).toHaveLength(1 + 2 * GRAPH_RING_CAP);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(60);
      expect(p.y).toBeGreaterThanOrEqual(60);
      expect(p.x).toBeLessThanOrEqual(layout.size - 60);
      expect(p.y).toBeLessThanOrEqual(layout.size - 60);
    }
    for (const [i, a] of points.entries()) {
      for (const b of points.slice(i + 1)) expect(dist(a, b)).toBeGreaterThan(40);
    }
  });

  it("is just the item for an item with no links", () => {
    const layout = layoutGraph(graphWith(0, 0));
    expect([...layout.positions.keys()]).toEqual(["me"]);
  });
});
