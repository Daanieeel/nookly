import { IconArrowsDiff } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@nookly/ui/components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { qk } from "#/lib/query-keys.ts";
import { useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime, useSyncState } from "./sync-instance.ts";

/// The changes waiting for a decision on one item, for the badge on its page.
export function useEntityConflicts(entityId: string): number {
  const signedIn = useSyncState((s) => s.user !== null);
  const total = useSyncState((s) => s.status.conflicts);
  const { data = 0 } = useQuery({
    queryKey: [...qk.sync.conflictViews, entityId, total],
    queryFn: async () =>
      (await syncRuntime.conflictViews()).filter((view) => view.itemId === entityId).length,
    enabled: signedIn && total > 0,
  });
  return signedIn && total > 0 ? data : 0;
}

/// Invites a person to decide on changes two of their devices disagreed about. The
/// page stays fully usable; this is only a nudge.
export function ConflictBadge({ entityId }: { entityId: string }) {
  const count = useEntityConflicts(entityId);
  const setMergeOpen = useAccountDialog((s) => s.setMergeOpen);
  if (count === 0) return null;
  const label = count === 1 ? "1 change needs a look" : `${count} changes need a look`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label}. Review`}
          onClick={() => setMergeOpen(true)}
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Badge variant="warning" className="cursor-pointer gap-1">
            <IconArrowsDiff size={12} />
            {label}
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent>Two of your devices changed this. Review</TooltipContent>
    </Tooltip>
  );
}
