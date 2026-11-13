import { type Session, type Share, passwordSchema } from "@nookly/shared/api";
import type { SyncStatus } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCloudOff,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDevices,
  IconGitCompare,
  IconLoader2,
  IconServer,
  IconShare,
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
import { Button, statusOf } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import { Section } from "../../ui/Row.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { SPACE } from "../../ui/tokens.ts";
import { useMenu } from "../../ui/menu.tsx";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { ago } from "../dates.ts";
import { CardActions, CardFoot, CardHead, type CardTone, SettingsCard } from "./cards.tsx";
import { UiIcon } from "../../ui/kit/UiIcon.tsx";

/// Settings, Account, as the desktop's cards: who is signed in and how sync is doing, every
/// device, the changes to review, what is shared, then the password, deleting the account
/// and the server.

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
            ? `Offline. ${status.pending} ${status.pending === 1 ? "change waits" : "changes wait"} to sync.`
            : "Offline. Changes sync once the server is back.",
        tone: "caution",
      };
    case "error":
      return { icon: IconAlertTriangle, text: status.error ?? "Sync failed.", tone: "error" };
    case "off":
      return { icon: IconCloudOff, text: "Sync is off.", tone: "idle" };
    case "idle":
      if (!status.live) {
        return {
          icon: IconAlertTriangle,
          text: "Synced, but not live. Changes from your other devices may take a minute.",
          tone: "caution",
        };
      }
      return {
        icon: IconCircleCheck,
        text: status.lastSyncedAt
          ? `Synced ${ago(new Date(status.lastSyncedAt).toISOString())}. Changes arrive as you make them.`
          : "Synced. Changes arrive as you make them.",
        tone: "ok",
      };
  }
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/// How the first sync of this phone went, or how far it is.
function FirstSyncLine() {
  const migration = useSyncState((state) => state.migration);
  if (!migration) return null;
  const files = migration.files > 0 ? ` and ${plural(migration.files, "file", "files")}` : "";
  const text =
    migration.phase === "done"
      ? `All ${plural(migration.items, "item", "items")}${files} from this phone reached your account, checked with the server.`
      : migration.phase === "failed"
        ? (migration.error ?? "The first sync stopped.")
        : `Bringing this phone into your account: ${migration.itemsSent} of ${migration.items} items, ${migration.filesSent} of ${migration.files} files.`;
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

/// Signed in: who, how sync is doing, and the way out.
function SignedInCard() {
  const menu = useMenu();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const user = useSyncState((s) => s.user);
  const status = useSyncState((s) => s.status);
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
  /// account yet, which is backed up first.
  const confirmSignOut = async () => {
    const unsent = await sync.unsentCount().catch(() => 0);
    const waiting =
      unsent === 0
        ? ""
        : ` ${unsent === 1 ? "1 change has" : `${unsent.toLocaleString()} changes have`} not reached the account yet. Nookly tries once more and saves a backup of this phone first.`;
    menu.confirm({
      title: "Sign out of this phone?",
      description: `Everything stays in your account and on your other devices. It is removed from this phone, and comes back when you sign in again.${waiting}`,
      actions: [{ label: "Sign Out", onPress: () => signOut.mutate() }],
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
          variant="ghost"
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
            Confirm {user.email} with the link we sent, so you can reset a forgotten password.
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
      <FirstSyncLine />
      <FilesLine />
    </SettingsCard>
  );
}

/// Signed out: what an account is for, and the ways in.
function SignedOutCard() {
  const router = useRouter();
  const reason = useSyncState((state) => state.signedOutReason);
  return (
    <SettingsCard tone={reason ? "caution" : "idle"}>
      <CardHead
        icon={reason ? IconAlertTriangle : IconCloudOff}
        tone={reason ? "caution" : "idle"}
        title="Not signed in"
        detail={reason ?? "Everything stays on this phone."}
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
          An account keeps your Spaces, pages, tasks, files and settings the same on your computer
          and every other device, live, and lets you share pages. It is optional. When you sign in,
          you decide what happens to what is already here.
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

function DeviceCard({ session }: { session: Session }) {
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: async () => sync.account()?.revokeSession(session.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.sync.sessions }),
  });
  return (
    <SettingsCard tone={revoke.isError ? "error" : undefined}>
      <CardHead
        icon={deviceIcon(session)}
        tone={session.current ? "ok" : "idle"}
        title={session.deviceName}
        badge={session.current ? <Badge label="This device" variant="primary" /> : null}
        detail={
          session.current ? "The one you are using." : `Last active ${ago(session.lastUsedAt)}`
        }
      />
      {session.current ? null : (
        <CardActions>
          <Button
            size="sm"
            variant="ghost"
            label="Sign Out Device"
            accessibilityLabel={`Sign Out ${session.deviceName}`}
            status={statusOf(revoke)}
            errorLabel="Couldn't sign it out"
            onPress={() => revoke.mutate()}
          />
        </CardActions>
      )}
      {revoke.error ? <Text tone="destructive">{revoke.error.message}</Text> : null}
    </SettingsCard>
  );
}

/// Every device signed in to the account, this one first.
function DeviceCards() {
  const { sync } = useAppData();
  const { data: sessions = [] } = useQuery({
    queryKey: keys.sync.sessions,
    queryFn: async () => (await sync.account()?.sessions()) ?? [],
  });
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  if (ordered.length === 0) {
    return (
      <Text variant="small" tone="muted" className="px-1">
        Your devices show once this phone reaches the server.
      </Text>
    );
  }
  return (
    <View accessibilityLabel="Signed in devices" className="gap-2">
      {ordered.map((session) => (
        <DeviceCard key={session.id} session={session} />
      ))}
    </View>
  );
}

/// How many changes wait for a decision, and the way into the merge editor.
function ChangesCard() {
  const router = useRouter();
  const count = useSyncState((s) => s.status.conflicts);
  return (
    <SettingsCard tone={count > 0 ? "caution" : "idle"}>
      <CardHead
        icon={IconGitCompare}
        tone={count > 0 ? "caution" : "idle"}
        title={
          count === 0
            ? "Nothing to review"
            : count === 1
              ? "1 change needs a look"
              : `${count} changes need a look`
        }
        detail={
          count === 0
            ? "Every change from your devices fit together."
            : "Two devices changed the same thing. Nothing was lost: pick a version, or keep both."
        }
      />
      {count > 0 ? (
        <CardActions>
          <Button size="sm" label="Review Changes" onPress={() => router.push("/conflicts")} />
        </CardActions>
      ) : null}
    </SettingsCard>
  );
}

function SharedCard({ share }: { share: Share }) {
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const respond = useMutation({
    mutationFn: async (action: "accept" | "decline" | "leave") => {
      const api = sync.account();
      if (!api) return;
      if (action === "accept") await api.acceptShare(share.id);
      else if (action === "decline") await api.declineShare(share.id);
      else await api.removeShare(share.id);
      await sync.syncNow();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.sync.sharesWithMe }),
  });
  const pending = share.status === "pending";
  return (
    <SettingsCard tone={respond.isError ? "error" : undefined}>
      <CardHead
        icon={IconShare}
        tone={pending ? "caution" : "ok"}
        title={share.title || "Untitled"}
        detail={`From ${share.owner}. ${share.role === "editor" ? "You can edit it." : "You can view it."}${pending ? " Waiting for your answer." : ""}`}
      />
      <CardActions>
        {pending ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              label="Accept"
              status={respond.variables === "accept" ? statusOf(respond) : "idle"}
              successLabel="Accepted"
              errorLabel="Couldn't accept"
              onPress={() => respond.mutate("accept")}
            />
            <Button
              size="sm"
              variant="ghost"
              label="Decline"
              onPress={() => respond.mutate("decline")}
            />
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            label="Leave"
            status={respond.variables === "leave" ? statusOf(respond) : "idle"}
            successLabel="Left"
            errorLabel="Couldn't leave"
            onPress={() => respond.mutate("leave")}
          />
        )}
      </CardActions>
      {respond.error ? <Text tone="destructive">{respond.error.message}</Text> : null}
    </SettingsCard>
  );
}

