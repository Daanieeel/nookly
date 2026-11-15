import { SubmitDialogFooter } from "#/components/submit-dialog-footer.tsx";
import { NameFormField } from "#/components/name-form-field.tsx";
import { qk } from "#/lib/query-keys.ts";
import { FormField } from "#/components/form-field.tsx";
import { IconStack2 } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { statusOf, useCloseAfterSuccess } from "#/components/action-feedback.tsx";
import { renderIconValue } from "#/components/entity-icon.tsx";
import { IconPicker } from "#/components/icon-picker.tsx";
import { updateEntity } from "#/lib/api/entities.ts";
import { createView, type SavedView, type ViewModule } from "#/lib/api/views.ts";
import { MODULE_LABELS } from "#/lib/modules.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@nookly/ui/components/dialog";
import { FileLabelChoice, type FileLabelOptions } from "#/features/files/FileLabelChoice.tsx";

const viewSchema = z.object({
  name: z.string().trim().min(1, "Give the view a name"),
  icon: z.string().nullable(),
  labels: z.array(z.string()),
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

const emptyValues: ViewValues = { name: "", icon: null, labels: [] };

/// A Files View's labels, ticked in the dialog: `configFor` makes the View's config from
/// them, so it keeps the page's filters and display around the labels.
export interface ViewDialogLabels {
  options: FileLabelOptions;
  picked: string[];
  configFor: (picked: string[]) => string;
}

/// Name and icon for a View: creating one from `config`, or renaming `existing`. A new
/// Files View also takes its labels here (`labels`).
export function ViewDialog({
  open,
  onOpenChange,
  spaceId,
  module,
  config,
  existing,
  labels,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /// What a new View is made of; unused when renaming `existing`.
  module?: ViewModule;
  config?: string;
  existing?: SavedView["entity"];
  labels?: ViewDialogLabels;
  onSaved?: (view: SavedView["entity"]) => void;
}) {
  const queryClient = useQueryClient();
  const nameInputRef = useRef<HTMLInputElement>(null);
  // The page's labels count when the dialog opens, not while it is open.
  const pickedRef = useRef<string[]>([]);
  pickedRef.current = labels?.picked ?? [];

  const form = useForm({
    defaultValues: emptyValues,
    validators: { onChange: viewSchema },
    onSubmit: ({ value }) => {
      if (status === "idle" || status === "error") save.mutate(value);
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: existing?.title ?? "",
        icon: existing?.icon ?? null,
        labels: pickedRef.current,
      });
      nameInputRef.current?.focus();
    }
  }, [open, existing, form, spaceId]);

  const save = useMutation({
    mutationFn: async ({ name, icon, labels: picked }: ViewValues) => {
      if (existing)
        return updateEntity(existing.id, { title: name.trim(), icon: icon ?? undefined });
      const made = labels ? labels.configFor(picked) : config;
      if (!module || made === undefined) throw new Error("A new view needs its module and config");
      return (await createView(spaceId, name.trim(), module, made, icon)).entity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.views.bySpace(existing?.spaceId ?? spaceId),
      });
      queryClient.invalidateQueries({ queryKey: qk.entity.root });
    },
  });
  useCloseAfterSuccess(save, () => {
    if (save.data) onSaved?.(save.data);
    onOpenChange(false);
  });
  const status = statusOf(save);
  const withLabels = labels !== undefined && !existing;
  const { reset } = save;
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={withLabels ? "max-w-md" : "max-w-sm"}>
        <DialogHeader>
          <DialogTitle>
            {existing || !module ? "Rename view" : `New ${moduleLabel(module)} view`}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex items-start gap-2">
            <form.Field name="icon">
              {(field) => (
                <FormField label="Icon" className="shrink-0">
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
                </FormField>
              )}
            </form.Field>
            <form.Field name="name">
              {(field) => (
                <NameFormField
                  field={field}
                  id="view-name"
                  inputRef={nameInputRef}
                  placeholder="e.g. Due this week"
                  className="flex-1"
                />
              )}
            </form.Field>
          </div>
          {withLabels && (
            <form.Field name="labels">
              {(field) => (
                <FormField
                  label="Labels"
                  hint="Shows the files that carry every label ticked. Keeps this page's filters and display too."
                >
                  <FileLabelChoice
                    options={labels.options}
                    picked={field.state.value}
                    onChange={field.handleChange}
                  />
                </FormField>
              )}
            </form.Field>
          )}
        </form>
        <SubmitDialogFooter
          form={form}
          status={status}
          label={existing ? "Rename" : "Create view"}
          successLabel={existing ? "Renamed" : "View created"}
          errorLabel="Couldn't save, try again"
        />
      </DialogContent>
    </Dialog>
  );
}
