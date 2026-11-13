import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listRelationships, listRelationshipTypes } from "#/lib/api/relationships.ts";
import type { Relationship, RelationshipTypeInfo } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";

/// Most items one ring of the graph shows. A busy item stays readable, and the graph says
/// how many were left out.
export const GRAPH_RING_CAP = 50;

/// Structural links the rest of the app never lists either: they point at records that stay
/// invisible outside their Course or Semester page.
const HIDDEN_TYPES = new Set(["course-note", "semester-notes"]);

interface GraphNode {
  id: string;
  /// 0 is the item itself, 1 its direct links, 2 the links of those.
  ring: 0 | 1 | 2;
}

export interface GraphEdge {
  /// The node whose links were read to find this edge: the item, or a ring 1 item.
  from: string;
  to: string;
  /// Every relationship between the pair, worded from `from`'s side.
  labels: string[];
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /// How many items each ring left out to stay within the cap.
  truncated: { ring1: number; ring2: number };
}

interface BuildInput {
  rootId: string;
  types: RelationshipTypeInfo[];
  rings: 1 | 2;
  /// Each known item's relationships, in both directions. Items missing here have none read yet.
  relationshipsOf: Record<string, Relationship[] | undefined>;
}

/// The relationships of `id` that the graph draws: no hidden structural ones, no self links.
function visibleLinks(id: string, input: BuildInput): Relationship[] {
  return (input.relationshipsOf[id] ?? []).filter(
    (r) => !HIDDEN_TYPES.has(r.relationshipType) && r.fromEntityId !== r.toEntityId,
  );
}

/// The item's relationships as a graph of nodes and edges, ring by ring. Pure: the hook below
/// feeds it with the relationship queries the sidebar already uses.
export function buildRelationshipGraph(input: BuildInput): RelationshipGraph {
  const { rootId, types, rings } = input;
  const nodes: GraphNode[] = [{ id: rootId, ring: 0 }];
  /// Which ring an item is on. Items cut by the cap are remembered as -1 so each counts once.
  const ringOf = new Map<string, number>([[rootId, 0]]);
  const edges = new Map<string, GraphEdge>();
  const seenRelationships = new Set<string>();
  const truncated = { ring1: 0, ring2: 0 };

  const wording = (r: Relationship, side: string) => {
    const def = types.find((t) => t.name === r.relationshipType);
    return r.fromEntityId === side
      ? (def?.label ?? r.relationshipType)
      : (def?.inverseLabel ?? r.relationshipType);
  };
  const addEdge = (r: Relationship, source: string, other: string) => {
    if (seenRelationships.has(r.id)) return;
    seenRelationships.add(r.id);
    const key = source < other ? `${source}|${other}` : `${other}|${source}`;
    const existing = edges.get(key);
    // Keep the first orientation; later relationships are worded from that same side.
    const label = wording(r, existing?.from ?? source);
    if (!existing) {
      edges.set(key, { from: source, to: other, labels: [label] });
    } else if (!existing.labels.includes(label)) {
      existing.labels.push(label);
    }
  };

  const count = (ring: number) => nodes.filter((x) => x.ring === ring).length;
  /// Adds the unseen counterparts of `source`'s links to `ring`, as many as it has room for.
  const reach = (source: string, ring: 1 | 2) => {
    for (const r of visibleLinks(source, input)) {
      const other = r.fromEntityId === source ? r.toEntityId : r.fromEntityId;
      const known = ringOf.get(other);
      if (known === -1) continue;
      if (known === undefined) {
        if (count(ring) >= GRAPH_RING_CAP) {
          truncated[ring === 1 ? "ring1" : "ring2"] += 1;
          ringOf.set(other, -1);
          continue;
        }
        ringOf.set(other, ring);
        nodes.push({ id: other, ring });
      }
      addEdge(r, source, other);
    }
  };

  reach(rootId, 1);
  if (rings === 2) {
    for (const id of nodes.filter((x) => x.ring === 1).map((x) => x.id)) reach(id, 2);
  }
  return { nodes, edges: [...edges.values()], truncated };
}

/// A stable function, so the combined result keeps its identity until a query's data changes.
function combineRelationshipQueries(results: UseQueryResult<Relationship[]>[]) {
  return {
    data: results.map((q) => q.data),
    isLoading: results.some((q) => q.isLoading),
    isError: results.some((q) => q.isError),
  };
}

export interface UseRelationshipGraph {
  graph: RelationshipGraph;
  isLoading: boolean;
  isError: boolean;
}

/// The relationship graph around `rootId`, from the same queries the Relationships section
/// runs, so both stay in step. Ring 2 only reads anything when asked for.
export function useRelationshipGraph(rootId: string, rings: 1 | 2): UseRelationshipGraph {
  const root = useQuery({
    queryKey: qk.relationships.of(rootId),
    queryFn: () => listRelationships(rootId, "both"),
  });
  const typesQuery = useQuery({
    queryKey: qk.relationships.types,
    queryFn: listRelationshipTypes,
  });
  const types = typesQuery.data;

  const firstRing = useMemo(
    () =>
      buildRelationshipGraph({
        rootId,
        types: types ?? [],
        rings: 1,
        relationshipsOf: { [rootId]: root.data },
      }),
    [rootId, types, root.data],
  );
  const ring1Ids = useMemo(
    () => (rings === 2 ? firstRing.nodes.filter((x) => x.ring === 1).map((x) => x.id) : []),
    [rings, firstRing],
  );
  const secondRing = useQueries({
    queries: ring1Ids.map((id) => ({
      queryKey: qk.relationships.of(id),
      queryFn: () => listRelationships(id, "both"),
    })),
    combine: combineRelationshipQueries,
  });

  const graph = useMemo(() => {
    const relationshipsOf = Object.fromEntries([
      [rootId, root.data],
      ...ring1Ids.map((id, i) => [id, secondRing.data[i]]),
    ]);
    return buildRelationshipGraph({ rootId, types: types ?? [], rings, relationshipsOf });
  }, [rootId, types, rings, root.data, ring1Ids, secondRing.data]);

  return {
    graph,
    isLoading: root.isLoading || typesQuery.isLoading || secondRing.isLoading,
    isError: root.isError || typesQuery.isError || secondRing.isError,
  };
}
