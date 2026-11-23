import {
  type TwoFactorMethod,
  cleanTwoFactorCode,
  firstTwoFactorMethod,
  twoFactorMethodLabels,
} from "@nookly/shared/api";
import { IconShieldLock } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
import { Button } from "@nookly/ui/components/button";
import { IconInput } from "@nookly/ui/components/icon-input";
import { syncRuntime } from "./sync-instance.ts";

/// The second step of signing in with a password: a code from the authenticator app, one
/// emailed to the account, or a recovery code. The password was right; the challenge
/// stands for it for ten minutes.
export function TwoFactorStep({
  serverUrl,
  challenge,
  methods,
  options,
  onDone,
  onBack,
}: {
  serverUrl: string;
  challenge: string;
  methods: TwoFactorMethod[];
  options: Parameters<typeof syncRuntime.completeTwoFactor>[4];
  onDone: () => void;
  onBack: () => void;
}) {
  const id = useId();
  const [method, setMethod] = useState<TwoFactorMethod>(() => firstTwoFactorMethod(methods));
  const [code, setCode] = useState("");
  const [emailed, setEmailed] = useState(false);
  const send = useMutation({
    mutationFn: () => syncRuntime.sendTwoFactorEmail(serverUrl, challenge),
    onSuccess: () => setEmailed(true),
  });
  // Emailing is the only way in for this method, so it goes out when the method opens.
  const sent = useRef(false);
  useEffect(() => {
    if (method !== "email" || sent.current) return;
    sent.current = true;
    send.mutate();
  }, [method, send]);
  const verify = useMutation({
    mutationFn: () =>
      syncRuntime.completeTwoFactor(
        serverUrl,
        challenge,
        method,
        cleanTwoFactorCode(method, code),
        options,
      ),
    onSuccess: onDone,
  });
  const labels = twoFactorMethodLabels[method];
  const others = methods.filter((other) => other !== method);
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (cleanTwoFactorCode(method, code)) verify.mutate();
      }}
    >
      <FormField label={labels.code} htmlFor={id} required hint={labels.hint}>
        <IconInput
          icon={IconShieldLock}
          id={id}
          placeholder={labels.code}
          autoFocus
          autoComplete="one-time-code"
          autoCapitalize="none"
          inputMode={method === "backup" ? "text" : "numeric"}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </FormField>
      <FieldError message={verify.error?.message ?? (send.error ? send.error.message : null)} />
      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" className="w-full" disabled={verify.isPending || !code.trim()}>
          <StatusButtonContent
            status={statusOf(verify)}
            label="Verify"
            successLabel="Signed in"
            errorLabel="Couldn't sign in"
          />
        </Button>
        {method === "email" && emailed ? (
          <Button
            type="button"
            size="sm"
            variant="linkMuted"
            className="self-center"
            disabled={send.isPending}
            onClick={() => send.mutate()}
          >
            Send Another Code
          </Button>
        ) : null}
        {others.map((other) => (
          <Button
            key={other}
            type="button"
            size="sm"
            variant="linkMuted"
            className="self-center"
            onClick={() => {
              setMethod(other);
              setCode("");
              verify.reset();
            }}
          >
            {twoFactorMethodLabels[other].switchTo}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" className="self-center" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
