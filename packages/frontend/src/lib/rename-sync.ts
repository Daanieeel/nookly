import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { qk } from "#/lib/query-keys.ts";

/// Fired by `updateEntity` after a title was saved, from whichever screen renamed.
export const ENTITY_RENAMED = "nookly:entity-renamed";

/// Renaming an entity rewrites the label of every mention of it that showed its name (in
/// the backend, `update_entity`), on pages the app may already have loaded. Their blocks
/// are fetched again, and an open editor pulls the new text in. Mounted once, in the app.
export function useRefreshBlocksOnRename() {
  const client = useQueryClient();
  useEffect(() => {
    const refresh = () =>
      void client.invalidateQueries({ queryKey: qk.blocksRoot, refetchType: "all" });
    window.addEventListener(ENTITY_RENAMED, refresh);
    return () => window.removeEventListener(ENTITY_RENAMED, refresh);
  }, [client]);
}
