import { type Session, providerName } from "@nookly/shared/api";
import { type SyncStatus, filesDetail, heldLine } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCloudOff,
  IconCloudX,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDevices,
  IconLoader2,
  IconLock,
  IconLogout,
  IconServer,
  IconShieldLock,
  IconTrash,
  type Icon as TablerIcon,
} from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAppData, useSyncState } from "../../data/context.tsx";
import { keys } from "../../data/keys.ts";
import { Badge } from "../../ui/Badge.tsx";
import { Button, IconButton, statusOf } from "../../ui/Button.tsx";
import { useDeviceWord } from "../../ui/device-word.ts";
import { Field } from "../../ui/Field.tsx";
import { FieldIcon } from "../../ui/FieldIcon.tsx";
import { Section } from "../../ui/Row.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../../ui/kit/IconBadge.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { ListRow } from "../../ui/kit/ListRow.tsx";
import { Points } from "../../ui/sheet/Confirm.tsx";
import { useOptionalSheetHost } from "../../ui/sheet/SheetHost.tsx";
import { useOpenSecurity } from "../SecurityGate.tsx";
import { RecheckPrompt } from "../RecheckPrompt.tsx";
import { SignOutSheet } from "../SignOutSheet.tsx";
import { useTermsGate } from "../terms-gate-store.ts";
import { useSheet } from "../../ui/sheet/Sheet.tsx";
import { SPACE } from "../../ui/tokens.ts";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { ago } from "../dates.ts";
import {
  CardActions,
  CardDivider,
  CardFoot,
  CardHead,
  type CardTone,
  SettingsCard,
} from "./cards.tsx";
import { SignInMethods } from "./SignInMethods.tsx";

/// Settings, Account, as the desktop's cards: who is signed in and how sync is doing (with
/// the server and anything waiting for a decision), every device in one list, what is shared,
/// then how the account signs in and deleting it. Quiet: a line says nothing it need not.

interface StatusLine {
  icon: TablerIcon;
  text: string;
  tone: CardTone;
}

/// How sync is doing, in one line a person reads (the desktop's `statusLine`).
function statusLine(status: SyncStatus, place: string): StatusLine {
  switch (status.state) {
    case "syncing":
      return { icon: IconLoader2, text: "Syncing", tone: "busy" };
    case "offline":
      return {
        icon: IconCloudOff,
        text:
          status.pending > 0
            ? `Offline, ${status.pending} ${status.pending === 1 ? "change waits" : "changes wait"}`
            : "Offline",
        tone: "caution",
      };
    case "error":
      return { icon: IconAlertTriangle, text: status.error ?? "Sync failed", tone: "error" };
    case "off":
      return { icon: IconCloudOff, text: "Sync is off", tone: "idle" };
    case "idle":
      if (status.held > 0) {
        return {
          icon: IconAlertTriangle,
          text: heldLine(status.held, place),
          tone: "caution",
        };
      }
      if (!status.live) {
        return {
          icon: IconAlertTriangle,
          text: "Synced, but not live",
          tone: "caution",
        };
      }
      return {
        icon: IconCircleCheck,
        text: status.lastSyncedAt
          ? `Synced ${ago(new Date(status.lastSyncedAt).toISOString())}`
          : "Synced",
        tone: "ok",
      };
  }
}

/// How far the first sync of this phone is, or why it stopped. Nothing once it is done.
function FirstSyncLine() {
  const device = useDeviceWord();
  const migration = useSyncState((state) => state.migration);
  if (!migration || migration.phase === "done") return null;
  const text =
    migration.phase === "failed"
      ? (migration.error ?? "The first sync stopped.")
      : `Bringing this ${device} into your account: ${migration.itemsSent} of ${migration.items} items, ${filesDetail(migration)}.`;
  return (
    <CardFoot>
      <Text variant="small" tone={migration.phase === "failed" ? "destructive" : "muted"}>
        {text}
      </Text>
    </CardFoot>
  );
}

