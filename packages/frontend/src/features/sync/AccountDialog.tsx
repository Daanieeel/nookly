import {
  ApiClient,
  BETA_KEY_MISSING,
  PRODUCTION_SERVER,
  asksForBetaKey,
  signInSchema,
  signUpFormSchema,
} from "@nookly/shared/api";
import { type SignInOptions, normalizeServerUrl } from "@nookly/shared/sync";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBrandAppleFilled, IconKey, IconMail, IconServer, IconUser } from "@tabler/icons-react";
import { type ReactNode, useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { qk } from "#/lib/query-keys.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { CardPicker } from "@nookly/ui/components/card-picker";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { GitHubMark, GoogleMark, NotionMark } from "./provider-marks.tsx";
import { type AccountMode, useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

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

const TITLES = {
  signIn: {
    title: "Sign in to Nookly",
    description: "Pick up where you left off, the same on every device.",
  },
  signUp: {
    title: "Create your account",
    description: "One account for your computer, phone and tablet, free during the closed beta.",
  },
  reset: {
    title: "Reset your password",
    description: "We'll email a link to choose a new one, if the address belongs to an account.",
  },
} satisfies Record<AccountMode, { title: string; description: string }>;

type Mark = (props: { className?: string }) => ReactNode;

/// Other accounts to sign in with, shown before they work so people know they are coming.
/// Google's mark keeps its colours; the others are single colour marks that follow the text.
const PROVIDERS: { name: string; icon: Mark }[] = [
  { name: "Google", icon: GoogleMark },
  { name: "Apple", icon: IconBrandAppleFilled },
  { name: "GitHub", icon: GitHubMark },
  { name: "Notion", icon: NotionMark },
];

/// Signing in with another account: not there yet, each button says so when pointed at.
function OtherAccounts({ verb }: { verb: "in" | "up" }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        or sign {verb} using
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PROVIDERS.map(({ name, icon: ProviderIcon }) => (
          <Tooltip key={name}>
            <TooltipTrigger asChild>
              {/* A disabled button gets no pointer events, so the tooltip hangs on its frame. */}
              <span className="flex">
                <Button
                  type="button"
                  variant="secondary"
                  disabled
                  aria-label={`Sign ${verb} with ${name}`}
                  className="h-10 flex-1"
                >
                  <ProviderIcon className="size-5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Signing in with {name} is coming soon</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

/// Which server: shown as an address, changed on request.
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
      />
    </FormField>
  );
}

function useServer() {
  const [saved] = useSetting("sync.serverUrl");
  const [server, setServer] = useState(saved || PRODUCTION_SERVER);
  const parsed = serverSchema.safeParse(server);
  return {
    server,
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

/// What is already on this device, and the question a sign in has to ask about it: nothing
/// joins an account without a yes. A device with nothing on it is not asked.
function useLocalData() {
  const { data: count = 0 } = useQuery({
    queryKey: qk.sync.localData(),
    queryFn: () => syncRuntime.localDataCount(),
  });
  const [choice, setChoice] = useState<LocalData | null>(null);
  return {
    count,
    choice,
    setChoice,
    /// The form can't be sent while the question is open.
    open: count > 0 && choice === null,
    options: (): SignInOptions => (count > 0 && choice ? { localData: choice } : {}),
  };
}

function LocalDataQuestion({ data }: { data: ReturnType<typeof useLocalData> }) {
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
  const local = useLocalData();
  const identifierId = useId();
  const passwordId = useId();
  const signIn = useMutation({
    mutationFn: (value: z.infer<typeof signInSchema>) =>
      syncRuntime.signIn(server.commit(), value.identifier, value.password, local.options()),
    onSuccess: () => afterSignIn(queryClient),
  });
  const form = useForm({
    defaultValues: { identifier: "", password: "" },
    validators: { onChange: signInSchema, onSubmit: signInSchema },
    onSubmit: ({ value }) => signIn.mutate(value),
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
              autoComplete="current-password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
      <LocalDataQuestion data={local} />
      <FieldError message={errorText(signIn.error)} />
      <form.Subscribe selector={hasVisibleErrors}>
        {(blocked) => (
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" className="w-full" disabled={blocked || local.open}>
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
  );
}

function SignUpForm() {
  const queryClient = useQueryClient();
  const server = useServer();
  const local = useLocalData();
  const ids = {
    username: useId(),
    email: useId(),
    password: useId(),
    confirm: useId(),
    betaKey: useId(),
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
          email: value.email.trim() || undefined,
          password: value.password,
          betaKey,
        },
        local.options(),
      );
    },
    onSuccess: () => afterSignIn(queryClient),
  });
  const form = useForm({
    defaultValues: { username: "", email: "", password: "", confirm: "", betaKey: "" },
    validators: { onChange: signUpFormSchema, onSubmit: signUpFormSchema },
    onSubmit: ({ value }) => signUp.mutate(value),
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
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="username">
          {(field) => (
            <FormField label="Username" htmlFor={ids.username} required error={fieldMessage(field)}>
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
            <FormField
              label="Email"
              htmlFor={ids.email}
              hint="Optional, for password resets."
              error={fieldMessage(field)}
            >
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
      <form.Field name="betaKey">
        {(field) => (
          <FormField
            label="Beta key"
            htmlFor={ids.betaKey}
            required={asksForBetaKey(server.server)}
            hint="Needed while Nookly is in its closed beta."
            error={fieldMessage(field)}
          >
            <PasswordInput
              icon={IconKey}
              id={ids.betaKey}
              autoComplete="off"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
      <LocalDataQuestion data={local} />
      <FieldError message={errorText(signUp.error)} />
      <form.Subscribe selector={hasVisibleErrors}>
        {(blocked) => (
          <div className="flex pt-1">
            <Button type="submit" className="w-full" disabled={blocked || local.open}>
              <StatusButtonContent
                status={statusOf(signUp)}
                label="Create Account"
                successLabel="Account created"
                errorLabel="Couldn't create it"
              />
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
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
      <ServerField value={server.server} onChange={server.setServer} error={server.error} />
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
  const { title, description } = TITLES[mode];
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
              <TabsTrigger value="signIn">I have an account</TabsTrigger>
              <TabsTrigger value="signUp">I'm new here</TabsTrigger>
            </TabsList>
            <TabsContent value="signIn">
              <SignInForm onForgot={() => setMode("reset")} />
            </TabsContent>
            <TabsContent value="signUp">
              <SignUpForm />
            </TabsContent>
          </Tabs>
        )}
        {mode !== "reset" && <OtherAccounts verb={mode === "signUp" ? "up" : "in"} />}
        {mode === "reset" && <ResetForm onBack={() => setMode("signIn")} />}
      </DialogContent>
    </Dialog>
  );
}
