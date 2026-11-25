import { EMAIL_CHANGE_COPY, codeSentText, emailSchema, errorToShow } from "@nookly/shared/api";
import { IconDeviceMobile, IconLogout, IconMail } from "@tabler/icons-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useAppData } from "../../data/context.tsx";
import { Button, statusOf } from "../../ui/Button.tsx";
import { useDeviceWord } from "../../ui/device-word.ts";
import { Field } from "../../ui/Field.tsx";
import { FieldIcon } from "../../ui/FieldIcon.tsx";
import { OtpField } from "../../ui/OtpField.tsx";
import { ConfirmButtons, Points } from "../../ui/sheet/Confirm.tsx";
import { useSheet } from "../../ui/sheet/Sheet.tsx";
import { Text } from "../../ui/Text.tsx";
import { useAccount, useAccountChange } from "../account-change.ts";
import { NewPasswordFields, useNewPassword } from "../NewPasswordFields.tsx";
import { RecheckPrompt } from "../RecheckPrompt.tsx";

const CODE_LENGTH = 6;

/// A new address for a way of signing in, confirmed with the code sent to it. With `add`,
/// it is how Nookly Signin is added: its address, the code, and a password.
export function EmailSheet({ provider, add }: { provider: string; add: boolean }) {
  const sheet = useSheet();
  const account = useAccount();
  const [email, setEmail] = useState("");
  // The address the code went to; null while it is being typed.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const password = useNewPassword();
  const valid = emailSchema.safeParse(email.trim());
  const send = useAccountChange(
    (address: string) => account().sendEmailCode(provider, address),
    (_, address) => setSentTo(address),
  );
  const save = useAccountChange(
    (input: { email: string; password: string | null }) =>
      input.password === null
        ? account().changeEmail(provider, input.email, code)
        : account().addPassword(input.email, code, input.password),
    () => sheet?.close(),
  );
  const copy = EMAIL_CHANGE_COPY[add ? "add" : "change"];
  const submit = () => {
    if (sentTo === null) return;
    const chosen = add ? password.submit() : null;
    if (add && chosen === null) return;
    save.mutate({ email: sentTo, password: chosen });
  };
  const failed = errorToShow(send.error) ?? errorToShow(save.error);
  return (
    <View className="gap-3">
      <Text tone="muted">{copy.text}</Text>
      {sentTo === null ? (
        <Field
          label="Email"
          icon={<FieldIcon icon={IconMail} />}
          showName
          placeholder="ada@example.com"
          required
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          editable={!send.isPending}
          value={email}
          onChangeText={setEmail}
        />
      ) : (
        <>
          <OtpField
            label="Code from the email"
            autoFocus
            value={code}
            editable={!save.isPending}
            invalid={save.isError}
            onChange={(next) => {
              setCode(next);
              if (save.isError) save.reset();
            }}
          />
          <Text variant="small" tone="muted" className="text-center">
            {codeSentText(sentTo)}
          </Text>
          {add ? <NewPasswordFields password={password} /> : null}
        </>
      )}
      {failed ? <Text tone="destructive">{failed}</Text> : null}
      {sentTo === null ? (
        <Button
          size="lg"
          label="Send Code"
          disabled={!valid.success}
          status={statusOf(send)}
          successLabel="Sent"
          errorLabel="Couldn't send"
          onPress={() => valid.success && send.mutate(valid.data)}
        />
      ) : (
        <>
          <Button
            size="lg"
            label={copy.title}
            disabled={code.length !== CODE_LENGTH}
            status={statusOf(save)}
            successLabel="Saved"
            errorLabel="Couldn't save"
            onPress={submit}
          />
          <Button
            variant="ghost"
            label="Back"
            onPress={() => {
              setSentTo(null);
              setCode("");
              save.reset();
              send.reset();
            }}
          />
        </>
      )}
      <RecheckPrompt />
    </View>
  );
}

/// A new password for Nookly Signin. The old one isn't asked for: confirming it is you
/// covers that.
export function PasswordSheet() {
  const sheet = useSheet();
  const account = useAccount();
  const password = useNewPassword();
  const change = useAccountChange(
    (next: string) => account().setPassword(next),
    () => sheet?.close(),
  );
  const failed = errorToShow(change.error);
  return (
    <View className="gap-3">
      <NewPasswordFields password={password} />
      {failed ? <Text tone="destructive">{failed}</Text> : null}
      <Button
        size="lg"
        label="Change Password"
        status={statusOf(change)}
        successLabel="Changed"
        errorLabel="Couldn't change it"
        onPress={() => {
          const next = password.submit();
          if (next !== null) change.mutate(next);
        }}
      />
      <RecheckPrompt />
    </View>
  );
}

/// Disconnecting a provider: what that does, said before it happens. It stays up until it is
/// done, or says why it failed.
export function DisconnectSheet({ provider, current }: { provider: string; current: boolean }) {
  const sheet = useSheet();
  const device = useDeviceWord();
  const { sync } = useAppData();
  const drop = useAccountChange(
    () => sync.disconnectProvider(provider),
    () => sheet?.close(),
  );
  const failed = errorToShow(drop.error);
  return (
    <View className="gap-5">
      <Points
        points={[
          { icon: IconLogout, text: "Devices that signed in with it are signed out" },
          ...(current
            ? [
                {
                  icon: IconDeviceMobile,
                  text: `This ${device} signs out too, and keeps your data`,
                },
              ]
            : []),
        ]}
      />
      {failed ? <Text tone="destructive">{failed}</Text> : null}
      <ConfirmButtons cancel="Keep It">
        <Button
          size="lg"
          variant="warning"
          label="Disconnect"
          status={statusOf(drop)}
          successLabel="Disconnected"
          errorLabel="Couldn't disconnect"
          onPress={() => drop.mutate()}
        />
      </ConfirmButtons>
      <RecheckPrompt />
    </View>
  );
}
