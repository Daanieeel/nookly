import { NOOKLY_SIGN_IN, errorToShow, providerName, submitRecheck } from "@nookly/shared/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useStore } from "zustand";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
import { PasswordInput } from "#/components/password-input.tsx";
import { qk } from "#/lib/query-keys.ts";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { BrowserWait } from "./BrowserWait.tsx";
import { ProviderMark } from "./provider-marks.tsx";
import { recheck } from "./recheck-gate.ts";
import { SecondStepForm } from "./SecondStepForm.tsx";
import { signedInAccount, syncRuntime } from "./sync-instance.ts";

/// The first step is the password or a provider; an account with two-factor then gives a code.
function RecheckForm() {
  const id = useId();
  const formId = useId();
  const [password, setPassword] = useState("");
  // The first step went through and a code is wanted too, with the password it had.
  const [second, setSecond] = useState<{ password?: string } | null>(null);
  const { data: summary, error } = useQuery({
    queryKey: qk.sync.signIn,
    queryFn: () => signedInAccount().signInMethods(),
  });
  const first = useMutation({
    mutationFn: async (input: { password: string } | { provider: string }) => {
      if ("password" in input) return submitRecheck(signedInAccount(), input);
      if (!(await syncRuntime.confirmWithProvider(input.provider))) return "closed";
      return submitRecheck(signedInAccount(), {});
    },
    onSuccess: (outcome, input) => {
      if (outcome === "done") recheck.finish(true);
      if (outcome === "secondStep") {
        setSecond("password" in input ? { password: input.password } : {});
      }
    },
  });
  if (second && summary) {
    return (
      <SecondStepForm
        methods={summary.secondStep}
        send={() => signedInAccount().sendRecheckCode()}
        verify={(method, code) => signedInAccount().recheck({ ...second, method, code })}
        onDone={() => recheck.finish(true)}
        onBack={() => {
          setSecond(null);
          first.reset();
        }}
        successLabel="Confirmed"
        errorLabel="Couldn't confirm"
      />
    );
  }
  const methods = summary?.methods ?? [];
  const hasPassword = methods.some((method) => method.provider === NOOKLY_SIGN_IN);
  const providers = methods.filter((method) => method.provider !== NOOKLY_SIGN_IN);
  const provider =
    first.variables && "provider" in first.variables ? first.variables.provider : null;
  return (
    <div className="flex flex-col gap-3">
      {hasPassword ? (
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (password) first.mutate({ password });
          }}
        >
          <FormField label="Password" htmlFor={id} required>
            <PasswordInput
              id={id}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
        </form>
      ) : null}
      <FieldError message={errorToShow(error) ?? errorToShow(first.error)} />
      {hasPassword ? (
        <Button type="submit" form={formId} disabled={first.isPending || !password}>
          <StatusButtonContent
            // The password's own button says nothing about a provider's attempt.
            status={provider === null ? statusOf(first) : "idle"}
            label="Continue"
            successLabel="Confirmed"
            errorLabel="Couldn't confirm"
          />
        </Button>
      ) : null}
      {providers.map(({ provider }) => (
        <Button
          key={provider}
          type="button"
          variant="secondary"
          disabled={first.isPending}
          onClick={() => first.mutate({ provider })}
        >
          <ProviderMark provider={provider} className="size-4" />
          Continue with {providerName(provider)}
        </Button>
      ))}
      <BrowserWait provider={first.isPending ? provider : null} />
      <Button type="button" variant="ghost" onClick={() => recheck.finish(false)}>
        Cancel
      </Button>
    </div>
  );
}

/// Asked before a change to how the account signs in, when the last confirmation is more
/// than ten minutes old. Closing it drops the change.
export function RecheckDialog() {
  const asking = useStore(recheck.store, (state) => state.asking);
  return (
    <Dialog open={asking} onOpenChange={(open) => !open && recheck.finish(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm it's you</DialogTitle>
          <DialogDescription>Changing how you sign in needs this.</DialogDescription>
        </DialogHeader>
        <RecheckForm />
      </DialogContent>
    </Dialog>
  );
}
