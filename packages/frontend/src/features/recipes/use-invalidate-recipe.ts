import { useQueryClient } from "@tanstack/react-query";
import { qk } from "#/lib/query-keys.ts";

/// Refreshes one Recipe and the gallery cards, which show its kind, duration,
/// tags and banner too.
export function useInvalidateRecipe(entityId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.recipes.byId(entityId) }),
      queryClient.invalidateQueries({ queryKey: qk.recipes.root }),
    ]);
}
