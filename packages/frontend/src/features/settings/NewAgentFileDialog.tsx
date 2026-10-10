import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { statusOf, useCloseAfterSuccess } from "#/components/action-feedback.tsx";
import { NameFormField } from "#/components/name-form-field.tsx";
import { SubmitDialogFooter } from "#/components/submit-dialog-footer.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@nookly/ui/components/dialog";
import { writeAgentFile } from "#/lib/api/agent-files.ts";

/// Letters, numbers, spaces, dots, dashes and underscores, starting with a letter or number.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;

/// What the user typed as a file name: trimmed, with `.md` added when it is missing.
function agentFileName(typed: string): string {
  const name = typed.trim();
  return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}

/// A new, empty agent file. The name gets `.md` added and may not clash with a file
/// already in the folder, however it is capitalized.
export function NewAgentFileDialog({
  open,
  onOpenChange,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: string[];
  onCreated: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const taken = new Set(existing.map((n) => n.toLowerCase()));

  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, "Give the file a name")
      .refine((v) => NAME.test(agentFileName(v)), "Use letters, numbers, spaces, dots or dashes")
      .refine((v) => agentFileName(v).length <= 100, "Keep the name under 100 characters")
      .refine((v) => !agentFileName(v).includes(".."), "Do not use two dots in a row")
      .refine(
        (v) => !taken.has(agentFileName(v).toLowerCase()),
        "A file with this name already exists",
      ),
  });

  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!create.isPending && !create.isSuccess) create.mutate(agentFileName(value.name));
    },
  });

  // Never writes over a file: the name was checked against the list above.
  const create = useMutation({
    mutationFn: async (name: string) => {
      await writeAgentFile(name, "");
      return name;
    },
  });
  const { reset } = create;
  useCloseAfterSuccess(create, () => {
    onOpenChange(false);
    if (create.data) onCreated(create.data);
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
          <DialogTitle>New File</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <NameFormField
                field={field}
                id="agent-file-name"
                inputRef={inputRef}
                placeholder="e.g. PROFILE"
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
