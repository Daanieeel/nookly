import { type Share, passwordSchema } from "@nookly/shared/api";
import { normalizeServerUrl } from "@nookly/shared/sync";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import { z } from "zod";
import { useAppData, useSyncState } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Empty, Row, Section, Separator } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { fieldError } from "./forms.ts";

const signInSchema = z.object({
  server: z.url("Enter an address like https://sync.example.com"),
  email: z.email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
});

function SignIn() {
  const theme = useTheme();
  const { sync, serverUrl } = useAppData();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"in" | "up">("in");
  const account = useMutation({
    mutationFn: async (value: z.infer<typeof signInSchema>) => {
      const server = normalizeServerUrl(value.server);
      serverUrl.set(server);
      if (mode === "up") {
        if (!passwordSchema.safeParse(value.password).success)
          throw new Error("Use a password of at least 10 characters.");
        await sync.signUp(server, value.email, value.password);
      } else {
        await sync.signIn(server, value.email, value.password);
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.local }),
  });
  const form = useForm({
    defaultValues: { server: serverUrl.get() ?? "", email: "", password: "" },
    validators: { onChange: signInSchema, onSubmit: signInSchema },
    onSubmit: ({ value }) => account.mutate(value),
  });
  return (
    <Section title="Sync">
      <View style={{ padding: theme.space(4), gap: theme.space(3) }}>
        <Text tone="muted">
          Sync keeps your devices in step and lets you see pages shared with you. It is optional:
          without it, everything stays on this phone. Signing in never removes anything here.
        </Text>
        <form.Field name="server">
          {(field) => (
            <Field
              label="Server"
              required
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://sync.example.com"
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
              error={fieldError(field)}
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <Field
              label="Email"
              required
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
              error={fieldError(field)}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <Field
              label="Password"
              required
              secureTextEntry
              textContentType={mode === "up" ? "newPassword" : "password"}
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
              error={fieldError(field)}
            />
          )}
        </form.Field>
        {account.error ? <Text tone="destructive">{account.error.message}</Text> : null}
        <View style={{ flexDirection: "row", gap: theme.space(2) }}>
          <Button
            label="Sign In"
            variant="primary"
            status={mode === "in" ? statusOf(account) : "idle"}
            errorLabel="Couldn't sign in"
            onPress={() => {
              setMode("in");
              void form.handleSubmit();
            }}
          />
          <Button
            label="Create Account"
            status={mode === "up" ? statusOf(account) : "idle"}
            errorLabel="Couldn't create it"
            onPress={() => {
              setMode("up");
              void form.handleSubmit();
            }}
          />
        </View>
      </View>
    </Section>
  );
}

function statusText(
  state: string,
  pending: number,
  error: string | null,
  lastSyncedAt: number | null,
): string {
  if (state === "syncing") return "Syncing";
  if (state === "offline")
    return pending > 0
      ? `Offline. ${pending} ${pending === 1 ? "change waits" : "changes wait"} to sync.`
      : "Offline.";
  if (state === "error") return error ?? "Sync failed.";
  if (state === "off") return "Sync is off.";
  return lastSyncedAt
    ? `Synced at ${new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "Synced";
}

function SharedRow({ share }: { share: Share }) {
  const theme = useTheme();
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
    <View style={{ padding: theme.space(4), gap: theme.space(2) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        <Text style={{ flex: 1 }} numberOfLines={1}>
          {share.title || "Untitled"}
        </Text>
        <Badge label={share.role === "editor" ? "Can edit" : "Can view"} />
      </View>
      <Text variant="small" tone="muted">
        from {share.ownerEmail}
      </Text>
      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        {share.status === "pending" ? (
          <>
            <Button
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

function Account() {
  const theme = useTheme();
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
  const { data: conflicts = [] } = useQuery({
    queryKey: keys.sync.conflicts,
    queryFn: () => sync.engine.conflicts(),
  });
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: async () => {
      await sync.account()?.deleteAccount(password);
      await sync.signOut();
    },
  });
  const confirmDelete = () =>
    Alert.alert(
      "Delete your sync account forever?",
      "The account, its synced data, its devices and its shares are removed from the server. This can't be undone. Everything on this phone stays.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Account", style: "destructive", onPress: () => remove.mutate() },
      ],
    );
  if (!user) return null;
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
        <View style={{ padding: theme.space(4), gap: theme.space(2) }}>
          <Text>{user.email}</Text>
          <Text variant="small" tone="muted">
            on {serverUrl}
          </Text>
          {!user.emailVerified ? (
            <Badge label="Email not confirmed" color={theme.colors.caution} />
          ) : null}
          <Text variant="small" tone={tone} accessibilityLiveRegion="polite">
            {statusText(status.state, status.pending, status.error, status.lastSyncedAt)}
          </Text>
          <View style={{ flexDirection: "row", gap: theme.space(2) }}>
            <Button
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
        {sessions.map((s, i) => (
          <View key={s.id}>
            {i > 0 ? <Separator /> : null}
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
          shares.map((share, i) => (
            <View key={share.id}>
              {i > 0 ? <Separator /> : null}
              <SharedRow share={share} />
            </View>
          ))
        )}
      </Section>
      <Section title="Conflicts">
        <Empty
          text={
            conflicts.length === 0
              ? "No conflicts."
              : `${conflicts.length} changes lost to newer ones and are kept. See them on the desktop under Settings, Sync.`
          }
        />
      </Section>
      <Section title="Delete account">
        <View style={{ padding: theme.space(4), gap: theme.space(3) }}>
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

/// The phone's sync account. Everything else is set on the desktop.
export function SettingsScreen() {
  const signedIn = useSyncState((s) => s.user !== null);
  const reason = useSyncState((s) => s.signedOutReason);
  return (
    <Screen>
      {reason && !signedIn ? <Text tone="caution">{reason}</Text> : null}
      {signedIn ? <Account /> : <SignIn />}
    </Screen>
  );
}
