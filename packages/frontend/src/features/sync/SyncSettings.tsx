import { ApiClient, type Session, type Share, passwordSchema } from "@nookly/shared/api";
import type { SyncStatus } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCloudOff,
  IconLoader2,
  IconLogout,
  IconRefresh,
} from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import type { RowSpec } from "#/features/settings/setting-rows.tsx";
import { qk } from "#/lib/query-keys.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { syncRuntime, useSyncState } from "./sync-instance.ts";
import { normalizeServerUrl } from "@nookly/shared/sync";

const errorText = (error: Error | null) => (error ? error.message : null);

/// The sync server's address. Fixed while signed in: changing servers means signing out.
export function SyncServerControl() {
  const [saved, setSaved] = useSetting("sync.serverUrl");
  const signedIn = useSyncState((s) => s.user !== null);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const valid = draft.trim() === "" || z.url().safeParse(normalizeServerUrl(draft)).success;
  const commit = () => {
    const next = draft.trim() === "" ? "" : normalizeServerUrl(draft);
    if (valid && next !== saved) setSaved(next);
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <Input
        aria-label="Server"
        aria-invalid={!valid}
        placeholder="https://sync.example.com"
        className="w-72"
        value={draft}
        disabled={signedIn}
        title={signedIn ? "Sign out to change the server" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      <FieldError message={!valid && "Enter an address like https://sync.example.com"} />
    </div>
  );
}

const signInSchema = z.object({
  email: z.email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
});

function SignInForm() {
  const [serverUrl] = useSetting("sync.serverUrl");
  const queryClient = useQueryClient();
  const emailId = useId();
  const passwordId = useId();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const account = useMutation({
    mutationFn: async ({
      email,
      password,
      create,
    }: {
      email: string;
      password: string;
      create: boolean;
    }) => {
      if (!serverUrl) throw new Error("Enter the server address above first.");
      if (create) {
        const strong = passwordSchema.safeParse(password);
        if (!strong.success) throw new Error("Use a password of at least 10 characters.");
        return syncRuntime.signUp(serverUrl, email, password);
      }
      return syncRuntime.signIn(serverUrl, email, password);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.sync.root }),
  });
  const forgot = useMutation({
    mutationFn: async (email: string) => {
      if (!serverUrl) throw new Error("Enter the server address above first.");
      const api = new ApiClient({
        baseUrl: serverUrl,
        tokens: { load: async () => null, save: async () => {} },
      });
      await api.forgotPassword(email);
    },
  });
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onChange: signInSchema },
    onSubmit: ({ value }) => account.mutate({ ...value, create: mode === "signUp" }),
  });

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-xs text-muted-foreground">
        Sync keeps your devices in step and lets you share pages. It is optional: without it,
        everything stays on this device. Signing in never removes anything here.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="email">
          {(field) => (
            <FormField label="Email" htmlFor={emailId} required error={fieldMessage(field)}>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
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
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </FormField>
          )}
        </form.Field>
      </div>
      <FieldError message={errorText(account.error) ?? errorText(forgot.error)} />
      <form.Subscribe selector={hasVisibleErrors}>
        {(blocked) => (
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={blocked} onClick={() => setMode("signIn")}>
              <StatusButtonContent
                status={mode === "signIn" ? statusOf(account) : "idle"}
                label="Sign In"
                successLabel="Signed in"
                errorLabel="Couldn't sign in"
              />
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={blocked}
              onClick={() => setMode("signUp")}
            >
              <StatusButtonContent
                status={mode === "signUp" ? statusOf(account) : "idle"}
                label="Create Account"
                successLabel="Account created"
                errorLabel="Couldn't create it"
              />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => forgot.mutate(form.getFieldValue("email"))}
            >
              <StatusButtonContent
                status={statusOf(forgot)}
                label="Forgot Password"
                successLabel="Check your email"
                errorLabel="Couldn't send it"
              />
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}

interface StatusLine {
  icon: typeof IconCircleCheck;
  text: string;
  tone: string;
}

function statusLine(status: SyncStatus): StatusLine {
  switch (status.state) {
    case "syncing":
      return { icon: IconLoader2, text: "Syncing", tone: "text-muted-foreground" };
    case "offline":
      return {
        icon: IconCloudOff,
        text:
          status.pending > 0
            ? `Offline. ${status.pending} ${status.pending === 1 ? "change waits" : "changes wait"} to sync.`
            : "Offline. Changes sync once the server is back.",
        tone: "text-caution",
      };
    case "error":
      return {
        icon: IconAlertTriangle,
        text: status.error ?? "Sync failed.",
        tone: "text-destructive",
      };
    case "off":
      return { icon: IconCloudOff, text: "Sync is off.", tone: "text-muted-foreground" };
    case "idle":
      return {
        icon: IconCircleCheck,
        text: status.lastSyncedAt
          ? `Synced ${formatEditedAt(new Date(status.lastSyncedAt).toISOString()).toLowerCase()}`
          : "Synced",
        tone: "text-positive",
      };
  }
}

