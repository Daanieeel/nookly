import { qk } from "#/lib/query-keys.ts";
import { IconStack2 } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { renderIconValue } from "#/components/entity-icon.tsx";
import { IconPicker } from "#/components/icon-picker.tsx";
import { updateEntity } from "#/lib/api/entities.ts";
import { createView, type SavedView, type ViewModule } from "#/lib/api/views.ts";
import type { Space } from "#/lib/api/types.ts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";

const viewSchema = z.object({
  name: z.string().trim().min(1),
  icon: z.string().nullable(),
});

type ViewValues = z.infer<typeof viewSchema>;

function moduleLabel(module: ViewModule): string {
  switch (module) {
    case "tasks-overview":
      return "Tasks overview";
    case "assignments-overview":
      return "Assignments overview";
    default:
      return MODULE_LABELS[module];
  }
}

const emptyValues: ViewValues = { name: "", icon: null };

/// Name and icon for a View: creating one from `config`, or renaming `existing`.
export function ViewDialog({
  open,
  onOpenChange,
  spaceId,
  spaces,
  module,
  config,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /// Offers a choice of Space to save in, starting at `spaceId`. For a cross-Space page.
  spaces?: Space[];
  /// What a new View is made of; unused when renaming `existing`.
  module?: ViewModule;
  config?: string;
  existing?: SavedView["entity"];
  onSaved?: (view: SavedView["entity"]) => void;
}) {
  const queryClient = useQueryClient();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [targetSpaceId, setTargetSpaceId] = useState(spaceId);

  const form = useForm({
    defaultValues: emptyValues,
    validators: { onChange: viewSchema },
    onSubmit: ({ value }) => {
      if (status === "idle" || status === "error") save.mutate(value);
    },
  });

  useEffect(() => {
    if (open) {
      setTargetSpaceId(spaceId);
      form.reset({ name: existing?.title ?? "", icon: existing?.icon ?? null });
      nameInputRef.current?.focus();
    }
  }, [open, existing, form, spaceId]);

  const save = useMutation({
    mutationFn: async ({ name, icon }: ViewValues) => {
      if (existing)
        return updateEntity(existing.id, { title: name.trim(), icon: icon ?? undefined });
      if (!module || config === undefined)
        throw new Error("A new view needs its module and config");
      return (await createView(targetSpaceId, name.trim(), module, config, icon)).entity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.views.bySpace(existing?.spaceId ?? targetSpaceId),
      });
      queryClient.invalidateQueries({ queryKey: qk.entity.root });
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
            {existing || !module ? "Rename view" : `New ${moduleLabel(module)} view`}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="icon">
            {(field) => (
              <IconPicker
                value={field.state.value}
                onChange={field.handleChange}
                withColor
                trigger={
                  <button
                    type="button"
                    aria-label="Choose view icon"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-accent text-base hover:bg-accent/80"
                  >
                    {field.state.value ? (
                      renderIconValue(field.state.value, 15)
                    ) : (
                      <IconStack2 size={15} />
                    )}
                  </button>
                }
              />
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <Input
                ref={nameInputRef}
                placeholder="View name"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="flex-1"
              />
            )}
          </form.Field>
        </form>
        {spaces && !existing && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Saved in</span>
            <Select value={targetSpaceId} onValueChange={setTargetSpaceId}>
              <SelectTrigger size="sm" className="w-44" aria-label="Space to save the view in">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <form.Subscribe selector={(state) => viewSchema.safeParse(state.values).success}>
            {(ready) => (
              <Button disabled={!ready} onClick={() => void form.handleSubmit()}>
                <StatusButtonContent
                  status={status}
                  label={existing ? "Rename" : "Create view"}
                  successLabel={existing ? "Renamed" : "View created"}
                  errorLabel="Couldn't save, try again"
                />
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
