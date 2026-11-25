import {
  ACCOUNT_COPY,
  ACCOUNT_TABS,
  ApiClient,
  BETA_KEY_MISSING,
  ProviderNoAccountError,
  TERMS_VERSION,
  TwoFactorRequiredError,
  asksForBetaKey,
  requiresTerms,
  signInSchema,
  signUpFormSchema,
} from "@nookly/shared/api";
import { useIsTablet } from "../ui/pane.tsx";
import { useDeviceWord } from "../ui/device-word.ts";
import { type SignInOptions, normalizeServerUrl } from "@nookly/shared/sync";
import {
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowRight,
  IconKey,
  IconLock,
  IconMail,
  IconNotebook,
  IconServer,
  IconUser,
} from "@tabler/icons-react-native";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { DEFAULT_SERVER } from "../data/sync.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { CheckboxRow } from "../ui/CheckboxRow.tsx";
import { Field } from "../ui/Field.tsx";
import { FieldIcon } from "../ui/FieldIcon.tsx";
import { PasswordStrengthMeter } from "../ui/PasswordStrengthMeter.tsx";
import { UrlField } from "../ui/UrlField.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { useSemantic } from "../ui/kit/scheme.ts";
import { SPACE } from "../ui/tokens.ts";
import { PAGE_BACKGROUND, cn } from "../ui/classes.ts";
import { ProviderMark } from "../ui/ProviderMark.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { RouteSheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { BrowserWait } from "./BrowserWait.tsx";
import { fieldError } from "./forms.ts";
import { useRejection } from "./form-block.ts";
import { LegalFooter, LegalLink } from "./legal.tsx";
import { TwoFactorStep } from "./TwoFactorStep.tsx";

const serverSchema = z
  .string()
  .trim()
  .min(1, "Enter the server's address")
  .refine(
    (url) => z.url().safeParse(normalizeServerUrl(url)).success,
    "Enter an address like sync.example.com",
  );

const resetForm = z.object({ email: z.email("Enter the email address of your account") });

/// The first thing on a new phone, like the apps it sits beside: what Nookly is, and
/// the three ways in. An account is optional: Nookly works fully on its own.
export function WelcomeScreen() {
  const tablet = useIsTablet();
  const device = useDeviceWord();
  const router = useRouter();
  const { onboarded } = useAppData();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const continueAlone = () => {
    onboarded.set("1");
    router.dismissTo("/");
  };
  const brand = (
    <View className="items-center justify-center gap-5">
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
  );
  const choices = (
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
        Nookly works fully offline, on this {device} alone. An account keeps your phone, tablet and
        computer in step, live.
      </Text>
    </View>
  );
  // A tablet's is a card in the middle of the window, as the desktop's account dialog.
  if (tablet) {
    return (
      <View
        className={cn("flex-1 items-center justify-center px-6", PAGE_BACKGROUND)}
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View
          testID="welcome-card"
          className="w-full max-w-md gap-8 rounded-xl border border-border bg-card px-8 py-10 shadow-md"
        >
          {brand}
          {choices}
        </View>
      </View>
    );
  }
  return (
    <View
      className={cn("flex-1 px-6", PAGE_BACKGROUND)}
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-1 items-center justify-center">{brand}</View>
      {choices}
    </View>
  );
}

