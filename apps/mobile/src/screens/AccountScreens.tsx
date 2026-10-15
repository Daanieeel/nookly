import { ApiClient, emailSchema, signInSchema, usernameSchema } from "@nookly/shared/api";
import { normalizeServerUrl } from "@nookly/shared/sync";
import { IconNotebook } from "@tabler/icons-react-native";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { DEFAULT_SERVER } from "../data/sync.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { PAGE_BACKGROUND, cn } from "../ui/classes.ts";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { fieldError } from "./forms.ts";

const serverSchema = z
  .string()
  .trim()
  .min(1, "Enter the server's address")
  .refine(
    (url) => z.url().safeParse(normalizeServerUrl(url)).success,
    "Enter an address like https://sync.example.com",
  );

const signUpForm = z.object({
  username: usernameSchema,
  email: z.union([emailSchema, z.literal("")]),
  password: z.string().min(10, "Use at least 10 characters").max(256),
});
const resetForm = z.object({ email: z.email("Enter the email address of your account") });

/// The first thing on a new phone, like the apps it sits beside: what Nookly is, and
/// the three ways in. An account is optional: Nookly works fully on its own.
export function WelcomeScreen() {
  const router = useRouter();
  const { onboarded } = useAppData();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const continueAlone = () => {
    onboarded.set("1");
    router.dismissTo("/");
  };
  return (
    <View
      className={cn("flex-1 px-6", PAGE_BACKGROUND)}
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-1 items-center justify-center gap-5">
        <View className="size-16 items-center justify-center rounded-2xl bg-primary">
          <IconNotebook size={32} color={theme.colors.primaryForeground} />
        </View>
        <Text variant="title" className="text-3xl">
          Nookly
        </Text>
        <Text tone="muted" className="max-w-72 text-center text-base">
          Your tasks, notes, studies and plans, in one calm place, on every device.
        </Text>
      </View>
      <View className="w-full max-w-md gap-3 self-center">
        <Button label="Create Account" size="lg" onPress={() => router.push("/account/sign-up")} />
        <Button
          label="Sign In"
          variant="secondary"
          size="lg"
          onPress={() => router.push("/account/sign-in")}
        />
        <Button label="Continue Without an Account" variant="ghost" onPress={continueAlone} />
        <Text variant="small" tone="muted" className="px-4 pt-1 text-center">
          Nookly works fully offline, on this phone alone. An account keeps your phone, tablet and
          computer in step, live.
        </Text>
      </View>
    </View>
  );
}

/// The server this phone signs in to: shown as an address, changed on request.
function ServerField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing && !error) {
    return (
      <View className="flex-row items-center gap-2">
        <Text variant="small" tone="muted">
          Server
        </Text>
        <Text variant="small" className="flex-1" numberOfLines={1}>
          {value}
        </Text>
        <Button label="Change Server" variant="ghost" size="sm" onPress={() => setEditing(true)} />
      </View>
    );
  }
  return (
    <Field
      label="Server"
      required
      value={value}
      onChangeText={onChange}
      error={error}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="url"
      placeholder="https://sync.example.com"
    />
  );
}

function useServer() {
  const { serverUrl } = useAppData();
  const [server, setServer] = useState(serverUrl.get() ?? DEFAULT_SERVER);
  const parsed = serverSchema.safeParse(server);
  return {
    server,
    setServer,
    error: parsed.success ? undefined : parsed.error.issues[0]?.message,
    /// The normalized address, saved as this phone's server.
    commit(): string {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the server.");
      const url = normalizeServerUrl(server);
      serverUrl.set(url);
      return url;
    },
  };
}

/// What happens once an account is in: this phone has answered the welcome screen, and
/// everything here starts moving into the account.
function useAfterSignIn() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { onboarded } = useAppData();
  return () => {
    onboarded.set("1");
    void queryClient.invalidateQueries({ queryKey: keys.local });
    // Back to the app itself, whatever sheets and screens signing in went through.
    router.dismissTo("/");
  };
}

