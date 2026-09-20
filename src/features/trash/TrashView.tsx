import { IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { hardDeleteEntity, listEntities, restoreEntity } from "@/lib/api/entities";
import { listSpaces } from "@/lib/api/spaces";
import { displayTitle } from "@/lib/entity-title";

/// Utility view (§1.1) — quieter/lower-emphasis than primary module content:
/// smaller header, muted rows, no bold call-to-action styling.
export function TrashView() {
  const queryClient = useQueryClient();
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", "all", "trash"],
    queryFn: () => listEntities(null, true),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const spaceNameById = new Map(spaces.map((s) => [s.id, s.name]));
  const trashed = entities.filter((e) => e.deletedAt);

  const restore = useMutation({
    mutationFn: (id: string) => restoreEntity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entities", "all", "trash"] }),
  });
  const deleteForever = useMutation({
    mutationFn: (id: string) => hardDeleteEntity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entities", "all", "trash"] }),
  });

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <IconTrash size={14} />
        <h1 className="text-sm font-medium">Trash</h1>
        {trashed.length > 0 && <span className="text-xs">· {trashed.length}</span>}
      </div>
      <p className="px-0.5 text-xs text-muted-foreground/70">
        Deleted items from every Space stay here until restored — nothing is purged automatically.
      </p>
      <div className="flex flex-col">
        {trashed.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 rounded-sm px-2 py-1 opacity-60 hover:bg-accent hover:opacity-100"
          >
            <EntityIcon entity={e} size={14} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs">{displayTitle(e)}</span>
            <span className="shrink-0 text-xs text-muted-foreground/70">
              {spaceNameById.get(e.spaceId) ?? "Unknown Space"}
            </span>
            <Button variant="outline" size="sm" onClick={() => restore.mutate(e.id)}>
              Restore
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Delete Forever
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{displayTitle(e)}" forever?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently erases it and everything attached to it (content, links to
                    other items). This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => deleteForever.mutate(e.id)}
                  >
                    Delete Forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
        {trashed.length === 0 && (
          <EmptyState
            icon={IconTrash}
            title="Trash is empty"
            description="Deleted items from any Space will show up here."
          />
        )}
      </div>
    </div>
  );
}
