import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { listEntities, restoreEntity } from "@/lib/api/entities";

export function TrashView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId, "trash"],
    queryFn: () => listEntities(spaceId, true),
  });
  const trashed = entities.filter((e) => e.deletedAt);

  const restore = useMutation({
    mutationFn: (id: string) => restoreEntity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entities", spaceId, "trash"] }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Trash</h1>
      <div className="flex flex-col">
        {trashed.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 opacity-60 hover:bg-accent"
          >
            <EntityIcon entity={e} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
            <Button variant="outline" size="sm" onClick={() => restore.mutate(e.id)}>
              Restore
            </Button>
          </div>
        ))}
        {trashed.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Trash is empty.</p>
        )}
      </div>
    </div>
  );
}
