import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateEntity } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";

/// Saves `toPatch(input)` onto a View's entity, then refreshes every cache that shows it.
export function useUpdateViewEntity<T>(
  entity: Entity,
  toPatch: (input: T) => { title?: string; icon?: string },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => updateEntity(entity.id, toPatch(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.entity.byId(entity.id) });
      queryClient.invalidateQueries({ queryKey: qk.views.byId(entity.id) });
      queryClient.invalidateQueries({ queryKey: qk.views.bySpace(entity.spaceId) });
    },
  });
}