function SharedCards() {
  const { sync } = useAppData();
  const { data: shares = [] } = useQuery({
    queryKey: keys.sync.sharesWithMe,
    queryFn: async () => (await sync.account()?.sharesWithMe()) ?? [],
  });
  if (shares.length === 0) {
    return (
      <Text variant="small" tone="muted" className="px-1">
        Nothing is shared with you yet.
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {shares.map((share) => (
        <SharedCard key={share.id} share={share} />
      ))}
    </View>
  );
}

const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current password"),
  next: passwordSchema,
});

function ChangePassword() {
  const { sync } = useAppData();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});
  const change = useMutation({
    mutationFn: async (value: z.infer<typeof changePasswordSchema>) => {
      const api = sync.account();
      if (!api) throw new Error("Sign in first.");
      await api.changePassword(value.current, value.next);
    },
    onSuccess: () => {
      setCurrent("");
      setNext("");
    },
  });
  const submit = () => {
    const parsed = changePasswordSchema.safeParse({ current, next });
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors;
      setErrors({ current: flat.current?.[0], next: flat.next?.[0] });
      return;
    }
    setErrors({});
    change.mutate(parsed.data);
  };
  return (
    <View className="gap-3">
      <Field
        label="Current password"
        secureTextEntry
        autoComplete="current-password"
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
      />
      <Field
        label="New password"
        secureTextEntry
        autoComplete="new-password"
        value={next}
        onChangeText={setNext}
        error={errors.next}
      />
      <View className="items-start">
        <Button
          size="sm"
          variant="secondary"
          label="Change Password"
          status={statusOf(change)}
          successLabel="Changed"
          errorLabel="Couldn't change it"
          onPress={submit}
        />
      </View>
      {change.error ? <Text tone="destructive">{change.error.message}</Text> : null}
    </View>
  );
}

