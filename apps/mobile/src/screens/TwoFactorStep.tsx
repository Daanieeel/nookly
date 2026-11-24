import {
  type TwoFactorMethod,
  cleanTwoFactorCode,
  firstTwoFactorMethod,
  isWrongCode,
  twoFactorMethodLabels,
} from "@nookly/shared/api";
import type { SignInOptions } from "@nookly/shared/sync";
import { IconShieldLock } from "@tabler/icons-react-native";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAppData } from "../data/context.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { OtpField } from "../ui/OtpField.tsx";
import { Text } from "../ui/Text.tsx";

/// The second step of signing in with a password: a code from the authenticator app, one
/// emailed to the account, or a recovery code. The password was right; the challenge stands
/// for it for ten minutes.
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
  options: SignInOptions;
  onDone: () => void;
  onBack: () => void;
}) {
  const { sync } = useAppData();
  const [method, setMethod] = useState<TwoFactorMethod>(() => firstTwoFactorMethod(methods));
  const [code, setCode] = useState("");
  const [emailed, setEmailed] = useState(false);
  const send = useMutation({
    mutationFn: () => sync.sendTwoFactorEmail(serverUrl, challenge),
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
    mutationFn: (typed: string) =>
      sync.completeTwoFactor(
        serverUrl,
        challenge,
        method,
        cleanTwoFactorCode(method, typed),
        options,
      ),
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
        successLabel="Signed in"
        errorLabel="Couldn't sign in"
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
