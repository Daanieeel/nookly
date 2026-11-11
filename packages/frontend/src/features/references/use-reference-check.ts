import { useQuery } from "@tanstack/react-query";
import { checkReference } from "#/lib/api/references.ts";
import type { ReferenceStatus } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";

/// Looks at a reference's target now, when its page opens and again when asked. A file on
/// disk answers at once; a link or a Moodle object needs the network, so it is not part of
/// any list. The answer is kept for a minute, then looked up again.
export function useReferenceCheck(
  entityId: string,
  initial?: ReferenceStatus | null,
  enabled = true,
) {
  return useQuery({
    enabled,
    queryKey: qk.references.check(entityId),
    queryFn: () => checkReference(entityId),
    placeholderData: initial ?? undefined,
    staleTime: 60_000,
  });
}