/// Files on their way up or down, and the last failure while some wait.
function FilesLine() {
  const files = useSyncState((state) => state.files);
  if (!files || (files.toUpload === 0 && files.toDownload === 0 && !files.lastError)) return null;
  const parts = [
    files.toUpload > 0 && `${files.toUpload} to send`,
    files.toDownload > 0 && `${files.toDownload} to download`,
  ].filter(Boolean);
  return (
    <CardFoot>
      <Text variant="small" tone="muted" className="flex-1">
        Files: {parts.join(", ") || "waiting"}.
        {files.lastError ? (
          <Text variant="small" tone="caution">{` Trying again: ${files.lastError}`}</Text>
        ) : null}
      </Text>
    </CardFoot>
  );
}

/// Changes two devices disagreed on: only there while some wait for a decision.
function ChangesNotice() {
  const router = useRouter();
  const count = useSyncState((s) => s.status.conflicts);
  if (count === 0) return null;
  return (
    <CardFoot>
      <Text variant="small" tone="caution" className="flex-1">
        {count === 1 ? "1 change needs a look" : `${count} changes need a look`}
      </Text>
      <Button
        size="sm"
        variant="secondary"
        label="Review Changes"
        onPress={() => router.push("/conflicts")}
      />
    </CardFoot>
  );
}

/// Why sync is not running while the terms wait for an answer, and the way back to them.
function TermsLine() {
  const device = useDeviceWord();
  const pending = useSyncState((s) => s.termsPending);
  if (!pending) return null;
  return (
    <CardFoot>
      <Text variant="small" tone="caution" className="flex-1" accessibilityRole="alert">
        Sync is paused on this {device} until you agree to the terms.
      </Text>
      <Button
        size="sm"
        variant="secondary"
        label="Review Terms"
        onPress={() => useTermsGate.getState().reopen()}
      />
    </CardFoot>
  );
}

/// Signed in: who, how sync is doing, and the way out.
function SignedInCard() {
  const device = useDeviceWord();
  const host = useOptionalSheetHost();
  const { sync } = useAppData();
  const user = useSyncState((s) => s.user);
  const status = useSyncState((s) => s.status);
  const serverUrl = useSyncState((s) => s.serverUrl);
  const theme = useTheme();
  const syncNow = useMutation({ mutationFn: () => sync.syncNow() });
  const resend = useMutation({
    mutationFn: async (email: string) => sync.account()?.resendVerification(email),
  });
  /// Signing out clears this phone unless a copy is kept: the sheet says what happens.
  const confirmSignOut = () =>
    host?.present({
      title: `Sign out of this ${device}?`,
      kind: "confirm",
      content: <SignOutSheet />,
    });
  if (!user) return null;
  const line = statusLine(status, `this ${device}`);
  return (
    <SettingsCard tone={line.tone}>
      <CardHead icon={line.icon} tone={line.tone} title={user.username} detail={line.text} />
      {user.email ? (
        <Text variant="small" tone="muted">
          {user.email}
        </Text>
      ) : null}
      <CardActions>
        <Button
          size="sm"
          variant="secondary"
          label="Sync Now"
          status={statusOf(syncNow)}
          successLabel="Synced"
          errorLabel="Couldn't sync"
          onPress={() => syncNow.mutate()}
        />
        <Button size="sm" variant="warning" label="Sign Out" onPress={confirmSignOut} />
      </CardActions>
      {user.email !== null && !user.emailVerified ? (
        <CardFoot>
          <Text variant="small" tone="caution" className="flex-1">
            Confirm {user.email} to reset a forgotten password.
          </Text>
          <Button
            size="sm"
            variant="ghost"
            label="Send Again"
            status={statusOf(resend)}
            successLabel="Sent"
            errorLabel="Couldn't send"
            onPress={() => user.email && resend.mutate(user.email)}
          />
        </CardFoot>
      ) : null}
      <TermsLine />
      <ChangesNotice />
      <FirstSyncLine />
      <FilesLine />
      {serverUrl ? (
        <CardFoot>
          <IconServer size={14} color={theme.colors.mutedForeground} />
          <Text variant="small" tone="muted" numberOfLines={1} className="flex-1">
            {serverUrl}
          </Text>
        </CardFoot>
      ) : null}
    </SettingsCard>
  );
}

