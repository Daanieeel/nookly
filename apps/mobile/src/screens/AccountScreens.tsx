import { ApiClient, emailSchema, signInSchema, usernameSchema } from "@nookly/shared/api";
import { type SignInOptions, normalizeServerUrl } from "@nookly/shared/sync";
import {
  type Icon,
  IconBrandAppleFilled,
  IconBrandGithubFilled,
  IconBrandGoogleFilled,
  IconBrandNotion,
  IconCloudOff,
  IconDevices,
  IconNotebook,
  IconUsers,
} from "@tabler/icons-react-native";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { DEFAULT_SERVER } from "../data/sync.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { useSemantic } from "../ui/kit/scheme.ts";
import { RADIUS, SPACE } from "../ui/tokens.ts";
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

type LocalData = NonNullable<SignInOptions["localData"]>;

/// What is already on this phone, and the question a sign in has to ask about it: nothing
/// joins an account without a yes. A phone with nothing on it is not asked.
function useLocalData() {
  const { sync } = useAppData();
  const { data: count = 0 } = useQuery({
    queryKey: keys.sync.localData,
    queryFn: () => sync.localDataCount(),
  });
  const [choice, setChoice] = useState<LocalData | null>(null);
  const [missing, setMissing] = useState(false);
  return {
    count,
    choice,
    missing,
    choose: (next: LocalData) => {
      setChoice(next);
      setMissing(false);
    },
    /// Whether the form may go; says so under the question when it is still open.
    answered(): boolean {
      const ok = count === 0 || choice !== null;
      setMissing(!ok);
      return ok;
    },
    options: (): SignInOptions => (count > 0 && choice ? { localData: choice } : {}),
  };
}

const LOCAL_DATA_CHOICES: { value: LocalData; label: string; description: string }[] = [
  {
    value: "add",
    label: "Add to the account",
    description:
      "They join what the account already has and show on every device. A backup is made first.",
  },
  {
    value: "setAside",
    label: "Keep out of the account",
    description:
      "They are saved as a backup on this phone and cleared from Nookly, so only the account's data shows.",
  },
];