function Page({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <Screen>
        <View className="gap-1 pt-2">
          <Text variant="title" className="text-2xl">
            {title}
          </Text>
          <Text tone="muted">{intro}</Text>
        </View>
        {children}
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function SignInScreen() {
  const router = useRouter();
  const { sync } = useAppData();
  const server = useServer();
  const done = useAfterSignIn();
  const signIn = useMutation({
    mutationFn: (value: z.infer<typeof signInSchema>) =>
      sync.signIn(server.commit(), value.identifier, value.password),
    onSuccess: done,
  });
  const form = useForm({
    defaultValues: { identifier: "", password: "" },
    validators: { onChange: signInSchema, onSubmit: signInSchema },
    onSubmit: ({ value }) => signIn.mutate(value),
  });
  return (
    <Page
      title="Welcome back"
      intro="Sign in to see your Spaces, pages and files on this phone. Nothing here is removed."
    >
      <form.Field name="identifier">
        {(field) => (
          <Field
            label="Username or email"
            required
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username"
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
            textContentType="password"
            autoComplete="current-password"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
      {signIn.error ? <Text tone="destructive">{signIn.error.message}</Text> : null}
      <View className="gap-2">
        <Button
          label="Sign In"
          size="lg"
          status={statusOf(signIn)}
          errorLabel="Couldn't sign in"
          onPress={() => void form.handleSubmit()}
        />
        <Button
          label="Forgot Password"
          variant="ghost"
          onPress={() => router.push("/account/forgot")}
        />
        <Button
          label="Create an Account Instead"
          variant="ghost"
          onPress={() => router.replace("/account/sign-up")}
        />
      </View>
    </Page>
  );
}

export function SignUpScreen() {
  const router = useRouter();
  const { sync } = useAppData();
  const server = useServer();
  const done = useAfterSignIn();
  const signUp = useMutation({
    mutationFn: (value: z.infer<typeof signUpForm>) =>
      sync.signUp(server.commit(), {
        username: value.username.trim(),
        email: value.email.trim() || undefined,
        password: value.password,
      }),
    onSuccess: done,
  });
  const form = useForm({
    defaultValues: { username: "", email: "", password: "" },
    validators: { onChange: signUpForm, onSubmit: signUpForm },
    onSubmit: ({ value }) => signUp.mutate(value),
  });
  return (
    <Page
      title="Create your account"
      intro="One account for your phone, tablet and computer. Everything already on this phone comes along, after a backup."
    >
      <form.Field name="username">
        {(field) => (
          <Field
            label="Username"
            required
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username-new"
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
            label="Email (optional)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            placeholder="For a forgotten password and invites"
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
            textContentType="newPassword"
            autoComplete="password-new"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
      {signUp.error ? <Text tone="destructive">{signUp.error.message}</Text> : null}
      <View className="gap-2">
        <Button
          label="Create Account"
          size="lg"
          status={statusOf(signUp)}
          errorLabel="Couldn't create it"
          onPress={() => void form.handleSubmit()}
        />
        <Button
          label="I Already Have an Account"
          variant="ghost"
          onPress={() => router.replace("/account/sign-in")}
        />
      </View>
    </Page>
  );
}

export function ForgotScreen() {
  const server = useServer();
  const send = useMutation({
    mutationFn: async (email: string) => {
      const api = new ApiClient({
        baseUrl: server.commit(),
        tokens: { load: async () => null, save: async () => {} },
      });
      await api.forgotPassword(email);
    },
  });
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onChange: resetForm, onSubmit: resetForm },
    onSubmit: ({ value }) => send.mutate(value.email),
  });
  return (
    <Page
      title="Reset your password"
      intro="We'll email a link to choose a new one, if the address belongs to an account."
    >
      <form.Field name="email">
        {(field) => (
          <Field
            label="Email"
            required
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
      {send.isSuccess ? (
        <Text tone="positive" accessibilityLiveRegion="polite">
          Check your email. The link works for one hour.
        </Text>
      ) : send.error ? (
        <Text tone="destructive">{send.error.message}</Text>
      ) : null}
      <Button
        label="Send Link"
        size="lg"
        status={statusOf(send)}
        successLabel="Sent"
        errorLabel="Couldn't send it"
        onPress={() => void form.handleSubmit()}
      />
    </Page>
  );
}