function AccountSummary() {
  const user = useSyncState((s) => s.user);
  const serverUrl = useSyncState((s) => s.serverUrl);
  const status = useSyncState((s) => s.status);
  const queryClient = useQueryClient();
  const syncNow = useMutation({ mutationFn: () => syncRuntime.syncNow() });
  const signOut = useMutation({
    mutationFn: () => syncRuntime.signOut(),
    onSuccess: () => queryClient.removeQueries({ queryKey: qk.sync.root }),
  });
  const resend = useMutation({
    mutationFn: async () => syncRuntime.account()?.resendVerification(),
  });
  if (!user) return null;
  const line = statusLine(status);
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{user.email}</span>
        <span className="text-xs text-muted-foreground">on {serverUrl}</span>
        {!user.emailVerified && (
          <>
            <Badge variant="warning">Email not confirmed</Badge>
            <Button size="sm" variant="ghost" onClick={() => resend.mutate()}>
              <StatusButtonContent
                status={statusOf(resend)}
                label="Send Again"
                successLabel="Sent"
                errorLabel="Couldn't send"
              />
            </Button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span role="status" className={cn("flex items-center gap-1.5 text-xs", line.tone)}>
          <line.icon
            size={14}
            className={status.state === "syncing" ? "animate-spin" : undefined}
          />
          {line.text}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => syncNow.mutate()}>
            <IconRefresh size={14} />
            <StatusButtonContent
              status={statusOf(syncNow)}
              label="Sync Now"
              successLabel="Synced"
              errorLabel="Couldn't sync"
            />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => signOut.mutate()}>
            <StatusButtonContent
              status={statusOf(signOut)}
              label="Sign Out"
              successLabel="Signed out"
              errorLabel="Couldn't sign out"
            />
          </Button>
        </div>
      </div>
      <DeleteAccount />
    </div>
  );
}

/// Deleting the account removes it and everything on the server. This device keeps its data.
function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      await api.deleteAccount(password);
      await syncRuntime.signOut();
    },
    onSuccess: () => {
      setConfirming(false);
      queryClient.removeQueries({ queryKey: qk.sync.root });
    },
  });
  return (
    <div className="flex items-end gap-2 border-t border-border pt-3">
      <FormField
        label="Delete account"
        htmlFor={inputId}
        hint="Removes the account and all its data on the server. This device keeps everything."
        className="flex-1"
      >
        <Input
          id={inputId}
          type="password"
          placeholder="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <Button
        size="sm"
        variant="secondary"
        disabled={!password}
        onClick={() => setConfirming(true)}
      >
        Delete Account
      </Button>
      <ConfirmPermanentDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete your sync account forever?"
        description="The account, its synced data, its devices and its shares are removed from the server. This can't be undone. Everything on this device stays."
        phrase="delete my account"
        actionLabel="Delete Account"
        errorLabel="Couldn't delete it"
        status={statusOf(remove)}
        error={errorText(remove.error) ?? false}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function AccountPanel() {
  const signedIn = useSyncState((s) => s.user !== null);
  const reason = useSyncState((s) => s.signedOutReason);
  return (
    <div className="flex w-full flex-col gap-2">
      {reason && !signedIn && <p className="text-xs text-caution">{reason}</p>}
      {signedIn ? <AccountSummary /> : <SignInForm />}
    </div>
  );
}

function SignedInOnly({ children, what }: { children: React.ReactNode; what: string }) {
  const signedIn = useSyncState((s) => s.user !== null);
  if (!signedIn) return <p className="text-xs text-muted-foreground">Sign in to see {what}.</p>;
  return children;
}

function DeviceRow({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => syncRuntime.account()?.revokeSession(session.id) ?? Promise.resolve(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.sync.sessions }),
  });
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className="truncate">{session.deviceName}</span>
      {session.current && <Badge variant="primary">This device</Badge>}
      <span className="ml-auto text-xs text-muted-foreground">
        Active {formatEditedAt(session.lastUsedAt).toLowerCase()}
      </span>
      {!session.current && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="iconSm"
              variant="ghost"
              aria-label="Sign Out Device"
              onClick={() => revoke.mutate()}
            >
              {revoke.isPending ? <IconLoader2 className="animate-spin" /> : <IconLogout />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sign Out Device</TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}

function DevicesPanel() {
  const { data: sessions = [], error } = useQuery({
    queryKey: qk.sync.sessions,
    queryFn: async () => (await syncRuntime.account()?.sessions()) ?? [],
  });
  return (
    <div className="w-full">
      <FieldError message={errorText(error)} />
      <ul className="divide-y divide-border">
        {sessions.map((session) => (
          <DeviceRow key={session.id} session={session} />
        ))}
      </ul>
    </div>
  );
}

function SharedRow({ share }: { share: Share }) {
  const queryClient = useQueryClient();
  const respond = useMutation({
    mutationFn: async (action: "accept" | "decline" | "leave") => {
      const api = syncRuntime.account();
      if (!api) return;
      if (action === "accept") await api.acceptShare(share.id);
      else if (action === "decline") await api.declineShare(share.id);
      else await api.removeShare(share.id);
      await syncRuntime.syncNow();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.sync.sharesWithMe }),
  });
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className="truncate font-medium">{share.title || "Untitled"}</span>
      <span className="truncate text-xs text-muted-foreground">from {share.ownerEmail}</span>
      <Badge>{share.role === "editor" ? "Can edit" : "Can view"}</Badge>
      <div className="ml-auto flex items-center gap-1">
        {share.status === "pending" ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => respond.mutate("accept")}>
              <StatusButtonContent
                status={respond.variables === "accept" ? statusOf(respond) : "idle"}
                label="Accept"
                successLabel="Accepted"
                errorLabel="Couldn't accept"
              />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => respond.mutate("decline")}>
              Decline
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => respond.mutate("leave")}>
            <StatusButtonContent
              status={respond.variables === "leave" ? statusOf(respond) : "idle"}
              label="Leave"
              successLabel="Left"
              errorLabel="Couldn't leave"
            />
          </Button>
        )}
      </div>
    </li>
  );
}