/// Signed out: what an account is for, and the ways in.
function SignedOutCard() {
  const device = useDeviceWord();
  const router = useRouter();
  const reason = useSyncState((state) => state.signedOutReason);
  return (
    <SettingsCard tone={reason ? "caution" : "idle"}>
      <CardHead
        icon={reason ? IconAlertTriangle : IconCloudOff}
        tone={reason ? "caution" : "idle"}
        title="Not signed in"
        detail={reason ?? `Everything stays on this ${device}.`}
      />
      <CardActions>
        <Button size="sm" label="Sign In" onPress={() => router.push("/account/sign-in")} />
        <Button
          size="sm"
          variant="secondary"
          label="Create Account"
          onPress={() => router.push("/account/sign-up")}
        />
      </CardActions>
      <CardFoot>
        <Text variant="small" tone="muted" className="flex-1">
          Optional. Keeps all your devices the same.
        </Text>
      </CardFoot>
    </SettingsCard>
  );
}

/// The icon of a device, from what it says it is.
function deviceIcon(session: Session): TablerIcon {
  if (/ipad|tablet/i.test(session.deviceName)) return IconDeviceTablet;
  if (session.platform === "ios" || session.platform === "android") return IconDeviceMobile;
  if (["macos", "windows", "linux"].includes(session.platform)) return IconDeviceLaptop;
  return IconDevices;
}

function DeviceRow({ session }: { session: Session }) {
  const theme = useTheme();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: async () => sync.account()?.revokeSession(session.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.sync.sessions }),
  });
  const Icon = deviceIcon(session);
  const tint = session.current ? "blue" : "gray";
  return (
    <View style={{ gap: SPACE.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
        <IconBadge
          tint={tint}
          icon={
            <Icon
              size={18}
              color={session.current ? theme.colors.primary : theme.colors.mutedForeground}
            />
          }
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm }}
          >
            <Label weight="600" numberOfLines={1}>
              {session.deviceName}
            </Label>
            {session.current ? <Badge label="This device" variant="primary" /> : null}
          </View>
          {session.current ? null : (
            <Label type="subheadline" color="secondaryLabel">
              {`Active ${ago(session.lastUsedAt)}`}
            </Label>
          )}
        </View>
        {session.current ? null : (
          <IconButton
            label={`Sign Out ${session.deviceName}`}
            icon={<IconLogout size={18} color={theme.colors.mutedForeground} />}
            onPress={() => revoke.mutate()}
          />
        )}
      </View>
      {revoke.error ? <Text tone="destructive">{revoke.error.message}</Text> : null}
    </View>
  );
}

/// Every device signed in to the account, this one first, in one card.
function DeviceCards() {
  const device = useDeviceWord();
  const { sync } = useAppData();
  const { data: sessions = [] } = useQuery({
    queryKey: keys.sync.sessions,
    queryFn: async () => (await sync.account()?.sessions()) ?? [],
  });
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  if (ordered.length === 0) {
    return (
      <Text variant="small" tone="muted" className="px-1">
        Your devices show once this {device} reaches the server.
      </Text>
    );
  }
  return (
    <SettingsCard>
      <View accessibilityLabel="Signed in devices" style={{ gap: SPACE.md }}>
        {ordered.map((session, index) => (
          <View key={session.id} style={{ gap: SPACE.md }}>
            {index > 0 ? <CardDivider /> : null}
            <DeviceRow session={session} />
          </View>
        ))}
      </View>
    </SettingsCard>
  );
}

/// Deleting the account removes it and everything on the server. This phone keeps its data.
/// The sheet says so, and asks for the password: that is the confirmation. An account made
/// with another provider has none: it types a phrase, then signs in with that provider again.
const DELETE_PHRASE = "delete my account";

