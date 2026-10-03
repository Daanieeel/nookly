import { useStore, type AnyFormApi } from "@tanstack/react-form";
import { Button } from "@nookly/ui/components/button";
import { DialogFooter } from "@nookly/ui/components/dialog";
import { StatusButtonContent, type ActionStatus } from "#/components/action-feedback.tsx";
import { hasVisibleErrors } from "#/components/form-field.tsx";

/// The footer of a create or rename dialog: one primary button that submits the form,
/// disabled only while a touched field shows an error, with the shared status feedback.
export function SubmitDialogFooter({
  form,
  status,
  label,
  successLabel,
  errorLabel,
}: {
  form: AnyFormApi;
  status: ActionStatus;
  label: string;
  successLabel: string;
  errorLabel: string;
}) {
  const blocked = useStore(form.store, (state) => hasVisibleErrors(state));
  return (
    <DialogFooter>
      <Button onClick={() => void form.handleSubmit()} disabled={blocked}>
        <StatusButtonContent
          status={status}
          label={label}
          successLabel={successLabel}
          errorLabel={errorLabel}
        />
      </Button>
    </DialogFooter>
  );
}
