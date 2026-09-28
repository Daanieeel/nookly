import { IconStack2 } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { renderIconValue } from "#/components/entity-icon.tsx";
import { IconPicker } from "#/components/icon-picker.tsx";
import { updateEntity } from "#/lib/api/entities.ts";
import { createView, type SavedView, type ViewModule } from "#/lib/api/views.ts";
import { MODULE_LABELS } from "#/lib/modules.ts";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";

/// Name and icon for a View: creating one from `config`, or renaming `existing`.
export function ViewDialog({
  open,
  onOpenChange,
  spaceId,
  module,
  config,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /// What a new View is made of; unused when renaming `existing`.
  module?: ViewModule;
  config?: string;
  existing?: SavedView["entity"];
  onSaved?: (view: SavedView["entity"]) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(existing?.title ?? "");
      setIcon(existing?.icon ?? null);
      nameInputRef.current?.focus();
    }
  }, [open, existing]);

  const save = useMutation({
    mutationFn: async () => {
      if (existing)
        return updateEntity(existing.id, { title: name.trim(), icon: icon ?? undefined });
      if (!module || config === undefined)
        throw new Error("A new view needs its module and config");
      return (await createView(spaceId, name.trim(), module, config, icon)).entity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["views", spaceId] });
      queryClient.invalidateQueries({ queryKey: ["entity"] });
    },
  });
  useCloseAfterSuccess(save, () => {
    if (save.data) onSaved?.(save.data);
    onOpenChange(false);
  });
  const status = statusOf(save);
  const { reset } = save;
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {existing || !module ? "Rename view" : `New ${MODULE_LABELS[module]} view`}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && (status === "idle" || status === "error")) save.mutate();
          }}
        >
          <IconPicker
            value={icon}
            onChange={setIcon}
            withColor
            trigger={
              <button
                type="button"
                aria-label="Choose view icon"
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-accent text-base hover:bg-accent/80"
              >
                {icon ? renderIconValue(icon, 15) : <IconStack2 size={15} />}
              </button>
            }
          />
          <Input
            ref={nameInputRef}
            placeholder="View name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
        </form>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            onClick={() => (status === "idle" || status === "error") && save.mutate()}
          >
            <StatusButtonContent
              status={status}
              label={existing ? "Rename" : "Create view"}
              successLabel={existing ? "Renamed" : "View created"}
              errorLabel="Couldn't save, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
