import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addSpaceModule, listSpaceModules } from "#/lib/api/spaces.ts";
import type { Space } from "#/lib/api/types.ts";
import { MODULE_KEYS, MODULE_PASSENGERS, type ModuleKey } from "#/lib/modules.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// The modules a Space shows in the sidebar, the ones it could still add, and adding one.
/// The shown list is the source of truth for which rows exist: intentional and sticky
/// (added from the "+" or by creating a first entity), not re-derived from live entity
/// counts, so a row never disappears when its content is deleted.
export function useSpaceModules(space: Space | null) {
  const queryClient = useQueryClient();
  const setView = useNavStore((s) => s.setView);
  const spaceId = space?.id ?? "";
  const { data: added = [] } = useQuery({
    queryKey: qk.spaceModules(spaceId),
    queryFn: () => listSpaceModules(spaceId),
    enabled: space !== null,
  });
  const passengerKeys = new Set([...MODULE_PASSENGERS.values()].flat());
  const used = new Set(added);
  // Manually ordered (drag to reorder), not the fixed `MODULE_KEYS` order.
  const usedKeys = added.filter((k): k is ModuleKey => MODULE_KEYS.some((known) => known === k));
  const unusedKeys = MODULE_KEYS.filter((k) => !used.has(k) && !passengerKeys.has(k));

  const addModule = useMutation({
    mutationFn: async (key: ModuleKey) => {
      await addSpaceModule(spaceId, key);
      for (const passenger of MODULE_PASSENGERS.get(key) ?? []) {
        await addSpaceModule(spaceId, passenger);
      }
    },
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: qk.spaceModules(spaceId) });
      setView({ kind: "module", spaceId, module: key });
    },
  });

  return { usedKeys, unusedKeys, addModule };
}