/// The server this phone signs in to: shown as an address, changed on request.
function ServerField({
  value,
  original,
  onChange,
  error,
  disabled = false,
}: {
  value: string;
  /// The address the page opened with, which the revert button goes back to.
  original: string;
  onChange: (next: string) => void;
  error: string | undefined;
  /// Locked while the form is being sent.
  disabled?: boolean;
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
        <Button
          label="Change Server"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onPress={() => setEditing(true)}
        />
      </View>
    );
  }
  return (
    <View className="gap-1">
      <UrlField
        label="Server"
        icon={IconServer}
        showName
        required
        editable={!disabled}
        value={value}
        onValueChange={onChange}
        error={error}
        placeholder="sync.example.com"
      />
      {value !== original ? (
        <View className="items-start">
          <Button
            label="Revert Server"
            variant="ghost"
            size="sm"
            disabled={disabled}
            icon={<IconArrowBackUp size={16} />}
            onPress={() => {
              onChange(original);
              setEditing(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function useServer() {
  const { serverUrl } = useAppData();
  const [original] = useState(serverUrl.get() ?? DEFAULT_SERVER);
  const [server, setServer] = useState(original);
  const parsed = serverSchema.safeParse(server);
  return {
    server,
    original,
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

/// What a sign in or a new account asks for before it goes through, in a step of its own.
interface StepNeeds {
  /// Said above the questions, when there is something to explain.
  intro?: string;
  /// The terms, ticked, for an account that is made.
  terms?: boolean;
  /// The beta key, for an account that is made without having typed it.
  betaKey?: boolean;
}

interface Pending {
  needs: StepNeeds;
  run: (answers: { betaKey?: string }) => void;
}

/// The second step, as the desktop's dialog has it. Nothing joins an account without a yes, so
/// what is already on this phone is asked about before a sign in goes through; a new account
/// asks for its beta key and terms here too. A phone with nothing on it, signing in, has no
/// second step.
function useSecondStep() {
  const { sync } = useAppData();
  const { data: count = 0 } = useQuery({
    queryKey: keys.sync.localData,
    queryFn: () => sync.localDataCount(),
  });
  const [choice, setChoice] = useState<LocalData | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  return {
    count,
    choice,
    setChoice,
    pending,
    options: (): SignInOptions => (count > 0 && choice ? { localData: choice } : {}),
    /// Goes on at once when there is nothing to ask, and asks first when there is.
    request(needs: StepNeeds, run: Pending["run"]) {
      const asks = (count > 0 && choice === null) || needs.intro || needs.terms || needs.betaKey;
      if (asks) setPending({ needs, run });
      else run({});
    },
    confirm(answers: { betaKey?: string }) {
      const waiting = pending;
      setPending(null);
      waiting?.run(answers);
    },
    cancel: () => setPending(null),
  };
}

type SecondStep = ReturnType<typeof useSecondStep>;

const LOCAL_DATA_CHOICES: {
  value: LocalData;
  label: string;
  description: (device: string) => string;
}[] = [
  {
    value: "add",
    label: "Add to the account",
    description: () =>
      "They join what the account already has and show on every device. A backup is made first.",
  },
  {
    value: "setAside",
    label: "Keep out of the account",
    description: (device) =>
      `They are saved as a backup on this ${device} and cleared from Nookly, so only the account's data shows.`,
  },
];

function LocalDataQuestion({ data }: { data: SecondStep }) {
  const device = useDeviceWord();
  if (data.count === 0) return null;
  const items = data.count === 1 ? "1 item" : `${data.count.toLocaleString()} items`;
  return (
    <View className="gap-2" accessibilityRole="radiogroup">
      <Text variant="small" tone="muted">
        This {device} already holds {items}. What should happen to{" "}
        {data.count === 1 ? "it" : "them"}?
      </Text>
      {LOCAL_DATA_CHOICES.map((option) => {
        const selected = data.choice === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => data.setChoice(option.value)}
            className={cn(
              "active:opacity-60",
              "min-h-11 gap-1 rounded-md border p-3",
              selected ? "border-primary bg-primary/10" : "border-border",
            )}
          >
            <Text className="font-medium">{option.label}</Text>
            <Text variant="small" tone="muted">
              {option.description(device)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/// The form stays mounted under the step, so what was typed (and a sign in that is under way)
/// is still there when the person goes back.
function Stepped({ step, children }: { step: SecondStep; children: React.ReactNode }) {
  return (
    <>
      <View className="gap-4" style={step.pending ? { display: "none" } : undefined}>
        {children}
      </View>
      {step.pending ? <SecondStepView step={step} pending={step.pending} /> : null}
    </>
  );
}

function SecondStepView({ step, pending }: { step: SecondStep; pending: Pending }) {
  const { needs } = pending;
  const [key, setKey] = useState("");
  const [agreed, setAgreed] = useState(false);
  const theme = useTheme();
  const answered =
    (step.count === 0 || step.choice !== null) &&
    (!needs.terms || agreed) &&
    (!needs.betaKey || key.trim() !== "");
  return (
    <View className="gap-4">
      {needs.intro ? <Text>{needs.intro}</Text> : null}
      {needs.betaKey ? (
        <FormSection>
          <Field
            label="Beta key"
            icon={<FieldIcon icon={IconKey} />}
            showName
            required
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="oneTimeCode"
            placeholder="Beta key"
            value={key}
            onChangeText={setKey}
          />
          <Text variant="small" tone="muted" className="px-4">
            Needed while Nookly is in its closed beta.
          </Text>
        </FormSection>
      ) : null}
      <LocalDataQuestion data={step} />
      {needs.terms ? (
        <CheckboxRow
          checked={agreed}
          onChange={setAgreed}
          label="I am at least 18 and agree to the Terms of Service"
        >
          <Text variant="small" tone="muted">
            I am at least 18 and agree to the <LegalLink page="terms" />. How we handle your data is
            in the <LegalLink page="privacy" />.
          </Text>
        </CheckboxRow>
      ) : null}
      <View className="gap-1">
        <Button
          label="Continue"
          size="lg"
          disabled={!answered}
          onPress={() => step.confirm({ betaKey: key.trim() || undefined })}
        />
        <Button
          label="Back"
          variant="ghost"
          icon={<IconArrowLeft size={16} color={theme.colors.foreground} />}
          onPress={step.cancel}
        />
      </View>
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
    // The importing screen comes next, and it has nothing to type into.
    Keyboard.dismiss();
    onboarded.set("1");
    void queryClient.invalidateQueries({ queryKey: keys.local });
    // Back to the app itself, whatever sheets and screens signing in went through.
    router.dismissTo("/");
  };
}

/// The account window's page, as the desktop's dialog: its title with the closed beta badge, a
/// line under it, and for signing in and creating an account the two tabs.
function Page({
  mode,
  onMode,
  children,
}: {
  mode: "signIn" | "signUp" | "reset";
  /// Picks the other tab: the page stays, its content changes.
  onMode?: (next: "signIn" | "signUp") => void;
  children: React.ReactNode;
}) {
  const tablet = useIsTablet();
  const router = useRouter();
  const { title, description } = ACCOUNT_COPY[mode];
  const header = (
    <View className="gap-1.5">
      {tablet ? null : (
        <View className="flex-row items-center gap-2">
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          {mode === "reset" ? null : <Badge label="Closed beta" />}
        </View>
      )}
      {tablet && mode !== "reset" ? <Badge label="Closed beta" /> : null}
      <Text variant="small" tone="muted">
        {description}
      </Text>
    </View>
  );
  const tabs =
    mode === "reset" ? null : (
      <Segmented
        label="Account"
        value={mode}
        options={[...ACCOUNT_TABS]}
        onChange={(next) => onMode?.(next)}
      />
    );
  // A tablet's is the desktop's account dialog, titled for what it does.
  if (tablet) {
    return (
      <RouteSheet title={title} kind="form" onClosed={() => router.canGoBack() && router.back()}>
        <Screen>
          {header}
          {tabs}
          {children}
          <LegalFooter />
        </Screen>
      </RouteSheet>
    );
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <Screen>
        {header}
        {tabs}
        {children}
        <LegalFooter />
      </Screen>
    </KeyboardAvoidingView>
  );
}

/// Other accounts to sign in with.
const PROVIDERS = ["Google", "Apple", "GitHub", "Notion"] as const;
type Provider = (typeof PROVIDERS)[number];

/// "Apple", "Apple and Notion", "A, B and C".
const listed = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/// Signing in, or creating an account, with another account: the system's sign in sheet opens
/// at the provider and comes back here. A provider the server does not have is said to be coming.
function OtherAccounts({
  verb,
  server,
  step,
  onDone,
  onSecondStep,
}: {
  verb: "in" | "up";
  server: ReturnType<typeof useServer>;
  step: SecondStep;
  /// An account is in.
  onDone: () => void;
  /// The account has two-factor: the form hands over to the code.
  onSecondStep: (asked: TwoFactorRequiredError) => void;
}) {
  const { sync } = useAppData();
  const theme = useTheme();
  const separator = useSemantic("separator");
  const url = server.error ? null : normalizeServerUrl(server.server);
  const { data: offered = [] } = useQuery({
    queryKey: keys.sync.providers(url ?? ""),
    queryFn: () => sync.providersOf(url ?? ""),
    enabled: url !== null,
    staleTime: 60_000,
    retry: false,
  });
  const signIn = useMutation({
    mutationFn: (input: { provider: Provider; create: boolean; key?: string }) => {
      const target = server.commit();
      if (input.create && !input.key && asksForBetaKey(target)) throw new Error(BETA_KEY_MISSING);
      return sync.signInWithProvider(
        target,
        input.provider.toLowerCase(),
        {
          createAccount: input.create,
          betaKey: input.key,
          // Agreed to in the second step, and recorded with the account it makes.
          termsVersion: input.create && requiresTerms(target) ? TERMS_VERSION : undefined,
        },
        step.options(),
      );
    },
    // Nothing comes back when the sheet was closed or the person gave up: stay here.
    onSuccess: (user) => {
      if (user) onDone();
    },
    // No account for this one yet: not a dead end, the question is whether to make one.
    onError: (error, input) => {
      if (error instanceof TwoFactorRequiredError) onSecondStep(error);
      if (!(error instanceof ProviderNoAccountError) || input.create) return;
      step.request(
        {
          intro: `There is no Nookly account for this ${input.provider} account yet. Create one?`,
          terms: requiresTerms(server.server),
          betaKey: asksForBetaKey(server.server),
        },
        (answers) =>
          signIn.mutate({ provider: input.provider, create: true, key: answers.betaKey }),
      );
    },
  });
  const begin = (provider: Provider) => {
    if (verb === "in") {
      step.request({}, () => signIn.mutate({ provider, create: false }));
      return;
    }
    // A server that fails to parse has nothing to ask for: the error says so.
    if (url === null) {
      signIn.mutate({ provider, create: true });
      return;
    }
    step.request({ terms: requiresTerms(url), betaKey: asksForBetaKey(url) }, (answers) =>
      signIn.mutate({ provider, create: true, key: answers.betaKey }),
    );
  };
  const coming = PROVIDERS.filter((name) => !offered.includes(name.toLowerCase()));
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View style={{ flex: 1, height: 1, backgroundColor: separator }} />
        <Text variant="small" tone="muted">
          or sign {verb} using
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: separator }} />
      </View>
      <View className="flex-row" style={{ gap: SPACE.sm }}>
        {PROVIDERS.map((name) => (
          // The desktop's secondary button with only the provider's mark in it.
          <View key={name} className="flex-1">
            <Button
              variant="secondary"
              hideLabel
              label={`Sign ${verb} with ${name}`}
              disabled={!offered.includes(name.toLowerCase()) || signIn.isPending}
              icon={<ProviderMark provider={name.toLowerCase()} color={theme.colors.foreground} />}
              onPress={() => begin(name)}
            />
          </View>
        ))}
      </View>
      <BrowserWait provider={signIn.isPending ? signIn.variables.provider.toLowerCase() : null} />
      {signIn.error && !(signIn.error instanceof ProviderNoAccountError) ? (
        <Text tone="destructive">{signIn.error.message}</Text>
      ) : null}
      {offered.length > 0 && coming.length > 0 ? (
        <Text variant="small" tone="muted" className="text-center">
          {listed(coming)} {coming.length === 1 ? "is" : "are"} coming soon
        </Text>
      ) : null}
    </View>
  );
}

function SignInForm() {
  const router = useRouter();
  const { sync } = useAppData();
  const server = useServer();
  const step = useSecondStep();
  const done = useAfterSignIn();
  // The first step was right and the account asks for a second one before it signs in.
  const [secondStep, setSecondStep] = useState<TwoFactorRequiredError | null>(null);
  const signIn = useMutation({
    mutationFn: (value: z.infer<typeof signInSchema>) =>
      sync.signIn(server.commit(), value.identifier, value.password, step.options()),
    onSuccess: done,
    onError: (error) => {
      if (error instanceof TwoFactorRequiredError) setSecondStep(error);
    },
  });
  const form = useForm({
    defaultValues: { identifier: "", password: "" },
    validators: { onChange: signInSchema, onSubmit: signInSchema },
    onSubmit: ({ value }) => step.request({}, () => signIn.mutate(value)),
  });
  const attempted = useStore(form.store, (state) => state.submissionAttempts > 0);
  const valid = useStore(form.store, (state) => state.isValid);
  const rejection = useRejection(signIn, ["identifier", "password"]);
  if (secondStep) {
    return (
      <>
        <TwoFactorStep
          serverUrl={normalizeServerUrl(server.server)}
          challenge={secondStep.challenge}
          methods={secondStep.methods}
          options={step.options()}
          onDone={done}
          onBack={() => {
            setSecondStep(null);
            signIn.reset();
          }}
        />
      </>
    );
  }
  return (
    <>
      <Stepped step={step}>
        <FormSection>
          <form.Field name="identifier">
            {(field) => (
              <Field
                editable={!signIn.isPending}
                invalid={rejection.invalid("identifier")}
                label="Username or email"
                icon={<FieldIcon icon={IconUser} />}
                showName
                placeholder="Username or email"
                required
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoComplete="username"
                value={field.state.value}
                onChangeText={(next) => {
                  rejection.edit("identifier");
                  field.handleChange(next);
                }}
                onBlur={field.handleBlur}
                error={fieldError(field)}
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <Field
                editable={!signIn.isPending}
                invalid={rejection.invalid("password")}
                label="Password"
                icon={<FieldIcon icon={IconLock} />}
                showName
                placeholder="Password"
                required
                secureTextEntry
                textContentType="password"
                autoComplete="current-password"
                value={field.state.value}
                onChangeText={(next) => {
                  rejection.edit("password");
                  field.handleChange(next);
                }}
                onBlur={field.handleBlur}
                error={fieldError(field)}
              />
            )}
          </form.Field>
        </FormSection>
        <ServerField
          value={server.server}
          original={server.original}
          onChange={(next) => {
            rejection.editAll();
            server.setServer(next);
          }}
          error={server.error}
          disabled={signIn.isPending}
        />
        {signIn.error ? <Text tone="destructive">{signIn.error.message}</Text> : null}
        <View className="gap-1">
          <Button
            label="Sign In"
            disabled={rejection.waiting || (attempted && !valid)}
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
        <OtherAccounts
          verb="in"
          server={server}
          step={step}
          onDone={done}
          onSecondStep={setSecondStep}
        />
      </Stepped>
    </>
  );
}

function SignUpForm() {
  const theme = useTheme();
  const { sync } = useAppData();
  const server = useServer();
  const step = useSecondStep();
  const done = useAfterSignIn();
  // The provider's account already exists here and asks for its second step.
  const [secondStep, setSecondStep] = useState<TwoFactorRequiredError | null>(null);
  const signUp = useMutation({
    mutationFn: (value: z.infer<typeof signUpFormSchema>) => {
      const url = server.commit();
      const betaKey = value.betaKey.trim() || undefined;
      if (!betaKey && asksForBetaKey(url)) throw new Error(BETA_KEY_MISSING);
      return sync.signUp(
        url,
        {
          username: value.username.trim(),
          email: value.email.trim(),
          password: value.password,
          betaKey,
          // Only Nookly's own server has terms, and the box is only there for it.
          termsVersion: requiresTerms(url) ? TERMS_VERSION : undefined,
        },
        step.options(),
      );
    },
    onSuccess: done,
  });
  const form = useForm({
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirm: "",
      betaKey: "",
      // Agreed to in the second step, where Nookly's own server asks for it.
      acceptTerms: true,
    },
    validators: { onChange: signUpFormSchema, onSubmit: signUpFormSchema },
    // The beta key and the terms are asked for in the next step.
    onSubmit: ({ value }) =>
      step.request(
        { terms: requiresTerms(server.server), betaKey: asksForBetaKey(server.server) },
        (answers) => signUp.mutate({ ...value, betaKey: answers.betaKey ?? "" }),
      ),
  });
  const attempted = useStore(form.store, (state) => state.submissionAttempts > 0);
  const valid = useStore(form.store, (state) => state.isValid);
  const email = useStore(form.store, (state) => state.values.email);
  const rejection = useRejection(signUp, [
    "username",
    "password",
    ...(email.trim() ? ["email"] : []),
  ]);
  if (secondStep) {
    return (
      <TwoFactorStep
        serverUrl={normalizeServerUrl(server.server)}
        challenge={secondStep.challenge}
        methods={secondStep.methods}
        options={step.options()}
        onDone={done}
        onBack={() => setSecondStep(null)}
      />
    );
  }
  return (
    <>
      <Stepped step={step}>
        <FormSection>
          <form.Field name="username">
            {(field) => (
              <Field
                editable={!signUp.isPending}
                invalid={rejection.invalid("username")}
                label="Username"
                icon={<FieldIcon icon={IconUser} />}
                showName
                placeholder="Username"
                required
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoComplete="username-new"
                value={field.state.value}
                onChangeText={(next) => {
                  rejection.edit("username");
                  field.handleChange(next);
                }}
                onBlur={field.handleBlur}
                error={fieldError(field)}
              />
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <Field
                editable={!signUp.isPending}
                invalid={rejection.invalid("email")}
                label="Email"
                required
                icon={<FieldIcon icon={IconMail} />}
                showName
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                placeholder="ada@example.com"
                value={field.state.value}
                onChangeText={(next) => {
                  rejection.edit("email");
                  field.handleChange(next);
                }}
                onBlur={field.handleBlur}
                error={fieldError(field)}
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <Field
                editable={!signUp.isPending}
                invalid={rejection.invalid("password")}
                label="Password"
                icon={<FieldIcon icon={IconLock} />}
                showName
                placeholder="Password"
                required
                secureTextEntry
                textContentType="newPassword"
                autoComplete="password-new"
                value={field.state.value}
                onChangeText={(next) => {
                  rejection.edit("password");
                  field.handleChange(next);
                }}
                onBlur={field.handleBlur}
                error={fieldError(field)}
              />
            )}
          </form.Field>
          <form.Field name="confirm">
            {(field) => (
              <Field
                editable={!signUp.isPending}
                label="Repeat password"
                icon={<FieldIcon icon={IconLock} />}
                placeholder="Repeat password"
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
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <PasswordStrengthMeter
                password={values.password}
                userInputs={[values.username, values.email].filter(Boolean)}
              />
            )}
          </form.Subscribe>
        </FormSection>
        <ServerField
          value={server.server}
          original={server.original}
          onChange={(next) => {
            rejection.editAll();
            server.setServer(next);
          }}
          error={server.error}
          disabled={signUp.isPending}
        />
        {signUp.error ? <Text tone="destructive">{signUp.error.message}</Text> : null}
        <Button
          label="Create Account"
          disabled={rejection.waiting || (attempted && !valid)}
          size="lg"
          status={statusOf(signUp)}
          errorLabel="Couldn't create it"
          // More follows: the beta key and the terms, and what to do with what is on this phone.
          iconEnd={<IconArrowRight size={16} color={theme.colors.primaryForeground} />}
          onPress={() => void form.handleSubmit()}
        />
        <OtherAccounts
          verb="up"
          server={server}
          step={step}
          onDone={done}
          onSecondStep={setSecondStep}
        />
      </Stepped>
    </>
  );
}

/// Signing in and creating an account are one page with two tabs, as the desktop's dialog: the
/// tab picks which form is shown, and nothing is navigated to.
function AccountPage({ initial }: { initial: "signIn" | "signUp" }) {
  const [mode, setMode] = useState(initial);
  return (
    <Page mode={mode} onMode={setMode}>
      {mode === "signIn" ? <SignInForm /> : <SignUpForm />}
    </Page>
  );
}

export function SignInScreen() {
  return <AccountPage initial="signIn" />;
}

export function SignUpScreen() {
  return <AccountPage initial="signUp" />;
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
  const attempted = useStore(form.store, (state) => state.submissionAttempts > 0);
  const valid = useStore(form.store, (state) => state.isValid);
  const rejection = useRejection(send, ["email"]);
  return (
    <Page mode="reset">
      <form.Field name="email">
        {(field) => (
          <Field
            editable={!send.isPending}
            invalid={rejection.invalid("email")}
            label="Email"
            icon={<FieldIcon icon={IconMail} />}
            showName
            required
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={field.state.value}
            onChangeText={(next) => {
              rejection.edit("email");
              field.handleChange(next);
            }}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <ServerField
        value={server.server}
        original={server.original}
        onChange={(next) => {
          rejection.editAll();
          server.setServer(next);
        }}
        error={server.error}
        disabled={send.isPending}
      />
      {send.isSuccess ? (
        <Text tone="positive" accessibilityLiveRegion="polite">
          Check your email. The link works for one hour.
        </Text>
      ) : send.error ? (
        <Text tone="destructive">{send.error.message}</Text>
      ) : null}
      <Button
        label="Send Link"
        disabled={rejection.waiting || (attempted && !valid)}
        size="lg"
        status={statusOf(send)}
        successLabel="Sent"
        errorLabel="Couldn't send it"
        onPress={() => void form.handleSubmit()}
      />
    </Page>
  );
}
