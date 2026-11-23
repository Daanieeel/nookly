import {
  SECURITY_STEPS,
  type SecurityAction,
  type SecurityOutcome,
  type SecuritySummary,
  isWrongCode,
  runSecurityAction,
} from "@nookly/shared/api";
import { IconDeviceMobile, IconKey, IconMail, IconShieldLock } from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAppData, useSyncState } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { BlurredSecret } from "../ui/BlurredSecret.tsx";
import { useClipboard } from "../ui/clipboard.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { GroupedSection } from "../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { ListRow } from "../ui/kit/ListRow.tsx";
import { OtpField } from "../ui/OtpField.tsx";
import { QrImage } from "../ui/QrImage.tsx";
import { useOptionalSheetHost } from "../ui/sheet/SheetHost.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useSecurityGate } from "./security-gate-store.ts";

/// Two-factor sign in, in a sheet: what the account has, and a step for each change. The
/// steps go onto the same sheet with a back button.

function useAccount() {
  const { sync } = useAppData();
  return () => {
    const api = sync.account();
    if (!api) throw new Error("Sign in first.");
    return api;
  };
}

/// What a change made to the account: what is shown is read again, and sync, which waits
/// for an account that owes two-factor, starts.
function useChanged() {
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: keys.sync.security });
    await sync.twoFactorChanged().catch(() => {});
  };
}

function PasswordStep({ action }: { action: SecurityAction }) {
  const sheet = useSheet();
  const account = useAccount();
  const changed = useChanged();
  const [password, setPassword] = useState("");
  const run = useMutation({
    mutationFn: () => runSecurityAction(account(), action, password),
    onSuccess: async (next) => {
      if (next.name === "overview") {
        await changed();
        sheet?.back();
      } else showOutcome(sheet, next, changed);
    },
  });
  return (
    <View className="gap-3">
      <Text tone="muted">{SECURITY_STEPS[action].text}</Text>
      <Field
        label="Password"
        icon={<FieldIcon icon={IconShieldLock} />}
        showName
        placeholder="Password"
        required
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        editable={!run.isPending}
        value={password}
        onChangeText={setPassword}
      />
      {run.error ? <Text tone="destructive">{run.error.message}</Text> : null}
      <Button
        size="lg"
        label="Continue"
        disabled={!password}
        status={statusOf(run)}
        successLabel="Done"
        errorLabel="Couldn't continue"
        onPress={() => run.mutate()}
      />
    </View>
  );
}

type Sheet = NonNullable<ReturnType<typeof useSheet>>;

/// A step that follows one that unlocked something: the key to scan, or the codes made.
function showOutcome(
  sheet: Sheet | null,
  outcome: Exclude<SecurityOutcome, { name: "overview" }>,
  changed: () => Promise<void>,
) {
  if (!sheet) return;
  if (outcome.name === "scan") {
    sheet.push({
      title: "Add an authenticator app",
      content: <ScanStep uri={outcome.uri} keyText={outcome.key} />,
    });
  } else {
    sheet.push({
      title: "Recovery codes",
      content: <CodesStep codes={outcome.codes} onDone={changed} />,
    });
  }
}

function ScanStep({ uri, keyText }: { uri: string; keyText: string }) {
  const sheet = useSheet();
  const account = useAccount();
  const changed = useChanged();
  const [code, setCode] = useState("");
  const confirm = useMutation({
    mutationFn: (digits: string) => account().confirmAuthenticator(digits),
    onSuccess: (codes) => showOutcome(sheet, { name: "codes", codes }, changed),
    // A wrong code is cleared so the next one starts from the first box.
    onError: () => setCode(""),
  });
  return (
    <View className="gap-4">
      <View className="items-center gap-3">
        <Text tone="muted">Scan it with your authenticator app.</Text>
        <QrImage text={uri} label="QR code for your authenticator app" size={232} />
      </View>
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <Text tone="muted" variant="small">
          or set up manually
        </Text>
        <View className="h-px flex-1 bg-border" />
      </View>
      <BlurredSecret value={keyText.replace(/\s/g, " ")} label="key" />
      <OtpField
        label="Code from the app"
        value={code}
        editable={!confirm.isPending}
        invalid={confirm.isError}
        onChange={(next) => {
          setCode(next);
          if (confirm.isError) confirm.reset();
        }}
        onComplete={(digits) => confirm.mutate(digits)}
      />
      {/* A wrong code is shown by the red boxes; anything else is said. */}
      {confirm.error && !isWrongCode(confirm.error) ? (
        <Text tone="destructive">{confirm.error.message}</Text>
      ) : null}
      <Button
        size="lg"
        label="Turn On"
        disabled={code.length !== 6}
        status={statusOf(confirm)}
        successLabel="Turned on"
        errorLabel="Wrong code"
        onPress={() => confirm.mutate(code)}
      />
    </View>
  );
}

/// The recovery codes, shown once.
function CodesStep({ codes, onDone }: { codes: string[]; onDone: () => Promise<void> }) {
  const sheet = useSheet();
  const clipboard = useClipboard();
  return (
    <View className="gap-3">
      <Text tone="muted">
        Save these recovery codes somewhere safe, like a password manager. Each one signs you in
        once if you lose your authenticator app. They are not shown again.
      </Text>
      <View accessibilityLabel="Recovery codes" className="gap-1">
        {codes.map((code) => (
          <Text key={code} selectable>
            {code}
          </Text>
        ))}
      </View>
      <Button
        variant="ghost"
        label="Copy Codes"
        onPress={() => void clipboard.copy(codes.join("\n"))}
      />
      <Button
        size="lg"
        label="I Saved Them"
        onPress={() => {
          void onDone();
          sheet?.close();
        }}
      />
    </View>
  );
}

