import { ApiClient, emailSchema, signInSchema, usernameSchema } from "@nookly/shared/api";
import { type SignInOptions, normalizeServerUrl } from "@nookly/shared/sync";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { qk } from "#/lib/query-keys.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";
import { Button } from "@nookly/ui/components/button";
import { CardPicker } from "@nookly/ui/components/card-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";
import { cn } from "@nookly/ui/lib/utils";
import {
  SEGMENTED_CLASSES,
  SEGMENT_CLASSES,
  SEGMENT_IDLE_CLASSES,
  SEGMENT_SELECTED_CLASSES,
} from "#/classes.ts";
import { type AccountMode, useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

/// The server a fresh install offers: the one `bun run stack` runs on this machine.
export const DEFAULT_SERVER = "http://localhost:3000";

const errorText = (error: Error | null) => (error ? error.message : null);
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

const TITLES = {
  signIn: {
    title: "Sign in to Nookly",
    description:
      "Your Spaces, pages and files stay the same on every device you sign in on. You decide what happens to what is already here.",
  },
  signUp: {
    title: "Create your account",
    description:
      "One account for the desktop and the phone. You decide whether what is already on this device comes along.",
  },
  reset: {
    title: "Reset your password",
    description: "We'll email a link to choose a new one, if the address belongs to an account.",
  },
} satisfies Record<AccountMode, { title: string; description: string }>;

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
      <Input
        id={id}
        value={value}
        placeholder="https://sync.example.com"
        autoComplete="url"
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}

function ModeToggle({ mode, onChange }: { mode: AccountMode; onChange: (m: AccountMode) => void }) {
  const options: { mode: AccountMode; label: string }[] = [
    { mode: "signIn", label: "I have an account" },
    { mode: "signUp", label: "I'm new here" },
  ];
  return (
    <div role="radiogroup" aria-label="Account" className={cn(SEGMENTED_CLASSES, "w-full")}>
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={mode === option.mode}
          onClick={() => onChange(option.mode)}
          className={cn(
            SEGMENT_CLASSES,
            "flex-1",
            mode === option.mode ? SEGMENT_SELECTED_CLASSES : SEGMENT_IDLE_CLASSES,
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function useServer() {
  const [saved] = useSetting("sync.serverUrl");
  const [server, setServer] = useState(saved || DEFAULT_SERVER);
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
            description:
              "They join what the account already has and show on every device. A backup is made first.",
          },
          {
            value: "setAside",
            label: "Keep out of the account",
            description:
              "They are saved as a backup on this computer and cleared from Nookly, so only the account's data shows.",
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
            <Input
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
            <Input
              id={passwordId}
              type="password"
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
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" onClick={onForgot}>
              Forgot Password
            </Button>
            <Button type="submit" size="sm" className="ml-auto" disabled={blocked || local.open}>
              <StatusButtonContent
                status={statusOf(signIn)}
                label="Sign In"
                successLabel="Signed in"
                errorLabel="Couldn't sign in"
              />
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
  const ids = { username: useId(), email: useId(), password: useId() };
  const signUp = useMutation({
    mutationFn: (value: z.infer<typeof signUpForm>) =>
      syncRuntime.signUp(
        server.commit(),
        {
          username: value.username.trim(),
          email: value.email.trim() || undefined,
          password: value.password,
        },
        local.options(),
      ),
    onSuccess: () => afterSignIn(queryClient),
  });
  const form = useForm({
    defaultValues: { username: "", email: "", password: "" },
    validators: { onChange: signUpForm, onSubmit: signUpForm },
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
              <Input
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
              hint="Optional. For a forgotten password and invites."
              error={fieldMessage(field)}
            >
              <Input
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
            <Input
              id={ids.password}
              type="password"
              autoComplete="new-password"
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
          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" disabled={blocked || local.open}>
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
            <Input
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
      <DialogContent className="max-w-md grid-cols-1">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {mode !== "reset" && <ModeToggle mode={mode} onChange={setMode} />}
        {mode === "signIn" && <SignInForm onForgot={() => setMode("reset")} />}
        {mode === "signUp" && <SignUpForm />}
        {mode === "reset" && <ResetForm onBack={() => setMode("signIn")} />}
      </DialogContent>
    </Dialog>
  );
}
