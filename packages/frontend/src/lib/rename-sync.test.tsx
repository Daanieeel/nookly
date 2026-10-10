import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { updateEntity } from "#/lib/api/entities.ts";
import { qk } from "#/lib/query-keys.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { mockCommand } from "#/test/tauri.ts";
import { useRefreshBlocksOnRename } from "./rename-sync.ts";

/// A rename rewrites the label of every mention that showed the old title, on pages the
/// app may already have loaded (the backend does it inside `update_entity`). Whichever
/// screen renamed, the loaded blocks are fetched again.
async function setup() {
  const client = new QueryClient();
  const fetched: string[] = [];
  const load = (key: string, queryKey: readonly unknown[]) =>
    client.prefetchQuery({
      queryKey,
      queryFn: async () => {
        fetched.push(key);
        return [];
      },
    });
  await load("blocks-1", qk.blocks("page-1"));
  await load("blocks-2", qk.blocks("page-2"));
  await load("entity-1", qk.entity.byId("page-1"));
  fetched.length = 0;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useRefreshBlocksOnRename(), { wrapper });
  return { fetched };
}

describe("useRefreshBlocksOnRename", () => {
  it("fetches the blocks of every loaded page again after any rename, and nothing else", async () => {
    mockCommand("update_entity", makeEntity({ id: "note-5", title: "Physics" }));
    const { fetched } = await setup();
    await updateEntity("note-5", { title: "Physics" });
    await waitFor(() => expect(fetched.toSorted()).toEqual(["blocks-1", "blocks-2"]));
  });

  it("leaves the blocks alone when something other than the title changed", async () => {
    mockCommand("update_entity", makeEntity({ id: "note-5", pinned: true }));
    const { fetched } = await setup();
    await updateEntity("note-5", { pinned: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetched).toEqual([]);
  });

  it("leaves the blocks alone when the rename failed", async () => {
    const { fetched } = await setup();
    await updateEntity("missing", { title: "x" }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetched).toEqual([]);
  });
});
