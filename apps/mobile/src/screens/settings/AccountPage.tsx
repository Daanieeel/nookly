import type { Share } from "@nookly/shared/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAppData, useSyncState } from "../../data/context.tsx";
import { keys } from "../../data/keys.ts";
import { Badge } from "../../ui/Badge.tsx";
import { Button, statusOf } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import { Empty, ROW_DIVIDER, Row, Section } from "../../ui/Row.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { useMenu } from "../../ui/menu.tsx";
import { Text } from "../../ui/Text.tsx";
import { cn } from "../../ui/classes.ts";
import { statusText } from "../sync-status.ts";

function SharedRow({ share }: { share: Share }) {
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
  return (
    <View className={cn("gap-2 p-4", ROW_DIVIDER)}>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1" numberOfLines={1}>
          {share.title || "Untitled"}
        </Text>
        <Badge label={share.role === "editor" ? "Can edit" : "Can view"} />
      </View>
      <Text variant="small" tone="muted">
        from {share.owner}
      </Text>
      <View className="flex-row gap-2">
        {share.status === "pending" ? (
          <>
            <Button
              variant="secondary"
              label="Accept"
              status={respond.variables === "accept" ? statusOf(respond) : "idle"}
              onPress={() => respond.mutate("accept")}
            />
            <Button label="Decline" variant="ghost" onPress={() => respond.mutate("decline")} />
          </>
        ) : (
          <Button
            label="Leave"
            variant="ghost"
            status={respond.variables === "leave" ? statusOf(respond) : "idle"}
            onPress={() => respond.mutate("leave")}
          />
        )}
      </View>
    </View>
  );
}

/// Signed out: what an account is for, and the way in.
function SignedOut() {
  const router = useRouter();
  const reason = useSyncState((state) => state.signedOutReason);
  return (
    <Section title="Account">
      <View className="gap-3 p-4">
        {reason ? <Text tone="caution">{reason}</Text> : null}
        <Text tone="muted">
          One account keeps your Spaces, pages, tasks, files and settings the same on every device,
          live. It is optional: without it, everything stays on this phone. Signing in never removes
          anything here, and a backup is made before anything is sent.
        </Text>
        <View className="flex-row gap-2">
          <Button label="Sign In" onPress={() => router.push("/account/sign-in")} />
          <Button
            label="Create Account"
            variant="secondary"
            onPress={() => router.push("/account/sign-up")}
          />
        </View>
      </View>
    </Section>
  );
}

function Account() {
  const menu = useMenu();
  const router = useRouter();
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const user = useSyncState((s) => s.user);
  const serverUrl = useSyncState((s) => s.serverUrl);
  const status = useSyncState((s) => s.status);
  const syncNow = useMutation({ mutationFn: () => sync.syncNow() });
  const signOut = useMutation({
    mutationFn: () => sync.signOut(),
    onSuccess: () => queryClient.removeQueries({ queryKey: keys.sync.root }),
  });
  const { data: sessions = [] } = useQuery({
    queryKey: keys.sync.sessions,
    queryFn: async () => (await sync.account()?.sessions()) ?? [],
  });
  const { data: shares = [] } = useQuery({
    queryKey: keys.sync.sharesWithMe,
    queryFn: async () => (await sync.account()?.sharesWithMe()) ?? [],
  });
  const conflicts = useSyncState((s) => s.status.conflicts);
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: async () => {
      await sync.account()?.deleteAccount(password);
      await sync.signOut();
    },
  });
  const confirmDelete = () =>
    menu.confirm({
      title: "Delete your sync account forever?",
      description:
        "The account, its synced data, its devices and its shares are removed from the server. This can't be undone. Everything on this phone stays.",
      actions: [{ label: "Delete Account", destructive: true, onPress: () => remove.mutate() }],
    });
  if (!user) return <SignedOut />;
  const tone =
    status.state === "error"
      ? "destructive"
      : status.state === "offline"
        ? "caution"
        : status.state === "idle"
          ? "positive"
          : "muted";
  return (
    <>
      <Section title="Sync">
        <View className="gap-2 p-4">
          <Text>{user.email ?? user.username}</Text>
          <Text variant="small" tone="muted">
            on {serverUrl}
          </Text>
          {user.email !== null && !user.emailVerified ? (
            <Badge label="Email not confirmed" variant="warning" />
          ) : null}
          <Text variant="small" tone={tone} accessibilityLiveRegion="polite">
            {statusText(status)}
          </Text>
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              label="Sync Now"
              status={statusOf(syncNow)}
              successLabel="Synced"
              errorLabel="Couldn't sync"
              onPress={() => syncNow.mutate()}
            />
            <Button
              label="Sign Out"
              variant="ghost"
              status={statusOf(signOut)}
              onPress={() => signOut.mutate()}
            />
          </View>
        </View>
      </Section>
      <Section title="Devices">
        {sessions.map((s) => (
          <View key={s.id}>
            <Row
              title={s.deviceName}
              subtitle={
                s.current ? "This device" : `Active ${new Date(s.lastUsedAt).toLocaleDateString()}`
              }
            />
          </View>
        ))}
      </Section>
      <Section title="Shared with me">
        {shares.length === 0 ? (
          <Empty text="Nothing is shared with you yet." />
        ) : (
          shares.map((share) => (
            <View key={share.id}>
              <SharedRow share={share} />
            </View>
          ))
        )}
      </Section>
      <Section title="Changes to review">
        <Row
          title="Review Changes"
          subtitle={
            conflicts === 0
              ? "Nothing needs a look"
              : `${conflicts} ${conflicts === 1 ? "change needs" : "changes need"} a look`
          }
          onPress={() => router.push("/conflicts")}
        />
      </Section>
      <Section title="Delete account">
        <View className="gap-3 p-4">
          <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
          {remove.error ? <Text tone="destructive">{remove.error.message}</Text> : null}
          <Button
            label="Delete Account"
            variant="destructive"
            disabled={!password}
            status={statusOf(remove)}
            errorLabel="Couldn't delete it"
            onPress={confirmDelete}
          />
        </View>
      </Section>
    </>
  );
}

/// Settings, Account: who is signed in, the devices, what is shared, conflicts.
export function AccountPage() {
  return (
    <Screen>
      <Account />
    </Screen>
  );
}
