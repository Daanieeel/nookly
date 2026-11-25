import {
  type TwoFactorMethod,
  type User,
  cleanTwoFactorCode,
  firstTwoFactorMethod,
  isWrongCode,
  twoFactorMethodLabels,
} from "@nookly/shared/api";
import { IconShieldLock } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
import { Button } from "@nookly/ui/components/button";
import { IconInput } from "@nookly/ui/components/icon-input";
import { OtpCodeInput } from "@nookly/ui/components/input-otp";

const CODE_LENGTH = 6;

/// A second step: a code from the authenticator app, one emailed to the account, or a
/// recovery code. Signing in and confirming it is you both ask for it.
export function SecondStepForm({
  methods,
  send: sendCode,
  verify: verifyCode,
  onDone,
  onBack,
  successLabel,
  errorLabel,
}: {
  methods: TwoFactorMethod[];
  /// Emails a code, for the `email` method.
  send: () => Promise<void>;
  verify: (method: TwoFactorMethod, code: string) => Promise<User | void>;
  onDone: () => void;
  onBack: () => void;
  successLabel: string;
  errorLabel: string;
}) {
  const id = useId();
  const [method, setMethod] = useState<TwoFactorMethod>(() => firstTwoFactorMethod(methods));
  const [code, setCode] = useState("");
  const [emailed, setEmailed] = useState(false);
  const send = useMutation({ mutationFn: sendCode, onSuccess: () => setEmailed(true) });
  // Emailing is the only way in for this method, so it goes out when the method opens.
  const sent = useRef(false);
  useEffect(() => {
    if (method !== "email" || sent.current) return;
    sent.current = true;
    send.mutate();
  }, [method, send]);
  const verify = useMutation({
    mutationFn: (typed: string) => verifyCode(method, cleanTwoFactorCode(method, typed)),
    onSuccess: onDone,
    // A wrong code is cleared so the next one starts from the first box.
    onError: () => setCode(""),
  });
  const labels = twoFactorMethodLabels[method];
  const others = methods.filter((other) => other !== method);
  // A recovery code is letters and a dash; the other two are six digits, one box each.
  const boxes = method !== "backup";
  const ready = boxes ? code.length === CODE_LENGTH : cleanTwoFactorCode(method, code) !== "";
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) verify.mutate(code);
      }}
    >
      {boxes ? (
        // The boxes say what they are for; only the hint is written, centered under them.
        <div className="flex flex-col items-center gap-2">
          <OtpCodeInput
            id={id}
            aria-label={labels.code}
            length={CODE_LENGTH}
            autoFocus
            value={code}
            onChange={(next) => {
              setCode(next);
              if (verify.isError) verify.reset();
            }}
            onComplete={(digits) => verify.mutate(digits)}
            disabled={verify.isPending}
            invalid={verify.isError}
          />
          <p className="text-center text-xs text-muted-foreground">{labels.hint}</p>
        </div>
      ) : (
        <FormField label={labels.code} htmlFor={id} required hint={labels.hint}>
          <IconInput
            icon={IconShieldLock}
            id={id}
            placeholder={labels.code}
            autoFocus
            autoComplete="one-time-code"
            autoCapitalize="none"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </FormField>
      )}
      {/* A wrong code in the boxes is shown by their red edge; a recovery code, and anything
          else, is said. */}
      <FieldError
        message={
          (verify.error && !(boxes && isWrongCode(verify.error)) ? verify.error.message : null) ??
          (send.error ? send.error.message : null)
        }
      />
      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" className="w-full" disabled={verify.isPending || !ready}>
          <StatusButtonContent
            status={statusOf(verify)}
            label="Verify"
            successLabel={successLabel}
            errorLabel={errorLabel}
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
