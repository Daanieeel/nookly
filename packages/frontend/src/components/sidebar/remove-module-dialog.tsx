import { IconAlertTriangle } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { removeSpaceModule } from "#/lib/api/spaces.ts";
import {
  MODULE_ENTITY_TYPES,
  MODULE_LABELS,
  MODULE_PASSENGERS,
  type ModuleKey,
} from "#/lib/modules.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";

/// Passengers (Semesters with Courses) have no remove action of their own.
export function isRemovableModule(key: ModuleKey): boolean {
  return ![...MODULE_PASSENGERS.values()].flat().includes(key);
}

/// Asks how to remove a module from a Space: hide it and keep the data, or move
/// all of its content to Trash.
export function RemoveModuleDialog({
  spaceId,
  module,
  open,
  onOpenChange,
}: {
  spaceId: string;
  module: ModuleKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const label = MODULE_LABELS[module];
  const remove = useMutation({
    mutationFn: (deleteContent: boolean) => removeSpaceModule(spaceId, module, deleteContent),
    // Lists, search, Pinned, Trash and the Dashboard all change at once.
    onSuccess: () => queryClient.invalidateQueries(),
  });
  useCloseAfterSuccess(remove, () => {
    onOpenChange(false);
    const { view, setView } = useNavStore.getState();
    const removed = [module, ...(MODULE_PASSENGERS.get(module) ?? [])];
    if (view.kind === "module" && view.spaceId === spaceId && removed.includes(view.module)) {
      setView({ kind: "dashboard" });
    }
  });
  const status = statusOf(remove);
  const busy = status === "pending" || status === "success";
  const deleting = remove.variables === true;
  // A module that is only a report has no content to send to Trash.
  const hasContent = MODULE_ENTITY_TYPES[module].length > 0;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && !remove.isSuccess) remove.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-1.5">
            <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
            Remove {label} from this Space?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasContent
              ? `Hide keeps everything saved and brings it back when you add ${label} again. Move to Trash sends all ${label} content in this Space to Trash, where you can still restore it.`
              : `${label} holds no data of its own, so hiding it loses nothing. Add it again any time.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="secondary"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              if (!busy) remove.mutate(false);
            }}
          >
            <StatusButtonContent
              status={deleting ? "idle" : status}
              label={hasContent ? "Hide and Keep Data" : "Hide"}
              successLabel="Module hidden"
              errorLabel="Couldn't remove, try again"
            />
          </AlertDialogAction>
          {hasContent && (
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (!busy) remove.mutate(true);
              }}
            >
              <StatusButtonContent
                status={deleting ? status : "idle"}
                label="Move to Trash"
                successLabel="Moved to Trash"
                errorLabel="Couldn't remove, try again"
              />
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
