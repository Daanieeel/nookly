import { type Session, type Share, passwordSchema } from "@nookly/shared/api";
import type { Conflict, SyncStatus } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCloudOff,
  IconLoader2,
  IconLogout,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { FormField, fieldMessage } from "#/components/form-field.tsx";
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
import { useAccountDialog } from "./account-dialog-store.ts";
import { migrationSummary } from "./FirstSyncDialog.tsx";
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

/// Signed out: what sync is, and the way in.
function SignedOutPanel() {
  const show = useAccountDialog((state) => state.show);
  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        One account keeps your Spaces, pages, tasks, files and settings the same on every device,
        including your phone, live. It is optional: without it, everything stays on this device.
        Signing in never removes anything here, and a backup is made before anything is sent.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => show("signIn")}>
          Sign In
        </Button>
        <Button size="sm" variant="secondary" onClick={() => show("signUp")}>
          Create Account
        </Button>
      </div>
    </div>
  );
}

/// How the first sync of this device went, or how far it is.
function FirstSyncLine() {
  const migration = useSyncState((state) => state.migration);
  const setFirstSyncOpen = useAccountDialog((state) => state.setFirstSyncOpen);
  if (!migration) return null;
  const text =
    migration.phase === "done"
      ? migrationSummary(migration)
      : migration.phase === "failed"
        ? (migration.error ?? "The first sync stopped.")
        : `Bringing this device into your account: ${migration.itemsSent} of ${migration.items} items, ${migration.filesSent} of ${migration.files} files.`;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          "min-w-0 flex-1",
          migration.phase === "failed" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {text}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setFirstSyncOpen(true)}>
        Details
      </Button>
    </div>
  );
}

/// Files on their way up or down, and the last failure while some wait.
function FilesLine() {
  const files = useSyncState((state) => state.files);
  if (!files || (files.toUpload === 0 && files.toDownload === 0 && !files.lastError)) return null;
  const parts = [
    files.toUpload > 0 && `${files.toUpload} to send`,
    files.toDownload > 0 && `${files.toDownload} to download`,
  ].filter(Boolean);
  return (
    <p className="text-xs text-muted-foreground">
      Files: {parts.join(", ") || "waiting"}.
      {files.lastError && <span className="text-caution"> Trying again: {files.lastError}</span>}
    </p>
  );
}

const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current password"),
  next: passwordSchema,
});

function ChangePassword() {
  const ids = { current: useId(), next: useId() };
  const change = useMutation({
    mutationFn: async (value: z.infer<typeof changePasswordSchema>) => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in first.");
      await api.changePassword(value.current, value.next);
    },
    onSuccess: () => form.reset(),
  });
  const form = useForm({
    defaultValues: { current: "", next: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: ({ value }) => change.mutate(value),
  });
  return (
    <form
      noValidate
      className="flex items-end gap-2 border-t border-border pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="current">
        {(field) => (
          <FormField
            label="Current password"
            htmlFor={ids.current}
            className="flex-1"
            error={fieldMessage(field)}
          >
            <Input
              id={ids.current}
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>
      <form.Field name="next">
        {(field) => (
          <FormField
            label="New password"
            htmlFor={ids.next}
            className="flex-1"
            error={fieldMessage(field)}
          >
            <Input
              id={ids.next}
              type="password"
              autoComplete="new-password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>
      <Button type="submit" size="sm" variant="secondary">
        <StatusButtonContent
          status={statusOf(change)}
          label="Change Password"
          successLabel="Changed"
          errorLabel="Couldn't change it"
        />
      </Button>
      <FieldError message={errorText(change.error)} />
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
    mutationFn: async () =>
      user?.email ? syncRuntime.account()?.resendVerification(user.email) : undefined,
  });
  if (!user) return null;
  const line = statusLine(status);
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{user.username}</span>
        {user.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
        <span className="text-xs text-muted-foreground">on {serverUrl}</span>
        {user.email !== null && !user.emailVerified && (
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
      <FirstSyncLine />
      <FilesLine />
      <ChangePassword />
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
      {signedIn ? <AccountSummary /> : <SignedOutPanel />}
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
      <span className="truncate text-xs text-muted-foreground">from {share.owner}</span>
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

function ConflictRow({ conflict }: { conflict: Conflict }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.sync.conflicts });
    // A change brought back shows in its views right away.
    void queryClient.invalidateQueries();
  };
  const restore = useMutation({
    mutationFn: () => syncRuntime.engine.restoreConflict(conflict.id),
    onSuccess: () => {
      refresh();
      syncRuntime.notifyLocalChange();
    },
  });
  const dismiss = useMutation({
    mutationFn: () => syncRuntime.engine.dismissConflict(conflict.id),
    onSuccess: refresh,
  });
  return (
    <li className="flex items-center gap-2 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{formatEditedAt(conflict.createdAt)}</span>
      <span className="shrink-0">
        {conflict.field ? `${conflict.table}.${conflict.field}` : conflict.table}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
        {String(conflict.losingValue ?? "")}
      </span>
      <Button size="sm" variant="secondary" onClick={() => restore.mutate()}>
        <StatusButtonContent
          status={statusOf(restore)}
          label="Bring Back"
          successLabel="Back"
          errorLabel="Its item is gone"
        />
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="iconSm"
            variant="ghost"
            aria-label="Dismiss Conflict"
            onClick={() => dismiss.mutate()}
          >
            <IconX />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Dismiss Conflict</TooltipContent>
      </Tooltip>
    </li>
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
      {conflicts.slice(0, 50).map((c) => (
        <ConflictRow key={c.id} conflict={c} />
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
