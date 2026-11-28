import {
  SECURITY_STEPS,
  type SecurityAction,
  type SecurityOutcome,
  type SecuritySummary,
  errorToShow,
  isWrongCode,
  runSecurityAction,
} from "@nookly/shared/api";
import { IconCopy, IconDeviceMobile, IconKey, IconMail } from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { useAppData, useSyncState } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { useClipboard } from "../ui/clipboard.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { GroupedSection } from "../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { ListRow } from "../ui/kit/ListRow.tsx";
import { useDeviceWord } from "../ui/device-word.ts";
import { SHEET_TURN } from "../ui/motion.ts";
import { OtpField } from "../ui/OtpField.tsx";
import { QrImage } from "../ui/QrImage.tsx";
import { useOptionalSheetHost, useSheetHostBusy } from "../ui/sheet/SheetHost.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { useAccount, useAccountChange } from "./account-change.ts";
import { RecheckPrompt } from "./RecheckPrompt.tsx";
import { DeleteAccountSheet } from "./DeleteAccountSheet.tsx";
import { useSecurityGate } from "./security-gate-store.ts";
import { SignOutSheet } from "./SignOutSheet.tsx";

/// Two-factor sign in, in a sheet: what the account has, and a step for each change. The
/// steps go onto the same sheet with a back button. While the account owes it there is no way
/// past the sheet but setting it up, signing out or deleting the account.

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

/// What a change does, then the change. Whether the person has to confirm it is them is the
/// server's to say.
function ConfirmStep({ action, setup }: { action: SecurityAction; setup: boolean }) {
  const sheet = useSheet();
  const account = useAccount();
  const changed = useChanged();
  const run = useAccountChange(
    () => runSecurityAction(account(), action),
    (next) => {
      if (next.name === "overview") return sheet?.back();
      if (next.name === "codes") useSecurityGate.getState().holdCodes(null);
      showOutcome(sheet, next, changed, setup);
    },
  );
  const failed = errorToShow(run.error);
  return (
    <View className="gap-3">
      <Text tone="muted">{SECURITY_STEPS[action].text}</Text>
      {failed ? <Text tone="destructive">{failed}</Text> : null}
      <Button
        size="lg"
        label="Continue"
        status={statusOf(run)}
        successLabel="Done"
        errorLabel="Couldn't continue"
        onPress={() => run.mutate()}
      />
      <RecheckPrompt />
    </View>
  );
}

type Sheet = NonNullable<ReturnType<typeof useSheet>>;

/// A step that follows one that unlocked something: the key to scan, or the codes made.
function showOutcome(
  sheet: Sheet | null,
  outcome: Exclude<SecurityOutcome, { name: "overview" }>,
  changed: () => Promise<void>,
  setup: boolean,
) {
  if (!sheet) return;
  if (outcome.name === "scan") {
    sheet.push({
      title: "Add an authenticator app",
      content: <ScanStep uri={outcome.uri} keyText={outcome.key} setup={setup} />,
    });
  } else {
    sheet.push({
      title: "Recovery codes",
      content: <CodesStep codes={outcome.codes} onDone={changed} />,
    });
  }
}

