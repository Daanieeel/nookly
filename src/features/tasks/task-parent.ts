import { useQuery } from "@tanstack/react-query";
import { getEntity } from "@/lib/api/entities";
import { listRelationships } from "@/lib/api/relationships";
import type { Entity } from "@/lib/api/types";

/// The Task a Sub-task belongs to, through its `sub-task-of` relationship. Always
/// `undefined` for anything that isn't a Sub-task.
export function useTaskParent(entity: Entity | undefined): Entity | null | undefined {
  const isSubtask = entity?.type === "sub_task";
  const { data } = useQuery({
    queryKey: ["task-parent", entity?.id],
    queryFn: async () => {
      if (!entity) return null;
      const links = await listRelationships(entity.id, "from");
      const link = links.find((r) => r.relationshipType === "sub-task-of");
      return link ? getEntity(link.toEntityId) : null;
    },
    enabled: isSubtask,
  });
  return isSubtask ? data : undefined;
}
