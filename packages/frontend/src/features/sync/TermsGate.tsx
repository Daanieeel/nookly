import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { useAccountDialog } from "./account-dialog-store.ts";
import { LegalLink } from "./legal-links.tsx";
import { syncRuntime, useSyncState } from "./sync-instance.ts";
import { useTermsGate } from "./terms-gate-store.ts";

/// Agreeing to the terms: what both the dialog and the notice in Settings do.
function useAgree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncRuntime.acceptTerms(),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      const migration = syncRuntime.store.getState().migration;
      if (migration && migration.phase !== "done")
        useAccountDialog.getState().setFirstSyncOpen(true);
    },
  });
}

/// Shown when the account has not agreed to the terms of Nookly's own server, or not to
/// their latest version. Sync waits on this computer until it has; everything else works.
export function TermsGate() {
  const pending = useSyncState((state) => state.termsPending);
  const dismissed = useTermsGate((state) => state.dismissed);
  const agree = useAgree();
  return (
    <Dialog
      open={pending && !dismissed}
      onOpenChange={(next) => !next && useTermsGate.getState().dismiss()}
    >
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>Agree to the terms to keep syncing</DialogTitle>
          <DialogDescription>
            Nookly's sync service has terms of use and a privacy policy. Sync stays paused on this
            computer until you agree. Everything already on it keeps working.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          By continuing you confirm that you are at least 18 and agree to the{" "}
          <LegalLink page="terms" className="text-foreground" /> and have read the{" "}
          <LegalLink page="privacy" className="text-foreground" />.
        </p>
        <FieldError message={agree.error ? agree.error.message : null} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => useTermsGate.getState().dismiss()}>
            Not Now
          </Button>
          <Button type="button" disabled={agree.isPending} onClick={() => agree.mutate()}>
            <StatusButtonContent
              status={statusOf(agree)}
              label="Agree and Continue"
              successLabel="Agreed"
              errorLabel="Couldn't agree"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
