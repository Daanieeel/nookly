import type { ComponentType, ReactNode } from "react";
import { Button } from "@nookly/ui/components/button";
import { DialogFooter } from "@nookly/ui/components/dialog";
import { StatusButtonContent, type ActionStatus } from "#/components/action-feedback.tsx";
import { hasVisibleErrors } from "#/components/form-field.tsx";

/// A form the footer submits and watches for visible errors. A TanStack form satisfies it.
interface SubmittableForm {
  handleSubmit: () => Promise<void>;
  Subscribe: ComponentType<{
    selector: typeof hasVisibleErrors;
    children: (blocked: boolean) => ReactNode;
  }>;
}

/// The footer of a create or rename dialog: one primary button that submits the form,
/// disabled only while a touched field shows an error, with the shared status feedback.
export function SubmitDialogFooter({
  form,
  status,
  label,
  successLabel,
  errorLabel,
}: {
  form: SubmittableForm;
  status: ActionStatus;
  label: string;
  successLabel: string;
  errorLabel: string;
}) {
  return (
    <DialogFooter>
      <form.Subscribe selector={hasVisibleErrors}>
        {(blocked) => (
          <Button onClick={() => void form.handleSubmit()} disabled={blocked}>
            <StatusButtonContent
              status={status}
              label={label}
              successLabel={successLabel}
              errorLabel={errorLabel}
            />
          </Button>
        )}
      </form.Subscribe>
    </DialogFooter>
  );
}
