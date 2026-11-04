import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { useRelationshipGraph } from "./relationship-graph.ts";

const base = { fromBlockId: null, toBlockId: null, createdAt: "2026-01-01T00:00:00Z" };

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function setup() {
  mockCommand("list_relationship_types", [
    { name: "blocks", label: "Blocks", inverseLabel: "Blocked by", description: "" },
  ]);
  mockCommandWith("list_relationships", (args) => {
    const id = args && "entityId" in args ? String(args.entityId) : "";
    if (id === "me") {
      return [
        { ...base, id: "r1", fromEntityId: "me", toEntityId: "a", relationshipType: "blocks" },
      ];
    }
    return [{ ...base, id: "r2", fromEntityId: "a", toEntityId: "c", relationshipType: "blocks" }];
  });
}

describe("useRelationshipGraph", () => {
  it("reads only the item's own relationships for one ring", async () => {
    setup();
    const { result } = renderHook(() => useRelationshipGraph("me", 1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.graph.nodes.map((n) => n.id)).toEqual(["me", "a"]);
    expect(callsOf("list_relationships")).toHaveLength(1);
  });

  it("also reads the links of each direct link for two rings", async () => {
    setup();
    const { result } = renderHook(() => useRelationshipGraph("me", 2), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.graph.nodes.map((n) => n.id)).toContain("c"));
    expect(result.current.graph.nodes.map((n) => [n.id, n.ring])).toEqual([
      ["me", 0],
      ["a", 1],
      ["c", 2],
    ]);
  });
});
