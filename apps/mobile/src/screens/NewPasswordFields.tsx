import { checkNewPassword } from "@nookly/shared/api";
import { IconLock } from "@tabler/icons-react-native";
import { useState } from "react";
import { useSyncState } from "../data/context.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { PasswordStrengthMeter } from "../ui/PasswordStrengthMeter.tsx";

/// A new password, typed twice and rated. What is wrong with it shows once it was sent.
export function useNewPassword() {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const { password, problems } = checkNewPassword(next, confirm);
  return {
    next,
    confirm,
    setNext,
    setConfirm,
    problems: sent ? problems : {},
    /// The password when both entries are right, and null after saying what is not.
    submit(): string | null {
      setSent(true);
      return password;
    },
  };
}

export function NewPasswordFields({ password }: { password: ReturnType<typeof useNewPassword> }) {
  const user = useSyncState((state) => state.user);
  return (
    <>
      <Field
        label="New password"
        icon={<FieldIcon icon={IconLock} />}
        placeholder="New password"
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        value={password.next}
        onChangeText={password.setNext}
        error={password.problems.next}
      />
      <Field
        label="Repeat new password"
        icon={<FieldIcon icon={IconLock} />}
        placeholder="Repeat new password"
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        value={password.confirm}
        onChangeText={password.setConfirm}
        error={password.problems.confirm}
      />
      <PasswordStrengthMeter
        password={password.next}
        userInputs={[user?.username, user?.email].filter((v): v is string => !!v)}
      />
    </>
  );
}
