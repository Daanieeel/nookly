import {
  type TwoFactorMethod,
  type User,
  cleanTwoFactorCode,
  firstTwoFactorMethod,
  isWrongCode,
  twoFactorMethodLabels,
} from "@nookly/shared/api";
import { IconShieldLock } from "@tabler/icons-react-native";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { OtpField } from "../ui/OtpField.tsx";
import { Text } from "../ui/Text.tsx";

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
  const ready = boxes ? code.length === 6 : cleanTwoFactorCode(method, code) !== "";
  return (
    <View className="gap-3">
      {boxes ? (
        <OtpField
          key={method}
          autoFocus
          label={labels.code}
          value={code}
          editable={!verify.isPending}
          invalid={verify.isError}
          onChange={(next) => {
            setCode(next);
            if (verify.isError) verify.reset();
          }}
          onComplete={(digits) => verify.mutate(digits)}
        />
      ) : (
        <Field
          label={labels.code}
          icon={<FieldIcon icon={IconShieldLock} />}
          showName
          placeholder={labels.code}
          required
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          editable={!verify.isPending}
          value={code}
          onChangeText={setCode}
        />
      )}
      <Text tone="muted" variant="small">
        {labels.hint}
      </Text>
      {verify.error && !(boxes && isWrongCode(verify.error)) ? (
        <Text tone="destructive">{verify.error.message}</Text>
      ) : null}
      {send.error ? <Text tone="destructive">{send.error.message}</Text> : null}
      <Button
        label="Verify"
        size="lg"
        disabled={!ready}
        status={statusOf(verify)}
        successLabel={successLabel}
        errorLabel={errorLabel}
        onPress={() => verify.mutate(code)}
      />
      {method === "email" && emailed ? (
        <Button
          variant="ghost"
          label="Send Another Code"
          disabled={send.isPending}
          onPress={() => send.mutate()}
        />
      ) : null}
      {others.map((other) => (
        <Button
          key={other}
          variant="ghost"
          label={twoFactorMethodLabels[other].switchTo}
          onPress={() => {
            setMethod(other);
            setCode("");
            verify.reset();
          }}
        />
      ))}
      <Button variant="ghost" label="Back" onPress={onBack} />
    </View>
  );
}
