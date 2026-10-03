import { SubmitDialogFooter } from "#/components/submit-dialog-footer.tsx";
import { NameFormField } from "#/components/name-form-field.tsx";
import { useForm } from "@tanstack/react-form";
import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { statusOf, useCloseAfterSuccess } from "#/components/action-feedback.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@nookly/ui/components/dialog";
import type { Entity } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// A "New <thing>" dialog with a single required Name field. On success it
/// invalidates the module's list and opens the new entity.
export function CreateNameDialog({
  open,
  onOpenChange,
  spaceId,
  heading,
  fieldId,
  placeholder,
  emptyMessage,
  create: createEntity,
  listKey,
  entitiesKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  heading: string;
  fieldId: string;
  placeholder: string;
  emptyMessage: string;
  create: (spaceId: string, title: string) => Promise<Entity>;
  listKey: QueryKey;
  entitiesKey: QueryKey;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm({
    defaultValues: { title: "" },
    validators: { onChange: z.object({ title: z.string().trim().min(1, emptyMessage) }) },
    onSubmit: ({ value }) => {
      if (!create.isPending && !create.isSuccess) create.mutate(value.title);
    },
  });

  const create = useMutation({
    mutationFn: (title: string) => createEntity(spaceId, title.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: entitiesKey });
    },
  });
  const { reset } = create;
  useCloseAfterSuccess(create, () => {
    onOpenChange(false);
    if (create.data) openEntity(create.data.id, spaceId);
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      form.reset();
      reset();
    }
  }, [open, reset, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="title">
            {(field) => (
              <NameFormField
                field={field}
                id={fieldId}
                inputRef={inputRef}
                placeholder={placeholder}
              />
            )}
          </form.Field>
        </form>
        <SubmitDialogFooter
          form={form}
          status={statusOf(create)}
          label="Create"
          successLabel="Created"
          errorLabel="Couldn't create, try again"
        />
      </DialogContent>
    </Dialog>
  );
}