function DeleteAccountSheet() {
  const sheet = useSheet();
  const device = useDeviceWord();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const { data: account } = useQuery({
    queryKey: keys.sync.account,
    queryFn: async () => (await sync.account()?.me()) ?? null,
  });
  const hasPassword = account?.hasPassword !== false;
  const provider = hasPassword ? null : (account?.providers?.[0] ?? null);
  const remove = useMutation({
    mutationFn: async () => {
      // The provider vouches for the person before the account goes. Closing its browser is a
      // change of mind, not an error.
      if (provider && !(await sync.confirmWithProvider(provider))) return false;
      await sync.account()?.deleteAccount(hasPassword ? password : undefined);
      // The account is gone: what is on this phone is the only copy, and stays.
      await sync.detach();
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) {
        remove.reset();
        return;
      }
      queryClient.removeQueries({ queryKey: keys.sync.root });
      sheet?.close();
    },
  });
  return (
    <View className="gap-3">
      <Points
        points={[
          { icon: IconCloudX, text: "Removed from the server for good" },
          { icon: IconDeviceMobile, text: `This ${device} keeps its data` },
          ...(provider
            ? [
                {
                  icon: IconShieldLock,
                  text: `You sign in with ${providerName(provider)} once more`,
                },
              ]
            : []),
        ]}
      />
      {hasPassword ? (
        <Field
          label="Your password"
          icon={<FieldIcon icon={IconLock} />}
          placeholder="Your password"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
      ) : (
        <Field
          label="Type delete my account"
          icon={<FieldIcon icon={IconTrash} />}
          placeholder={DELETE_PHRASE}
          autoCapitalize="none"
          autoCorrect={false}
          value={phrase}
          onChangeText={setPhrase}
        />
      )}
      <Button
        size="lg"
        variant="destructive"
        label="Delete Account"
        disabled={hasPassword ? !password : phrase.trim().toLowerCase() !== DELETE_PHRASE}
        status={statusOf(remove)}
        errorLabel="Couldn't delete it"
        onPress={() => remove.mutate()}
      />
      {remove.error ? <Text tone="destructive">{remove.error.message}</Text> : null}
    </View>
  );
}

/// The way into two-factor sign in. A server that offers it to some accounts only shows
/// nothing for the others.
function SecurityRow() {
  const { sync } = useAppData();
  const open = useOpenSecurity();
  const { data } = useQuery({
    queryKey: keys.sync.security,
    queryFn: async () => (await sync.account()?.security()) ?? null,
  });
  if (!data?.available) return null;
  return (
    <GroupedSection margin={0}>
      <ListRow
        badge={<IconBadge glyph={IconShieldLock} tint="green" />}
        title="Two-factor sign in"
        detail={data.enabled ? "On" : "Off"}
        accessory="chevron"
        onPress={open}
      />
    </GroupedSection>
  );
}

/// The account's end: a row that opens what it takes in a sheet.
function DeleteRow() {
  const host = useOptionalSheetHost();
  return (
    <GroupedSection margin={0}>
      <ListRow
        badge={<IconBadge glyph={IconTrash} tint="red" />}
        title="Delete Account"
        destructive
        accessory="chevron"
        onPress={() => host?.present({ title: "Delete Account", content: <DeleteAccountSheet /> })}
      />
    </GroupedSection>
  );
}

/// The server this phone syncs with; changing it means signing out first.
function ServerLine() {
  const theme = useTheme();
  const serverUrl = useSyncState((s) => s.serverUrl);
  if (!serverUrl) return null;
  return (
    <View className="flex-row items-center gap-2">
      <IconServer size={14} color={theme.colors.mutedForeground} />
      <Text variant="small" tone="muted" numberOfLines={1} className="flex-1">
        {serverUrl}
      </Text>
    </View>
  );
}

/// Settings, Account.
export function AccountPage() {
  const signedIn = useSyncState((s) => s.user !== null);
  return (
    <Screen grouped>
      <Section title="Account">{signedIn ? <SignedInCard /> : <SignedOutCard />}</Section>
      {signedIn ? (
        <>
          <Section title="Sign in methods">
            <SignInMethods />
          </Section>
          <Section title="Security">
            <SecurityRow />
          </Section>
          <Section title="Devices">
            <DeviceCards />
          </Section>
          <Section title="Delete account">
            <DeleteRow />
          </Section>
        </>
      ) : (
        <ServerLine />
      )}
      {signedIn ? <RecheckPrompt /> : null}
    </Screen>
  );
}
