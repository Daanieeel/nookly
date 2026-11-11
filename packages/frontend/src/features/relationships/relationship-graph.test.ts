import { describe, expect, it } from "vitest";
import type { Relationship, RelationshipTypeInfo } from "#/lib/api/types.ts";
import { buildRelationshipGraph, GRAPH_RING_CAP } from "./relationship-graph.ts";

const type = (name: string, label: string, inverseLabel: string): RelationshipTypeInfo => ({
  name,
  label,
  inverseLabel,
  description: "",
  fromType: null,
  toType: null,
});
const types = [type("blocks", "Blocks", "Blocked by"), type("course-note", "Course note", "Of")];

let n = 0;
function rel(from: string, to: string, relationshipType = "blocks"): Relationship {
  n += 1;
  return {
    id: `r${n}`,
    fromEntityId: from,
    toEntityId: to,
    relationshipType,
    fromBlockId: null,
    toBlockId: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildRelationshipGraph", () => {
  it("puts direct links on ring 1 and labels each edge from the item's side", () => {
    const graph = buildRelationshipGraph({
      rootId: "me",
      types,
      rings: 1,
      relationshipsOf: { me: [rel("me", "a"), rel("b", "me")] },
    });
    expect(graph.nodes.map((x) => [x.id, x.ring])).toEqual([
      ["me", 0],
      ["a", 1],
      ["b", 1],
    ]);
    expect(graph.edges.map((e) => [e.from, e.to, e.labels])).toEqual([
      ["me", "a", ["Blocks"]],
      ["me", "b", ["Blocked by"]],
    ]);
    expect(graph.truncated).toEqual({ ring1: 0, ring2: 0 });
  });

  it("merges several relationships to the same item into one edge", () => {
    const graph = buildRelationshipGraph({
      rootId: "me",
      types,
      rings: 1,
      relationshipsOf: { me: [rel("me", "a"), rel("a", "me")] },
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.labels).toEqual(["Blocks", "Blocked by"]);
  });

  it("leaves out structural links that are hidden everywhere else, and self links", () => {
    const graph = buildRelationshipGraph({
      rootId: "me",
      types,
      rings: 1,
      relationshipsOf: { me: [rel("me", "a", "course-note"), rel("me", "me"), rel("me", "b")] },
    });
    expect(graph.nodes.map((x) => x.id)).toEqual(["me", "b"]);
  });

  it("adds the links of ring 1 items as ring 2, once, without repeating the item or ring 1", () => {
    const graph = buildRelationshipGraph({
      rootId: "me",
      types,
      rings: 2,
      relationshipsOf: {
        me: [rel("me", "a"), rel("me", "b")],
        a: [rel("me", "a"), rel("a", "c"), rel("a", "b")],
        b: [rel("b", "c")],
      },
    });
    expect(graph.nodes.map((x) => [x.id, x.ring])).toEqual([
      ["me", 0],
      ["a", 1],
      ["b", 1],
      ["c", 2],
    ]);
    const pairs = graph.edges.map((e) => `${e.from}>${e.to}`).toSorted();
    expect(pairs).toEqual(["a>b", "a>c", "b>c", "me>a", "me>b"]);
  });

  it("ignores ring 2 data when only one ring is asked for", () => {
    const graph = buildRelationshipGraph({
      rootId: "me",
      types,
      rings: 1,
      relationshipsOf: { me: [rel("me", "a")], a: [rel("a", "c")] },
    });
    expect(graph.nodes.map((x) => x.id)).toEqual(["me", "a"]);
  });

  it("caps each ring and reports how many were left out", () => {
    const many = Array.from({ length: GRAPH_RING_CAP + 7 }, (_, i) => rel("me", `a${i}`));
    const second = Array.from({ length: GRAPH_RING_CAP + 3 }, (_, i) => rel("a0", `c${i}`));
    const graph = buildRelationshipGraph({
      rootId: "me",
      types,
      rings: 2,
      relationshipsOf: { me: many, a0: second },
    });
    expect(graph.nodes.filter((x) => x.ring === 1)).toHaveLength(GRAPH_RING_CAP);
    expect(graph.nodes.filter((x) => x.ring === 2)).toHaveLength(GRAPH_RING_CAP);
    expect(graph.truncated).toEqual({ ring1: 7, ring2: 3 });
  });

  it("is empty for an item with no relationships", () => {
    const graph = buildRelationshipGraph({
      rootId: "me",
      types,
      rings: 2,
      relationshipsOf: { me: [] },
    });
    expect(graph.nodes.map((x) => x.id)).toEqual(["me"]);
    expect(graph.edges).toEqual([]);
  });
});
