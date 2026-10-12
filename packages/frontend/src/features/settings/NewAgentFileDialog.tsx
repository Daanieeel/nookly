import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { statusOf, useCloseAfterSuccess } from "#/components/action-feedback.tsx";
import { NameFormField } from "#/components/name-form-field.tsx";
import { SubmitDialogFooter } from "#/components/submit-dialog-footer.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import {
  AGENT_MAX_DEPTH,
  agentDepth,
  createAgentFolder,
  writeAgentFile,
} from "#/lib/api/agent-files.ts";

/// Letters, numbers, spaces, dots, dashes and underscores, starting with a letter or number.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;

/// What the user typed as a file name: trimmed, with `.md` added when it is missing.
function agentFileName(typed: string): string {
  const name = typed.trim();
  return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}

/// A new, empty agent file or a new folder, made inside `parent` ("" is the top). A file
/// name gets `.md` added. Neither may clash with an entry of the same folder, however it
/// is capitalized.
export function NewAgentFileDialog({
  open,
  onOpenChange,
  existing,
  kind = "file",
  parent = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Full paths of the files and folders already there.
  existing: string[];
  kind?: "file" | "folder";
  parent?: string;
  onCreated: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const folder = kind === "folder";
  const finalName = (typed: string) => (folder ? typed.trim() : agentFileName(typed));
  const pathOf = (typed: string) => (parent ? `${parent}/${finalName(typed)}` : finalName(typed));
  const label = folder ? "Folder" : "File";

  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, `Give the ${label.toLowerCase()} a name`)
      .refine((v) => NAME.test(finalName(v)), "Use letters, numbers, spaces, dots or dashes")
      .refine((v) => finalName(v).length <= 100, "Keep the name under 100 characters")
      .refine((v) => !finalName(v).includes(".."), "Do not use two dots in a row")
      .refine(
        (v) => !folder || !finalName(v).toLowerCase().endsWith(".md"),
        "A folder name cannot end in .md",
      )
      .refine(
        () => agentDepth(parent) + 1 < AGENT_MAX_DEPTH + (folder ? 0 : 1),
        "Folders can only go four levels deep",
      )
      .refine(
        (v) => !taken.has(pathOf(v).toLowerCase()),
        `A ${label.toLowerCase()} with this name already exists`,
      ),
  });

  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!create.isPending && !create.isSuccess) create.mutate(pathOf(value.name));
    },
  });

  // Never writes over a file: the name was checked against the list above. Making a
  // folder that exists changes nothing.
  const create = useMutation({
    mutationFn: async (name: string) => {
      if (folder) await createAgentFolder(name);
      else await writeAgentFile(name, "");
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
          <DialogTitle>New {label}</DialogTitle>
          {parent && <DialogDescription>In {parent}</DialogDescription>}
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
                placeholder={folder ? "e.g. Work" : "e.g. PROFILE"}
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
