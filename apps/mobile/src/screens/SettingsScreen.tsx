import { type Share, passwordSchema, usernameSchema } from "@nookly/shared/api";
import { normalizeServerUrl } from "@nookly/shared/sync";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Alert, View } from "react-native";
import { z } from "zod";
import { useAppData, useSyncState } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { THEME_CHOICES, setTheme, useThemeChoice } from "../data/appearance.ts";
import { Badge } from "../ui/Badge.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Empty, Row, Section, ROW_DIVIDER } from "../ui/Row.tsx";
import { cn } from "../ui/classes.ts";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { fieldError } from "./forms.ts";
import { statusText } from "./sync-status.ts";

const signInSchema = z.object({
  server: z.url("Enter an address like https://sync.example.com"),
  email: z.string().trim().min(1, "Enter your username or email"),
  password: z.string().min(1, "Enter your password"),
});

function SignIn() {
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
        const name = usernameSchema.safeParse(value.email);
        if (!name.success)
          throw new Error("Pick a username of letters, digits, dots or underscores.");
        await sync.signUp(server, { username: name.data, password: value.password });
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
      <View className="gap-3 p-4">
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
              label="Username or email"
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
        <View className="flex-row gap-2">
          <Button
            label="Sign In"
            status={mode === "in" ? statusOf(account) : "idle"}
            errorLabel="Couldn't sign in"
            onPress={() => {
              setMode("in");
              void form.handleSubmit();
            }}
          />
          <Button
            variant="secondary"
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

function Account() {
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
      <Section title="Conflicts">
        <Row
          title="Conflicts"
          subtitle={
            conflicts.length === 0
              ? "None"
              : `${conflicts.length} ${conflicts.length === 1 ? "change" : "changes"} lost to newer ones, kept to bring back`
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

/// Light, dark, or the system's, as the desktop's Theme setting.
function ThemeSection() {
  const { theme } = useAppData();
  const choice = useThemeChoice((s) => s.choice);
  return (
    <Section title="Appearance">
      <View className="gap-2 p-4">
        <ChipGroup label="Theme">
          {THEME_CHOICES.map((option) => (
            <Chip
              key={option.choice}
              label={option.label}
              selected={option.choice === choice}
              onPress={() => setTheme(theme, option.choice)}
            />
          ))}
        </ChipGroup>
        <Text variant="small" tone="muted">
          Light, dark, or follow the system.
        </Text>
      </View>
    </Section>
  );
}

/// The phone's theme and sync account. Everything else is set on the desktop.
export function SettingsScreen() {
  const signedIn = useSyncState((s) => s.user !== null);
  const reason = useSyncState((s) => s.signedOutReason);
  return (
    <Screen>
      <ThemeSection />
      {reason && !signedIn ? <Text tone="caution">{reason}</Text> : null}
      {signedIn ? <Account /> : <SignIn />}
    </Screen>
  );
}
