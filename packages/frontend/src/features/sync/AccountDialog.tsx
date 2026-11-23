import {
  ACCOUNT_COPY,
  ACCOUNT_TABS,
  ApiClient,
  BETA_KEY_MISSING,
  PRODUCTION_SERVER,
  ProviderNoAccountError,
  TERMS_VERSION,
  TwoFactorRequiredError,
  asksForBetaKey,
  requiresTerms,
  signInSchema,
  signUpFormSchema,
} from "@nookly/shared/api";
import { type SignInOptions, normalizeServerUrl } from "@nookly/shared/sync";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowRight,
  IconBrandAppleFilled,
  IconKey,
  IconMail,
  IconServer,
  IconUser,
} from "@tabler/icons-react";
import { type ReactNode, useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { qk } from "#/lib/query-keys.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { CardPicker } from "@nookly/ui/components/card-picker";
import { Checkbox } from "@nookly/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { UrlInput } from "#/components/url-input.tsx";
import { PasswordInput } from "#/components/password-input.tsx";
import { PasswordStrengthMeter } from "#/components/password-strength-meter.tsx";
import { IconInput } from "@nookly/ui/components/icon-input";
import { Label } from "@nookly/ui/components/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { GitHubMark, GoogleMark, NotionMark } from "./provider-marks.tsx";
import { useAccountDialog } from "./account-dialog-store.ts";
import { LegalLink, LegalLinks } from "./legal-links.tsx";
import { syncRuntime } from "./sync-instance.ts";
import { TwoFactorStep } from "./TwoFactorStep.tsx";

const errorText = (error: Error | null) => (error ? error.message : null);
const serverSchema = z
  .string()
  .trim()
  .min(1, "Enter the server's address")
  .refine(
    (url) => z.url().safeParse(normalizeServerUrl(url)).success,
    "Enter an address like sync.example.com",
  );

const resetForm = z.object({ email: z.email("Enter the email address of your account") });

type Mark = (props: { className?: string }) => ReactNode;

/// Other accounts to sign in with. Google's mark keeps its colours; the others are single
/// colour marks that follow the text.
const PROVIDERS: { id: string; name: string; icon: Mark }[] = [
  { id: "google", name: "Google", icon: GoogleMark },
  { id: "apple", name: "Apple", icon: IconBrandAppleFilled },
  { id: "github", name: "GitHub", icon: GitHubMark },
  { id: "notion", name: "Notion", icon: NotionMark },
];

/// Signing in, or creating an account, with another account: the browser opens at the
/// provider and comes back here. A provider the server does not have is shown as coming.
function OtherAccounts({
  verb,
  server,
  step,
}: {
  verb: "in" | "up";
  server: ReturnType<typeof useServer>;
  step: ReturnType<typeof useSecondStep>;
}) {
  const queryClient = useQueryClient();
  const url = server.error ? null : normalizeServerUrl(server.server);
  const { data: offered = [] } = useQuery({
    queryKey: qk.sync.providers(url ?? ""),
    queryFn: () => syncRuntime.providersOf(url ?? ""),
    enabled: url !== null,
    staleTime: 60_000,
    retry: false,
  });
  const signIn = useMutation({
    mutationFn: (input: { provider: string; create: boolean; key?: string }) => {
      const target = server.commit();
      if (input.create && !input.key && asksForBetaKey(target)) throw new Error(BETA_KEY_MISSING);
      return syncRuntime.signInWithProvider(
        target,
        input.provider,
        {
          createAccount: input.create,
          betaKey: input.key,
          // Agreed to in the second step, and recorded with the account it makes.
          termsVersion: input.create && requiresTerms(target) ? TERMS_VERSION : undefined,
        },
        step.options(),
      );
    },
    // Nothing comes back when the browser was closed or the person gave up: stay here.
    onSuccess: (user) => {
      if (user) afterSignIn(queryClient);
    },
    // No account for this one yet: not a dead end, the question is whether to make one.
    onError: (error, input) => {
      if (!(error instanceof ProviderNoAccountError) || input.create) return;
      const name = PROVIDERS.find((provider) => provider.id === input.provider)?.name;
      step.request(
        {
          intro: `There is no Nookly account for this ${name} account yet. Create one?`,
          terms: requiresTerms(server.server),
          betaKey: asksForBetaKey(server.server),
        },
        (answers) =>
          signIn.mutate({ provider: input.provider, create: true, key: answers.betaKey }),
      );
    },
  });
  const begin = (provider: string) => {
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
  const waiting = signIn.isPending
    ? PROVIDERS.find((provider) => provider.id === signIn.variables?.provider)
    : undefined;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        or sign {verb} using
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PROVIDERS.map(({ id, name, icon: ProviderIcon }) => {
          const available = offered.includes(id);
          const button = (
            <Button
              type="button"
              variant="secondary"
              disabled={!available || signIn.isPending}
              aria-label={`Sign ${verb} with ${name}`}
              className="h-10 flex-1"
              onClick={() => begin(id)}
            >
              <ProviderIcon className="size-5" />
            </Button>
          );
          // The same elements either way, so a button does not remount when its provider
          // turns out to be available.
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                {/* A disabled button gets no pointer events, so the tooltip hangs on its frame. */}
                <span className="flex">{button}</span>
              </TooltipTrigger>
              {!available && <TooltipContent>Signing in with {name} is coming soon</TooltipContent>}
            </Tooltip>
          );
        })}
      </div>
      {waiting && (
        <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Waiting for {waiting.name} in your browser</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => syncRuntime.cancelProviderSignIn()}
          >
            Cancel
          </Button>
        </div>
      )}
      <FieldError
        message={signIn.error instanceof ProviderNoAccountError ? null : errorText(signIn.error)}
      />
    </div>
  );
}