function LocalDataQuestion({ data }: { data: ReturnType<typeof useLocalData> }) {
  if (data.count === 0) return null;
  const items = data.count === 1 ? "1 item" : `${data.count.toLocaleString()} items`;
  return (
    <View className="gap-2" accessibilityRole="radiogroup">
      <Text tone="muted">
        This phone already holds {items}. What should happen to {data.count === 1 ? "it" : "them"}?
      </Text>
      {LOCAL_DATA_CHOICES.map((option) => {
        const selected = data.choice === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => data.choose(option.value)}
            className={cn(
              "active:opacity-60",
              "min-h-11 gap-1 rounded-md border p-3",
              selected ? "border-primary bg-primary/10" : "border-border",
            )}
          >
            <Text className="font-medium">{option.label}</Text>
            <Text variant="small" tone="muted">
              {option.description}
            </Text>
          </Pressable>
        );
      })}
      {data.missing ? <Text tone="destructive">Choose one of the two first.</Text> : null}
    </View>
  );
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
  beta = false,
  children,
}: {
  title: string;
  intro: string;
  /// Says the account is part of the closed beta.
  beta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <Screen>
        <View className="gap-2 pt-2">
          {beta ? <Badge label="Closed beta" /> : null}
          <Text variant="title" className="text-3xl" accessibilityRole="header">
            {title}
          </Text>
          <Text tone="muted">{intro}</Text>
        </View>
        {children}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/// Other accounts to sign in with, shown before they work so people know they are coming.
const PROVIDERS: { name: string; icon: Icon }[] = [
  { name: "Google", icon: IconBrandGoogleFilled },
  { name: "Apple", icon: IconBrandAppleFilled },
  { name: "GitHub", icon: IconBrandGithubFilled },
  { name: "Notion", icon: IconBrandNotion },
];

/// Signing in with another account: there, but not working yet, and said so under them.
function OtherAccounts({ verb }: { verb: "in" | "up" }) {
  const theme = useTheme();
  const separator = useSemantic("separator");
  const surface = useSemantic("surface");
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View style={{ flex: 1, height: 1, backgroundColor: separator }} />
        <Text variant="small" tone="muted">
          or sign {verb} using
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: separator }} />
      </View>
      <View className="flex-row flex-wrap" style={{ gap: SPACE.sm }}>
        {PROVIDERS.map(({ name, icon: ProviderIcon }) => (
          <View
            key={name}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Sign ${verb} with ${name}`}
            accessibilityHint="Coming soon"
            accessibilityState={{ disabled: true }}
            style={{
              flexBasis: "47%",
              flexGrow: 1,
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACE.sm,
              borderRadius: RADIUS.control,
              borderCurve: "continuous",
              backgroundColor: surface,
              opacity: 0.55,
            }}
          >
            <ProviderIcon size={20} color={theme.colors.foreground} />
            <Text className="font-medium">{name}</Text>
          </View>
        ))}
      </View>
      <Text variant="small" tone="muted" className="text-center">
        Coming soon
      </Text>
    </View>
  );
}

/// What an account gives, said to someone about to make one.
const BENEFITS: { icon: Icon; text: string }[] = [
  { icon: IconDevices, text: "Live on your computer, phone and tablet" },
  { icon: IconUsers, text: "Share a Space with the people you work with" },
  { icon: IconCloudOff, text: "Keeps working offline and catches up later" },
];

function Benefits() {
  const theme = useTheme();
  return (
    <View className="gap-3">
      {BENEFITS.map(({ icon: BenefitIcon, text }) => (
        <View key={text} className="flex-row items-center gap-3">
          <BenefitIcon size={22} color={theme.colors.primary} />
          <Text className="flex-1">{text}</Text>
        </View>
      ))}
    </View>
  );
}

/// The other way in, at the foot of the page: a question and its answer.
function SwitchAccount({
  question,
  label,
  onPress,
}: {
  question: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-2 pt-2">
      <Text tone="muted" className="text-center">
        {question}
      </Text>
      <Button label={label} variant="secondary" size="lg" onPress={onPress} />
    </View>
  );
}

export function SignInScreen() {
  const router = useRouter();
  const { sync } = useAppData();
  const server = useServer();
  const local = useLocalData();
  const done = useAfterSignIn();
  const signIn = useMutation({
    mutationFn: (value: z.infer<typeof signInSchema>) =>
      sync.signIn(server.commit(), value.identifier, value.password, local.options()),
    onSuccess: done,
  });
  const form = useForm({
    defaultValues: { identifier: "", password: "" },
    validators: { onChange: signInSchema, onSubmit: signInSchema },
    onSubmit: ({ value }) => {
      if (local.answered()) signIn.mutate(value);
    },
  });
  return (
    <Page
      title="Welcome back"
      intro="Pick up where you left off. Your Spaces, pages and files, the same on every device."
      beta
    >
      <FormSection>
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
      </FormSection>
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
      <LocalDataQuestion data={local} />
      {signIn.error ? <Text tone="destructive">{signIn.error.message}</Text> : null}
      <View className="gap-1">
        <Button
          label="Sign In"
          size="lg"
          status={statusOf(signIn)}
          errorLabel="Couldn't sign in"
          onPress={() => void form.handleSubmit()}
        />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Forgot Password"
          onPress={() => router.push("/account/forgot")}
          className="min-h-11 items-center justify-center active:opacity-60"
        >
          <Text tone="muted">Forgot Password</Text>
        </Pressable>
      </View>
      <OtherAccounts verb="in" />
      <SwitchAccount
        question="New to Nookly?"
        label="Create Account"
        onPress={() => router.replace("/account/sign-up")}
      />
    </Page>
  );
}

export function SignUpScreen() {
  const router = useRouter();
  const { sync } = useAppData();
  const server = useServer();
  const local = useLocalData();
  const done = useAfterSignIn();
  const signUp = useMutation({
    mutationFn: (value: z.infer<typeof signUpForm>) =>
      sync.signUp(
        server.commit(),
        {
          username: value.username.trim(),
          email: value.email.trim() || undefined,
          password: value.password,
        },
        local.options(),
      ),
    onSuccess: done,
  });
  const form = useForm({
    defaultValues: { username: "", email: "", password: "" },
    validators: { onChange: signUpForm, onSubmit: signUpForm },
    onSubmit: ({ value }) => {
      if (local.answered()) signUp.mutate(value);
    },
  });
  return (
    <Page
      title="Create your account"
      intro="One account for your phone, tablet and computer, free during the closed beta."
      beta
    >
      <Benefits />
      <FormSection>
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
      </FormSection>
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
      <LocalDataQuestion data={local} />
      {signUp.error ? <Text tone="destructive">{signUp.error.message}</Text> : null}
      <Button
        label="Create Account"
        size="lg"
        status={statusOf(signUp)}
        errorLabel="Couldn't create it"
        onPress={() => void form.handleSubmit()}
      />
      <OtherAccounts verb="up" />
      <SwitchAccount
        question="Already have an account?"
        label="Sign In"
        onPress={() => router.replace("/account/sign-in")}
      />
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
