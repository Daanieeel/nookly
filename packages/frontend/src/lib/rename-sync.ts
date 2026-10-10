import type { QueryClient } from "@tanstack/react-query";
import { qk } from "#/lib/query-keys.ts";

/// Renaming a File rewrites the label of every mention of it that showed its name (in
/// the backend, `update_entity`), on pages the app may already have loaded. Their blocks
/// are fetched again, and an open editor pulls the new text in.
export function refreshAfterFileRename(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: qk.blocksRoot, refetchType: "all" });
}