function ScanStep({ uri, keyText, setup }: { uri: string; keyText: string; setup: boolean }) {
  const theme = useTheme();
  const clipboard = useClipboard();
  const sheet = useSheet();
  const account = useAccount();
  const changed = useChanged();
  const [code, setCode] = useState("");
  const confirm = useMutation({
    mutationFn: (digits: string) => account().confirmAuthenticator(digits),
    onSuccess: async (codes) => {
      // While it is being set up the list comes back, to add another way or go on; the codes
      // wait for Continue. From Settings they are shown at once.
      if (!setup && codes.length > 0)
        return showOutcome(sheet, { name: "codes", codes }, changed, setup);
      if (codes.length > 0) useSecurityGate.getState().holdCodes(codes);
      await changed();
      sheet?.back();
      sheet?.back();
    },
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
      <View className="flex-row items-center justify-center gap-1">
        <Text selectable className="shrink font-mono tracking-wider">
          {keyText.replace(/\s/g, " ")}
        </Text>
        <IconButton
          label="Copy key"
          size="iconSm"
          icon={<IconCopy size={18} color={theme.colors.mutedForeground} />}
          onPress={() => void clipboard.copy(keyText)}
        />
      </View>
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
        once if you can't use your other ways to sign in. They are not shown again.
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
  const [email, setEmail] = useState("");
  const add = useAccountChange(
    () => account().addEmail(email),
    () => sheet?.back(),
  );
  const failed = errorToShow(add.error);
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
      {failed ? <Text tone="destructive">{failed}</Text> : null}
      <Button
        size="lg"
        label="Send Confirmation"
        disabled={!email.trim()}
        status={statusOf(add)}
        successLabel="Sent"
        errorLabel="Couldn't send"
        onPress={() => add.mutate()}
      />
      <RecheckPrompt />
    </View>
  );
}

function useConfirmStep(setup: boolean) {
  const sheet = useSheet();
  return (action: SecurityAction) =>
    sheet?.push({
      title: SECURITY_STEPS[action].title,
      content: <ConfirmStep action={action} setup={setup} />,
    });
}

function MethodRows({ summary, setup }: { summary: SecuritySummary; setup: boolean }) {
  const sheet = useSheet();
  const ask = useConfirmStep(setup);
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
            email.address && email.confirmed ? `A code sent to ${email.address}.` : undefined
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
      {summary.enabled && !setup ? (
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

/// What the sheet shows first. `setup` while the account owes two-factor, or did when the
/// sheet came up.
function SecuritySheet({ setup }: { setup: boolean }) {
  const sheet = useSheet();
  const device = useDeviceWord();
  const account = useAccount();
  const changed = useChanged();
  const owed = useSyncState((state) => state.twoFactorPending);
  const { data: summary, error } = useQuery({
    queryKey: keys.sync.security,
    queryFn: () => account().security(),
  });
  const rows: ReactNode =
    summary && !summary.available ? (
      <Text tone="muted">
        Your server offers two-factor sign in only for accounts with a password.
      </Text>
    ) : summary ? (
      <MethodRows summary={summary} setup={setup} />
    ) : null;
  return (
    <View className="gap-4">
      <Text tone="muted">
        {owed
          ? "Sign in needs a second step. Sync starts once it is set up."
          : setup
            ? "Add another way to sign in, or continue."
            : "A second step when you sign in keeps your account safe even if a password leaks."}
      </Text>
      {error ? <Text tone="destructive">{error.message}</Text> : null}
      {rows}
      {setup && summary?.enabled ? (
        <Button
          size="lg"
          label="Continue"
          onPress={() => {
            const pending = useSecurityGate.getState().pendingCodes;
            if (pending) {
              sheet?.push({
                title: "Recovery codes",
                content: <CodesStep codes={pending} onDone={changed} />,
              });
            } else {
              sheet?.push({
                title: SECURITY_STEPS.newCodes.title,
                content: <ConfirmStep action="newCodes" setup />,
              });
            }
          }}
        />
      ) : null}
      {setup ? null : <Button variant="ghost" label="Done" onPress={() => sheet?.close()} />}
      {owed ? (
        <Button
          variant="warning"
          label="Sign Out"
          onPress={() =>
            sheet?.push({
              title: `Sign out of this ${device}?`,
              content: <SignOutSheet keepByDefault />,
            })
          }
        />
      ) : null}
      {owed ? (
        <Button
          variant="destructiveGhost"
          label="Delete Account"
          onPress={() => sheet?.push({ title: "Delete Account", content: <DeleteAccountSheet /> })}
        />
      ) : null}
    </View>
  );
}

function presented(owed: boolean) {
  return {
    title: owed ? "Set up two-factor sign in" : "Two-factor sign in",
    // No way past it but going on, signing out or deleting the account.
    locked: owed,
    content: <SecuritySheet setup={owed} />,
  };
}

/// Opens the sheet from Settings.
export function useOpenSecurity() {
  const host = useOptionalSheetHost();
  const owed = useSyncState((state) => state.twoFactorPending);
  return () => {
    useSecurityGate.getState().reset();
    host?.present(presented(owed));
  };
}

/// Rises while the server requires two-factor of this account and it has none, and stays
/// until it is set up or the account is signed out or deleted. A sheet that is up, or goes up at the
/// same moment (a new account's username, the terms), goes first. Mounted once, inside the
/// sheet host.
export function SecurityGate() {
  const host = useOptionalSheetHost();
  const busy = useSheetHostBusy();
  const owed = useSyncState((state) => state.twoFactorPending);
  useEffect(() => {
    if (!owed || busy) return;
    const turn = setTimeout(() => host?.present(presented(true)), SHEET_TURN);
    return () => clearTimeout(turn);
  }, [owed, busy, host]);
  return null;
}