/// Which server: shown as an address, changed on request.
function ServerField({
  value,
  original,
  onChange,
  error,
}: {
  value: string;
  /// The address the dialog opened with, which the revert button goes back to.
  original: string;
  onChange: (next: string) => void;
  error: string | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const id = useId();
  if (!editing && !error) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Server</span>
        <span className="min-w-0 truncate font-mono text-foreground">{value}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => setEditing(true)}
        >
          Change Server
        </Button>
      </div>
    );
  }
  return (
    <FormField label="Server" htmlFor={id} required error={error}>
      <UrlInput
        icon={IconServer}
        id={id}
        value={value}
        placeholder="sync.example.com"
        autoComplete="url"
        onValueChange={onChange}
        trailing={
          value !== original ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="iconSm"
                  variant="ghost"
                  aria-label="Revert Server"
                  onClick={() => {
                    onChange(original);
                    setEditing(false);
                  }}
                >
                  <IconArrowBackUp size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to {original}</TooltipContent>
            </Tooltip>
          ) : undefined
        }
      />
    </FormField>
  );
}

function useServer() {
  const [saved] = useSetting("sync.serverUrl");
  const [original] = useState(saved || PRODUCTION_SERVER);
  const [server, setServer] = useState(original);
  const parsed = serverSchema.safeParse(server);
  return {
    server,
    original,
    setServer,
    error: parsed.success ? undefined : parsed.error.issues[0]?.message,
    /// The normalized address, saved as this device's server, or an error.
    commit(): string {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the server.");
      const url = normalizeServerUrl(server);
      settings.set("sync.serverUrl", url);
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

/// The second step of the dialog. Nothing joins an account without a yes, so what is already
/// on this device is asked about before a sign in goes through; a new account asks for its
/// terms here too. A device with nothing on it, signing in, has no second step.
function useSecondStep() {
  const { data: count = 0 } = useQuery({
    queryKey: qk.sync.localData(),
    queryFn: () => syncRuntime.localDataCount(),
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

/// The form stays mounted under the step, so a sign in that is under way and what was typed
/// are still there when the person goes back.
function Stepped({
  step,
  className,
  children,
}: {
  step: ReturnType<typeof useSecondStep>;
  className: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className={step.pending ? "hidden" : className}>{children}</div>
      {step.pending && <SecondStep step={step} pending={step.pending} />}
    </>
  );
}

function SecondStep({
  step,
  pending,
}: {
  step: ReturnType<typeof useSecondStep>;
  pending: Pending;
}) {
  const { needs } = pending;
  const [key, setKey] = useState("");
  const [agreed, setAgreed] = useState(false);
  const keyId = useId();
  const termsId = useId();
  const answered =
    (step.count === 0 || step.choice !== null) &&
    (!needs.terms || agreed) &&
    (!needs.betaKey || key.trim() !== "");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (answered) step.confirm({ betaKey: key.trim() || undefined });
      }}
    >
      {needs.intro && <p className="text-sm">{needs.intro}</p>}
      {needs.betaKey && (
        <FormField
          label="Beta key"
          htmlFor={keyId}
          required
          hint="Needed while Nookly is in its closed beta."
        >
          <PasswordInput
            icon={IconKey}
            id={keyId}
            placeholder="Beta key"
            autoComplete="off"
            autoFocus
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </FormField>
      )}
      <LocalDataQuestion data={step} />
      {needs.terms && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id={termsId}
              checked={agreed}
              onCheckedChange={(next) => setAgreed(next === true)}
              className="mt-0.5"
            />
            <Label htmlFor={termsId} className="block text-xs/relaxed font-normal">
              I am at least 18 and agree to the{" "}
              <LegalLink page="terms" className="text-foreground" />.
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            How we handle your data is in the{" "}
            <LegalLink page="privacy" className="text-foreground" />.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" className="w-full" disabled={!answered}>
          Continue
        </Button>
        <Button
          type="button"
          size="sm"
          variant="linkMuted"
          className="self-center"
          onClick={step.cancel}
        >
          <IconArrowLeft size={14} />
          Back
        </Button>
      </div>
    </form>
  );
}

function LocalDataQuestion({ data }: { data: ReturnType<typeof useSecondStep> }) {
  if (data.count === 0) return null;
  const items = data.count === 1 ? "1 item" : `${data.count.toLocaleString()} items`;
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="What is already on this device">
      <p className="text-xs text-muted-foreground">
        This device already holds {items}. What should happen to {data.count === 1 ? "it" : "them"}?
      </p>
      <CardPicker
        // SAFETY: nothing is picked until the person picks; the picker shows no selection.
        value={(data.choice ?? "") as LocalData}
        onChange={data.setChoice}
        options={[
          {
            value: "add",
            label: "Add to the account",
            description: "Joins the account on every device. A backup is made first.",
          },
          {
            value: "setAside",
            label: "Keep out of the account",
            description: "Saved as a backup here and cleared from Nookly.",
          },
        ]}
      />
    </div>
  );
}

function afterSignIn(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries();
  const { close, setFirstSyncOpen } = useAccountDialog.getState();
  close();
  const migration = syncRuntime.store.getState().migration;
  if (migration && migration.phase !== "done") setFirstSyncOpen(true);
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const queryClient = useQueryClient();
  const server = useServer();
  const step = useSecondStep();
  const identifierId = useId();
  const passwordId = useId();
  // The password was right and the account asks for a second step before it signs in.
  const [secondStep, setSecondStep] = useState<TwoFactorRequiredError | null>(null);
  const signIn = useMutation({
    mutationFn: (value: z.infer<typeof signInSchema>) =>
      syncRuntime.signIn(server.commit(), value.identifier, value.password, step.options()),
    onSuccess: () => afterSignIn(queryClient),
    onError: (error) => {
      if (error instanceof TwoFactorRequiredError) setSecondStep(error);
    },
  });
  const form = useForm({
    defaultValues: { identifier: "", password: "" },
    validators: { onChange: signInSchema, onSubmit: signInSchema },
    onSubmit: ({ value }) => step.request({}, () => signIn.mutate(value)),
  });
  if (secondStep) {
    return (
      <TwoFactorStep
        serverUrl={normalizeServerUrl(server.server)}
        challenge={secondStep.challenge}
        methods={secondStep.methods}
        options={step.options()}
        onDone={() => afterSignIn(queryClient)}
        onBack={() => {
          setSecondStep(null);
          signIn.reset();
        }}
      />
    );
  }
  return (
    <Stepped step={step} className="flex flex-col gap-3">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="identifier">
          {(field) => (
            <FormField
              label="Username or email"
              htmlFor={identifierId}
              required
              error={fieldMessage(field)}
            >
              <IconInput
                icon={IconUser}
                id={identifierId}
                placeholder="Username or email"
                autoComplete="username"
                autoFocus
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <FormField label="Password" htmlFor={passwordId} required error={fieldMessage(field)}>
              <PasswordInput
                id={passwordId}
                placeholder="Password"
                autoComplete="current-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </FormField>
          )}
        </form.Field>
        <ServerField
          value={server.server}
          original={server.original}
          onChange={server.setServer}
          error={server.error}
        />
        <FieldError message={errorText(signIn.error)} />
        <form.Subscribe selector={hasVisibleErrors}>
          {(blocked) => (
            <div className="flex flex-col gap-2 pt-1">
              <Button type="submit" className="w-full" disabled={blocked}>
                <StatusButtonContent
                  status={statusOf(signIn)}
                  label="Sign In"
                  successLabel="Signed in"
                  errorLabel="Couldn't sign in"
                />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="linkMuted"
                className="self-center"
                onClick={onForgot}
              >
                Forgot Password
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
      <OtherAccounts verb="in" server={server} step={step} />
    </Stepped>
  );
}

function SignUpForm() {
  const queryClient = useQueryClient();
  const server = useServer();
  const step = useSecondStep();
  const ids = {
    username: useId(),
    email: useId(),
    password: useId(),
    confirm: useId(),
  };
  const signUp = useMutation({
    mutationFn: (value: z.infer<typeof signUpFormSchema>) => {
      const url = server.commit();
      const betaKey = value.betaKey.trim() || undefined;
      if (!betaKey && asksForBetaKey(url)) throw new Error(BETA_KEY_MISSING);
      return syncRuntime.signUp(
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
    onSuccess: () => afterSignIn(queryClient),
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
  return (
    <Stepped step={step} className="flex flex-col gap-3">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <form.Field name="username">
            {(field) => (
              <FormField
                label="Username"
                htmlFor={ids.username}
                required
                error={fieldMessage(field)}
              >
                <IconInput
                  icon={IconUser}
                  id={ids.username}
                  autoComplete="username"
                  autoFocus
                  placeholder="ada"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </FormField>
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <FormField label="Email" htmlFor={ids.email} required error={fieldMessage(field)}>
                <IconInput
                  icon={IconMail}
                  id={ids.email}
                  type="email"
                  autoComplete="email"
                  placeholder="ada@example.com"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </FormField>
            )}
          </form.Field>
        </div>
        <form.Field name="password">
          {(field) => (
            <FormField
              label="Password"
              htmlFor={ids.password}
              required
              hint="At least 10 characters."
              error={fieldMessage(field)}
            >
              <PasswordInput
                id={ids.password}
                placeholder="Password"
                autoComplete="new-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="confirm">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <PasswordInput
                id={ids.confirm}
                aria-label="Repeat password"
                placeholder="Repeat password"
                aria-invalid={fieldMessage(field) !== undefined}
                autoComplete="new-password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldError message={fieldMessage(field)} />
              <form.Subscribe selector={(state) => state.values}>
                {(values) => (
                  <PasswordStrengthMeter
                    password={values.password}
                    userInputs={[values.username, values.email].filter(Boolean)}
                  />
                )}
              </form.Subscribe>
            </div>
          )}
        </form.Field>
        <ServerField
          value={server.server}
          original={server.original}
          onChange={server.setServer}
          error={server.error}
        />
        <FieldError message={errorText(signUp.error)} />
        <form.Subscribe selector={hasVisibleErrors}>
          {(blocked) => (
            <div className="flex pt-1">
              <Button type="submit" className="w-full" disabled={blocked}>
                <StatusButtonContent
                  status={statusOf(signUp)}
                  label="Create Account"
                  successLabel="Account created"
                  errorLabel="Couldn't create it"
                />
                {/* More follows: the terms, and what to do with what is on this device. */}
                {statusOf(signUp) === "idle" && <IconArrowRight size={14} />}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
      <OtherAccounts verb="up" server={server} step={step} />
    </Stepped>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const server = useServer();
  const emailId = useId();
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
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="email">
        {(field) => (
          <FormField label="Email" htmlFor={emailId} required error={fieldMessage(field)}>
            <IconInput
              icon={IconMail}
              id={emailId}
              placeholder="ada@example.com"
              type="email"
              autoComplete="email"
              autoFocus
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>
      <ServerField
        value={server.server}
        original={server.original}
        onChange={server.setServer}
        error={server.error}
      />
      {send.isSuccess ? (
        <p role="status" className="text-xs text-positive">
          Check your email. The link works for one hour.
        </p>
      ) : (
        <FieldError message={errorText(send.error)} />
      )}
      <form.Subscribe selector={hasVisibleErrors}>
        {(blocked) => (
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" onClick={onBack}>
              Back to Sign In
            </Button>
            <Button type="submit" size="sm" className="ml-auto" disabled={blocked}>
              <StatusButtonContent
                status={statusOf(send)}
                label="Send Link"
                successLabel="Sent"
                errorLabel="Couldn't send it"
              />
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}

/// Signing in, creating an account and resetting a password, in one dialog. Opened
/// from Settings, Account, from the titlebar's sync status and the commands palette.
export function AccountDialog() {
  const open = useAccountDialog((s) => s.open);
  const mode = useAccountDialog((s) => s.mode);
  const setMode = useAccountDialog((s) => s.setMode);
  const close = useAccountDialog((s) => s.close);
  const { title, description } = ACCOUNT_COPY[mode];
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md grid-cols-1 gap-3 overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            {mode !== "reset" && <Badge variant="secondary">Closed beta</Badge>}
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {mode !== "reset" && (
          <Tabs
            value={mode}
            onValueChange={(value) => {
              if (value === "signIn" || value === "signUp") setMode(value);
            }}
            className="gap-3"
          >
            <TabsList aria-label="Account" className="w-full">
              {ACCOUNT_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="signIn">
              <SignInForm onForgot={() => setMode("reset")} />
            </TabsContent>
            <TabsContent value="signUp">
              <SignUpForm />
            </TabsContent>
          </Tabs>
        )}
        {mode === "reset" && <ResetForm onBack={() => setMode("signIn")} />}
        <LegalLinks className="justify-center text-muted-foreground" />
      </DialogContent>
    </Dialog>
  );
}
