import { providerName } from "@nookly/shared/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { statusOf } from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { FormField } from "#/components/form-field.tsx";
import { PasswordInput } from "#/components/password-input.tsx";
import { qk } from "#/lib/query-keys.ts";
import { IconTrash } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { syncRuntime } from "./sync-instance.ts";

/// Deleting the account removes it and everything on the server. This device keeps its data.
/// A button opens the dialog that asks for the password (when the account has one) and a
/// typed phrase. An account made with another provider has no password: it signs in with
/// that provider once more instead, which the dialog does when the phrase is confirmed.
export function DeleteAccount({ className }: { className?: string }) {
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();
  const queryClient = useQueryClient();
  const { data: account } = useQuery({
    queryKey: qk.sync.account,
    queryFn: async () => syncRuntime.account()?.me() ?? null,
  });
  const hasPassword = account?.hasPassword !== false;
  const provider = hasPassword ? null : (account?.providers?.[0] ?? null);
  const remove = useMutation({
    mutationFn: async () => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      if (provider) {
        // The provider vouches for the person before the account goes. Closing its browser
        // is a change of mind, not an error.
        if (!(await syncRuntime.confirmWithProvider(provider))) return false;
      }
      await api.deleteAccount(hasPassword ? password : undefined);
      // The account is gone: what is on this device is the only copy, and stays.
      await syncRuntime.detach();
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) return;
      setConfirming(false);
      queryClient.removeQueries({ queryKey: qk.sync.root });
    },
  });
  useEffect(() => {
    if (!confirming) {
      setPassword("");
      remove.reset();
    }
  }, [confirming]);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructiveGhost"
        className={className}
        onClick={() => setConfirming(true)}
      >
        <IconTrash size={14} />
        Delete Account
      </Button>
      <ConfirmPermanentDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your sync account forever?"
        description="Removed from the server for good. This computer keeps its data."
        phrase="delete my account"
        actionLabel="Delete Account"
        errorLabel="Couldn't delete it"
        status={statusOf(remove)}
        error={remove.error?.message ?? false}
        disabled={hasPassword && !password}
        onConfirm={() =>
          remove.mutate(undefined, {
            // The browser was closed without confirming: back to how the dialog was.
            onSuccess: (deleted) => {
              if (!deleted) remove.reset();
            },
          })
        }
      >
        {hasPassword ? (
          <FormField label="Your password" htmlFor={inputId}>
            <PasswordInput
              id={inputId}
              placeholder="Your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
        ) : provider ? (
          <p className="text-sm text-muted-foreground">
            You will sign in with {providerName(provider)} once more to confirm it is you.
          </p>
        ) : null}
      </ConfirmPermanentDialog>
    </>
  );
}