/// Deleting the account removes it and everything on the server. This phone keeps its data.
function DeleteAccount() {
  const menu = useMenu();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: async () => {
      await sync.account()?.deleteAccount(password);
      // The account is gone: what is on this phone is the only copy, and stays.
      await sync.detach();
    },
    onSuccess: () => queryClient.removeQueries({ queryKey: keys.sync.root }),
  });
  const confirmDelete = () =>
    menu.confirm({
      title: "Delete your sync account forever?",
      description:
        "The account, its synced data, its devices and its shares are removed from the server. This can't be undone. Everything on this phone stays.",
      actions: [{ label: "Delete Account", destructive: true, onPress: () => remove.mutate() }],
    });
  return (
    <View className="gap-3">
      <Field
        label="Your password"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
      />
      <View className="items-start">
        <Button
          size="sm"
          variant="secondary"
          label="Delete Account"
          disabled={!password}
          status={statusOf(remove)}
          errorLabel="Couldn't delete it"
          onPress={confirmDelete}
        />
      </View>
      {remove.error ? <Text tone="destructive">{remove.error.message}</Text> : null}
    </View>
  );
}

/// The server this phone syncs with; changing it means signing out first.
function ServerLine() {
  const theme = useTheme();
  const serverUrl = useSyncState((s) => s.serverUrl);
  if (!serverUrl) return null;
  return (
    <View className="flex-row items-center gap-2">
      <UiIcon icon={IconServer} size={14} color={theme.colors.mutedForeground} />
      <Text variant="small" tone="muted" numberOfLines={1} className="flex-1">
        {serverUrl}
      </Text>
    </View>
  );
}

/// What a section says when it only means something with an account.
function SignedInOnly({ what, children }: { what: string; children: React.ReactNode }) {
  const signedIn = useSyncState((s) => s.user !== null);
  if (!signedIn) {
    return (
      <Text variant="small" tone="muted" className="px-1">
        Sign in to see {what}.
      </Text>
    );
  }
  return children;
}

function Description({ children }: { children: string }) {
  return (
    <Label
      type="footnote"
      color="secondaryLabel"
      style={{ paddingHorizontal: SPACE.xs, paddingBottom: SPACE.sm }}
    >
      {children}
    </Label>
  );
}

/// Settings, Account.
export function AccountPage() {
  const signedIn = useSyncState((s) => s.user !== null);
  return (
    <Screen grouped>
      <Section title="Account">{signedIn ? <SignedInCard /> : <SignedOutCard />}</Section>
      <Section title="Devices">
        <Description>
          Every device signed in to your account. Signing one out stops it syncing at once; what it
          holds stays on it.
        </Description>
        <SignedInOnly what="your devices">
          <DeviceCards />
        </SignedInOnly>
      </Section>
      <Section title="Changes to review">
        <ChangesCard />
      </Section>
      <Section title="Shared with me">
        <Description>
          Pages and tasks people shared with you. Accepted ones sync to this phone in a Space of
          their own.
        </Description>
        <SignedInOnly what="what is shared with you">
          <SharedCards />
        </SignedInOnly>
      </Section>
      {signedIn ? (
        <Section title="Password and account">
          <Description>
            The password you sign in with on every device. Devices already signed in stay signed in.
          </Description>
          <ChangePassword />
          <Description>
            Deleting the account removes it and everything in it from the server, for good. What is
            on this phone stays here.
          </Description>
          <DeleteAccount />
        </Section>
      ) : null}
      <ServerLine />
    </Screen>
  );
}
