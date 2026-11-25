import { newPasswordSchema } from "@nookly/shared/api";
import { useId, useState } from "react";
import { FieldError } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
import { PasswordInput } from "#/components/password-input.tsx";
import { PasswordStrengthMeter } from "#/components/password-strength-meter.tsx";
import { useSyncState } from "./sync-instance.ts";

/// A new password, typed twice and rated. What is wrong with it shows once it was sent.
export function useNewPassword() {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const parsed = newPasswordSchema.safeParse({ next, confirm });
  const problem = (field: "next" | "confirm") =>
    sent ? parsed.error?.issues.find((issue) => issue.path[0] === field)?.message : undefined;
  return {
    next,
    confirm,
    setNext,
    setConfirm,
    problem,
    /// The password when both entries are right, and null after saying what is not.
    submit(): string | null {
      setSent(true);
      return parsed.success ? parsed.data.next : null;
    },
  };
}

export function NewPasswordFields({ password }: { password: ReturnType<typeof useNewPassword> }) {
  const id = useId();
  const user = useSyncState((state) => state.user);
  return (
    <>
      <FormField label="New password" htmlFor={id} error={password.problem("next")}>
        <PasswordInput
          id={id}
          placeholder="New password"
          autoComplete="new-password"
          value={password.next}
          onChange={(event) => password.setNext(event.target.value)}
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <PasswordInput
          aria-label="Repeat new password"
          placeholder="Repeat new password"
          aria-invalid={password.problem("confirm") !== undefined}
          autoComplete="new-password"
          value={password.confirm}
          onChange={(event) => password.setConfirm(event.target.value)}
        />
        <FieldError message={password.problem("confirm")} />
      </div>
      <PasswordStrengthMeter
        password={password.next}
        userInputs={[user?.username, user?.email].filter((v): v is string => !!v)}
      />
    </>
  );
}
