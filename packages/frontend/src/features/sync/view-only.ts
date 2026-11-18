import { isSharedSpace } from "@nookly/shared/api";
import { useQuery } from "@tanstack/react-query";
import { qk } from "#/lib/query-keys.ts";
import { syncRuntime } from "./sync-instance.ts";

/// Whether someone shared this item with this account to view only. Such an item
/// stays read only everywhere, so no edit is made only to be undone on the next sync.
export function useViewOnly(entityId: string, spaceId?: string): boolean {
  const shared = spaceId ? isSharedSpace(spaceId) : false;
  const { data: role } = useQuery({
    queryKey: qk.sync.role(entityId),
    queryFn: () => syncRuntime.engine.roleOf(entityId),
    enabled: shared,
  });
  return shared && role === "viewer";
}
