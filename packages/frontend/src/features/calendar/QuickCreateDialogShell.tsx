import type { ReactNode } from "react";
import {
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";

/// The dialog chrome shared by the quick create dialogs: open and close
/// handling around the create mutation, the form wrapper with its hidden
/// Enter-to-submit button, and the Create footer button.
interface CreateMutation {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
}

export function QuickCreateDialogShell({
  open,
  onOpenChange,
  create,
  title,
  submitLabel,
  successLabel,
  onSubmit,
  renderSubmitBlocked,
  formClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Only the status of the create mutation is read, so any mutation fits.
  create: CreateMutation;
  title: string;
  /// Accessible label of the hidden submit button.
  submitLabel: string;
  successLabel: string;
  onSubmit: () => void;
  /// Wraps the footer button in the form's `Subscribe` that reports whether
  /// validation errors block submitting.
  renderSubmitBlocked: (render: (blocked: boolean) => ReactNode) => ReactNode;
  formClassName: string;
  children: ReactNode;
}) {
  const createStatus = statusOf(create);
  useCloseAfterSuccess(create, () => {
    onOpenChange(false);
    create.reset();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) create.reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className={formClassName}
        >
          {children}
          {/* Lets Enter submit from any field. */}
          <button type="submit" hidden aria-label={submitLabel} />
        </form>
        <DialogFooter>
          {renderSubmitBlocked((blocked) => (
            <Button onClick={onSubmit} disabled={blocked}>
              <StatusButtonContent
                status={createStatus}
                label="Create"
                successLabel={successLabel}
                errorLabel="Couldn't create, try again"
              />
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