function SharedWithMePanel() {
  const { data: shares = [], error } = useQuery({
    queryKey: qk.sync.sharesWithMe,
    queryFn: async () => (await syncRuntime.account()?.sharesWithMe()) ?? [],
  });
  if (shares.length === 0 && !error) {
    return <p className="text-xs text-muted-foreground">Nothing is shared with you yet.</p>;
  }
  return (
    <div className="w-full">
      <FieldError message={errorText(error)} />
      <ul className="divide-y divide-border">
        {shares.map((share) => (
          <SharedRow key={share.id} share={share} />
        ))}
      </ul>
    </div>
  );
}

function ConflictsPanel() {
  const { data: conflicts = [] } = useQuery({
    queryKey: qk.sync.conflicts,
    queryFn: () => syncRuntime.engine.conflicts(),
  });
  if (conflicts.length === 0) return <p className="text-xs text-muted-foreground">No conflicts.</p>;
  return (
    <ul className="w-full divide-y divide-border">
      {conflicts.slice(0, 20).map((c) => (
        <li key={c.id} className="flex items-center gap-2 py-1.5 text-xs">
          <span className="shrink-0 text-muted-foreground">{formatEditedAt(c.createdAt)}</span>
          <span className="shrink-0">{c.field ? `${c.table}.${c.field}` : c.table}</span>
          <span className="truncate font-mono text-muted-foreground">
            {String(c.losingValue ?? "")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/// The Sync page's rows below the server address.
export const SYNC_ROWS: RowSpec[] = [
  {
    id: "sync.account",
    category: "sync",
    section: "Account",
    title: "Sync account",
    hideTitle: true,
    description: "Sign in to sync this device with your others, and to share pages.",
    synonyms: [
      "sign in",
      "log in",
      "login",
      "account",
      "register",
      "sign up",
      "password",
      "sync now",
      "cloud",
    ],
    control: null,
    footer: <AccountPanel />,
  },
  {
    id: "sync.devices",
    category: "sync",
    section: "Devices",
    title: "Signed in devices",
    hideTitle: true,
    description: "Every device signed in to your account. Sign one out to stop it syncing.",
    synonyms: ["sessions", "devices", "phone", "laptop", "sign out", "revoke"],
    control: null,
    footer: (
      <SignedInOnly what="your devices">
        <DevicesPanel />
      </SignedInOnly>
    ),
  },
  {
    id: "sync.shared",
    category: "sync",
    section: "Shared with me",
    title: "Shared with me",
    hideTitle: true,
    description:
      "Pages people shared with you. Accepted ones sync to this device in a Space of their own.",
    synonyms: ["invites", "invitations", "shared", "collaborate", "accept"],
    control: null,
    footer: (
      <SignedInOnly what="what is shared with you">
        <SharedWithMePanel />
      </SignedInOnly>
    ),
  },
  {
    id: "sync.conflicts",
    category: "sync",
    section: "Conflicts",
    title: "Conflicts",
    hideTitle: true,
    description:
      "When two devices change the same thing before syncing, the newer change wins. The other one is kept here, so nothing is lost.",
    synonyms: ["conflicts", "lost changes", "overwritten", "merge"],
    control: null,
    footer: <ConflictsPanel />,
  },
];
