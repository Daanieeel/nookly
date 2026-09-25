import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { listBlocks } from "#/lib/api/notes.ts";

/// Shared by `BlockEditor` and the hover prefetch, so opening a page right
/// after hovering it renders straight from cache.
export function blocksQueryOptions(entityId: string) {
  return queryOptions({
    queryKey: ["blocks", entityId],
    queryFn: () => listBlocks(entityId),
  });
}

/// Mutation key for a page's block saves, so `BlockEditor` can tell a save is
/// still in flight before hydrating that page.
export function saveBlocksKey(entityId: string) {
  return ["save-blocks", entityId];
}

/// Repeated hovers within this window reuse the prefetched blocks.
const PREFETCH_STALE_MS = 30_000;

export function prefetchBlocks(queryClient: QueryClient, entityId: string) {
  void queryClient.prefetchQuery({ ...blocksQueryOptions(entityId), staleTime: PREFETCH_STALE_MS });
}
