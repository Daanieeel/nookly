import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { qk } from "#/lib/query-keys.ts";
import { refreshAfterFileRename } from "./rename-sync.ts";

describe("refreshAfterFileRename", () => {
  it("fetches the blocks of every loaded page again, and nothing else", async () => {
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

    await refreshAfterFileRename(client);

    expect(fetched.toSorted()).toEqual(["blocks-1", "blocks-2"]);
  });
});