/// An account made without an email can't have codes emailed: it adds one, and confirms it.
function AddEmailStep() {
  const sheet = useSheet();
  const account = useAccount();
  const changed = useChanged();
  const [email, setEmail] = useState("");
  const add = useMutation({
    mutationFn: () => account().addEmail(email),
    onSuccess: async () => {
      await changed();
      sheet?.back();
    },
  });
  return (
    <View className="gap-3">
      <Text tone="muted">
        We send a link to confirm the address. Once it is confirmed, codes can be emailed to it.
      </Text>
      <Field
        label="Email"
        icon={<FieldIcon icon={IconMail} />}
        showName
        placeholder="Email"
        required
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        editable={!add.isPending}
        value={email}
        onChangeText={setEmail}
      />
      {add.error ? <Text tone="destructive">{add.error.message}</Text> : null}
      <Button
        size="lg"
        label="Send Confirmation"
        disabled={!email.trim()}
        status={statusOf(add)}
        successLabel="Sent"
        errorLabel="Couldn't send"
        onPress={() => add.mutate()}
      />
    </View>
  );
}

function usePasswordStep() {
  const sheet = useSheet();
  return (action: SecurityAction) =>
    sheet?.push({ title: SECURITY_STEPS[action].title, content: <PasswordStep action={action} /> });
}

function MethodRows({ summary }: { summary: SecuritySummary }) {
  const sheet = useSheet();
  const ask = usePasswordStep();
  const account = useAccount();
  const resend = useMutation({
    mutationFn: async () => {
      if (summary.email.address) await account().resendVerification(summary.email.address);
    },
  });
  const email = summary.email;
  return (
    <>
      <GroupedSection margin={0}>
        <ListRow
          badge={<IconBadge glyph={IconMail} tint="blue" />}
          title="Emailed codes"
          subtitle={
            email.address
              ? email.confirmed
                ? `A code sent to ${email.address}.`
                : `Confirm ${email.address} first.`
              : undefined
          }
          detail={email.enabled ? "On" : undefined}
          accessibilityLabel={
            email.enabled
              ? "Turn Off Emailed Codes"
              : email.possible
                ? "Turn On Emailed Codes"
                : email.address
                  ? "Send Confirmation Link"
                  : "Add an Email Address"
          }
          onPress={() => {
            if (email.enabled) ask("emailOff");
            else if (email.possible) ask("emailOn");
            else if (email.address) resend.mutate();
            else sheet?.push({ title: "Add an email address", content: <AddEmailStep /> });
          }}
        />
      </GroupedSection>
      <GroupedSection margin={0}>
        <ListRow
          badge={<IconBadge glyph={IconDeviceMobile} tint="green" />}
          title="Authenticator app"
          detail={summary.authenticator.enabled ? "On" : undefined}
          accessibilityLabel={
            summary.authenticator.enabled ? "Remove Authenticator App" : "Set Up Authenticator App"
          }
          onPress={() =>
            ask(summary.authenticator.enabled ? "authenticatorOff" : "authenticatorOn")
          }
        />
      </GroupedSection>
      {summary.enabled ? (
        <GroupedSection margin={0}>
          <ListRow
            badge={<IconBadge glyph={IconKey} tint="orange" />}
            title="Recovery codes"
            subtitle={
              summary.backupCodesLeft === 1
                ? "1 code left."
                : `${summary.backupCodesLeft} codes left.`
            }
            accessibilityLabel="Get New Codes"
            accessory="chevron"
            onPress={() => ask("newCodes")}
          />
        </GroupedSection>
      ) : null}
    </>
  );
}

/// What the sheet shows first.
function SecuritySheet({ required }: { required: boolean }) {
  const sheet = useSheet();
  const account = useAccount();
  const { data: summary, error } = useQuery({
    queryKey: keys.sync.security,
    queryFn: () => account().security(),
  });
  const rows: ReactNode =
    summary && !summary.available ? (
      <Text tone="muted">
        Your account signs in with another account, so it has no password to protect. Nothing to set
        up here.
      </Text>
    ) : summary ? (
      <MethodRows summary={summary} />
    ) : null;
  return (
    <View className="gap-4">
      <Text tone="muted">
        {required
          ? "Sign in needs a second step. Sync starts once it is set up."
          : "A second step after your password keeps your account safe even if the password leaks."}
      </Text>
      {error ? <Text tone="destructive">{error.message}</Text> : null}
      {rows}
      <Button
        variant="ghost"
        label={
          required
            ? summary?.enabled && !summary.authenticator.enabled
              ? "Proceed Without Authenticator"
              : "Later"
            : "Done"
        }
        onPress={() => {
          if (required) useSecurityGate.getState().dismiss();
          sheet?.close();
        }}
      />
    </View>
  );
}

/// Opens the sheet from Settings.
export function useOpenSecurity() {
  const host = useOptionalSheetHost();
  const required = useSyncState((state) => state.twoFactorPending);
  return () => {
    useSecurityGate.getState().reset();
    host?.present({
      title: required ? "Set up two-factor sign in" : "Two-factor sign in",
      content: <SecuritySheet required={required} />,
    });
  };
}

/// Rises when the server requires two-factor of this account and it has none, until it is
/// set up or put off. Mounted once, inside the sheet host.
export function SecurityGate() {
  const host = useOptionalSheetHost();
  const owed = useSyncState((state) => state.twoFactorPending);
  const dismissed = useSecurityGate((state) => state.dismissed);
  const shown = useRef(false);
  useEffect(() => {
    if (!owed) {
      shown.current = false;
      return;
    }
    if (dismissed || shown.current) return;
    shown.current = true;
    host?.present({
      title: "Set up two-factor sign in",
      content: <SecuritySheet required />,
    });
  }, [owed, dismissed, host]);
  return null;
}
