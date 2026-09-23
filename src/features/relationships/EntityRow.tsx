import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityIcon } from "@/components/entity-icon";
import { EntityKey } from "@/components/entity-key";
import { Badge } from "@/components/ui/badge";
import { getEntity } from "@/lib/api/entities";
import { listSpaces } from "@/lib/api/spaces";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { prefetchBlocks } from "@/features/notes/blocks-query";

export function EntityRow({
  entityId,
  currentSpaceId,
  label,
}: {
  entityId: string;
  currentSpaceId: string;
  label?: string;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: entity } = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => getEntity(entityId),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  if (!entity) {
    return <div className="h-7 animate-pulse rounded bg-accent/40" />;
  }

  const otherSpace =
    entity.spaceId !== currentSpaceId ? spaces.find((s) => s.id === entity.spaceId) : undefined;

  return (
    <button
      type="button"
      onClick={() => openEntity(entity.id, entity.spaceId)}
      onMouseEnter={() => prefetchBlocks(queryClient, entity.id)}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      <EntityIcon entity={entity} className="shrink-0 text-muted-foreground" />
      <EntityKey entityKey={entity.key} />
      <span className={`truncate ${entity.deletedAt ? "opacity-50" : ""}`}>
        {displayTitle(entity)}
      </span>
      {label && <span className="shrink-0 text-xs text-muted-foreground">{label}</span>}
      {otherSpace && (
        <Badge variant="outline" className="ml-auto shrink-0">
          {otherSpace.name}
        </Badge>
      )}
    </button>
  );
}
