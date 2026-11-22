import { type ChangePassword, type Session, changePasswordSchema } from "@nookly/shared/api";
import type { SyncStatus } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCloudCheck,
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
  IconTrash,
  type Icon as TablerIcon,
} from "@tabler/icons-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { useAppData, useSyncState } from "../../data/context.tsx";
import { keys } from "../../data/keys.ts";
import { Badge } from "../../ui/Badge.tsx";
import { Button, IconButton, statusOf } from "../../ui/Button.tsx";
import { useDeviceWord } from "../../ui/device-word.ts";
import { Field } from "../../ui/Field.tsx";
import { FieldIcon } from "../../ui/FieldIcon.tsx";
import { Section } from "../../ui/Row.tsx";
import { PasswordStrengthMeter } from "../../ui/PasswordStrengthMeter.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../../ui/kit/IconBadge.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { ListRow } from "../../ui/kit/ListRow.tsx";
import { Points } from "../../ui/sheet/Confirm.tsx";
import { useOptionalSheetHost } from "../../ui/sheet/SheetHost.tsx";
import { useSheet } from "../../ui/sheet/Sheet.tsx";
import { SPACE } from "../../ui/tokens.ts";
import { useMenu } from "../../ui/menu.tsx";
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

/// Settings, Account, as the desktop's cards: who is signed in and how sync is doing (with
/// the server and anything waiting for a decision), every device in one list, what is shared,
/// then the password and deleting the account. Quiet: a line says nothing it need not.

interface StatusLine {
  icon: TablerIcon;
  text: string;
  tone: CardTone;
}

/// How sync is doing, in one line a person reads (the desktop's `statusLine`).
function statusLine(status: SyncStatus): StatusLine {
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
      : `Bringing this ${device} into your account: ${migration.itemsSent} of ${migration.items} items, ${migration.filesSent} of ${migration.files} files.`;
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

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

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

/// Signed in: who, how sync is doing, and the way out.
function SignedInCard() {
  const device = useDeviceWord();
  const menu = useMenu();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const user = useSyncState((s) => s.user);
  const status = useSyncState((s) => s.status);
  const serverUrl = useSyncState((s) => s.serverUrl);
  const theme = useTheme();
  const syncNow = useMutation({ mutationFn: () => sync.syncNow() });
  const resend = useMutation({
    mutationFn: async (email: string) => sync.account()?.resendVerification(email),
  });
  const signOut = useMutation({
    mutationFn: () => sync.signOut(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.sync.root });
      // Every screen showed the account's data, which is no longer on this phone.
      void queryClient.invalidateQueries();
    },
  });
  /// Signing out clears this phone: said before it happens, with what has not reached the
  /// account yet, which is backed up first. A warning, not a deletion: the account keeps it.
  const confirmSignOut = async () => {
    const unsent = await sync.unsentCount().catch(() => 0);
    menu.confirm({
      title: `Sign out of this ${device}?`,
      points: [
        { icon: IconCloudCheck, text: "Stays in your account and on your other devices" },
        { icon: IconDeviceMobile, text: `Removed from this ${device}, back when you sign in` },
        ...(unsent > 0
          ? [
              {
                icon: IconAlertTriangle,
                tone: "caution" as const,
                text: `${plural(unsent, "change", "changes")} not sent yet, backed up first`,
              },
            ]
          : []),
      ],
      actions: [{ label: "Sign Out", warning: true, onPress: () => signOut.mutate() }],
    });
  };
  if (!user) return null;
  const line = statusLine(status);
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
        <Button
          size="sm"
          variant="warning"
          label="Sign Out"
          status={statusOf(signOut)}
          errorLabel="Couldn't sign out"
          onPress={() => void confirmSignOut()}
        />
      </CardActions>
      {signOut.error ? <Text tone="destructive">{signOut.error.message}</Text> : null}
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

/// The change password form, in the sheet its row opens.
function ChangePasswordSheet() {
  const sheet = useSheet();
  const { sync } = useAppData();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const user = useSyncState((state) => state.user);
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const change = useMutation({
    mutationFn: async (value: ChangePassword) => {
      const api = sync.account();
      if (!api) throw new Error("Sign in first.");
      await api.changePassword(value.current, value.next);
    },
    onSuccess: () => sheet?.close(),
  });
  const submit = () => {
    const parsed = changePasswordSchema.safeParse({ current, next, confirm });
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors;
      setErrors({ current: flat.current?.[0], next: flat.next?.[0], confirm: flat.confirm?.[0] });
      return;
    }
    setErrors({});
    change.mutate(parsed.data);
  };
  return (
    <View className="gap-3">
      <Field
        label="Current password"
        icon={<FieldIcon icon={IconLock} />}
        placeholder="Current password"
        secureTextEntry
        autoComplete="current-password"
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
      />
      <Field
        label="New password"
        icon={<FieldIcon icon={IconLock} />}
        placeholder="New password"
        secureTextEntry
        autoComplete="new-password"
        value={next}
        onChangeText={setNext}
        error={errors.next}
      />
      <Field
        label="Repeat new password"
        placeholder="Repeat new password"
        icon={<FieldIcon icon={IconLock} />}
        secureTextEntry
        autoComplete="new-password"
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
      />
      <PasswordStrengthMeter
        password={next}
        userInputs={[user?.username, user?.email].filter((v): v is string => !!v)}
      />
      <Button
        size="lg"
        label="Change Password"
        status={statusOf(change)}
        successLabel="Changed"
        errorLabel="Couldn't change it"
        onPress={submit}
      />
      {change.error ? <Text tone="destructive">{change.error.message}</Text> : null}
    </View>
  );
}

/// Deleting the account removes it and everything on the server. This phone keeps its data.
/// The sheet says so, and asks for the password: that is the confirmation.
function DeleteAccountSheet() {
  const sheet = useSheet();
  const device = useDeviceWord();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: async () => {
      await sync.account()?.deleteAccount(password);
      // The account is gone: what is on this phone is the only copy, and stays.
      await sync.detach();
    },
    onSuccess: () => {
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
        ]}
      />
      <Field
        label="Your password"
        icon={<FieldIcon icon={IconLock} />}
        placeholder="Your password"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
      />
      <Button
        size="lg"
        variant="destructive"
        label="Delete Account"
        disabled={!password}
        status={statusOf(remove)}
        errorLabel="Couldn't delete it"
        onPress={() => remove.mutate()}
      />
      {remove.error ? <Text tone="destructive">{remove.error.message}</Text> : null}
    </View>
  );
}

/// The way into changing the password: a row that opens its form in a sheet.
function PasswordRow() {
  const host = useOptionalSheetHost();
  return (
    <GroupedSection margin={0}>
      <ListRow
        badge={<IconBadge glyph={IconLock} tint="gray" />}
        title="Change Password"
        accessory="chevron"
        onPress={() =>
          host?.present({ title: "Change Password", content: <ChangePasswordSheet /> })
        }
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
          <Section title="Password">
            <PasswordRow />
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
    </Screen>
  );
}
