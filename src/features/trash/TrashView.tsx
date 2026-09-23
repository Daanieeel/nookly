import { IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StatusButtonContent, statusOf, useCloseAfterSuccess } from "@/components/action-feedback";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { EntityKey } from "@/components/entity-key";
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
import type { Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";

/// Utility view (§1.1) — quieter/lower-emphasis than primary module content:
/// smaller header, muted rows, no bold call-to-action styling.
export function TrashView() {
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", "all", "trash"],
    queryFn: () => listEntities(null, true),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const spaceNameById = new Map(spaces.map((s) => [s.id, s.name]));
  const trashed = entities.filter((e) => e.deletedAt);

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
          <TrashRow key={e.id} entity={e} spaceName={spaceNameById.get(e.spaceId)} />
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

function TrashRow({ entity, spaceName }: { entity: Entity; spaceName: string | undefined }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["entities", "all", "trash"] });

  const restore = useMutation({
    mutationFn: () => restoreEntity(entity.id),
    onSuccess: refresh,
  });
  // Refreshing only after the dialog closes keeps the row (and its dialog) mounted
  // long enough to show the success state.
  const deleteForever = useMutation({ mutationFn: () => hardDeleteEntity(entity.id) });
  useCloseAfterSuccess(deleteForever, () => {
    setConfirmOpen(false);
    void refresh();
  });
  const restoreStatus = statusOf(restore);
  const deleteStatus = statusOf(deleteForever);

  return (
    <div className="flex items-center gap-2 rounded-sm px-2 py-1 opacity-60 hover:bg-accent hover:opacity-100">
      <EntityIcon entity={entity} size={14} className="shrink-0 text-muted-foreground" />
      <EntityKey entityKey={entity.key} />
      <span className="min-w-0 flex-1 truncate text-xs">{displayTitle(entity)}</span>
      <span className="shrink-0 text-xs text-muted-foreground/70">
        {spaceName ?? "Unknown Space"}
      </span>
      <Button variant="outline" size="sm" onClick={() => !restore.isPending && restore.mutate()}>
        <StatusButtonContent
          status={restoreStatus}
          label="Restore"
          errorLabel="Couldn't restore, try again"
        />
      </Button>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open && !deleteForever.isSuccess) deleteForever.reset();
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            Delete Forever
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{displayTitle(entity)}" forever?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases it and everything attached to it (content, links to other
              items). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (deleteStatus === "idle" || deleteStatus === "error") deleteForever.mutate();
              }}
            >
              <StatusButtonContent
                status={deleteStatus}
                label="Delete Forever"
                successLabel="Deleted"
                errorLabel="Couldn't delete, try again"
              />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
