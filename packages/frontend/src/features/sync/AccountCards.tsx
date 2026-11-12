import type { Session, Share } from "@nookly/shared/api";
import type { SyncStatus } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCloudOff,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDevices,
  IconGitCompare,
  IconLoader2,
  IconLogout,
  IconMailExclamation,
  IconRefresh,
  IconServer,
  IconShare,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { qk } from "#/lib/query-keys.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { useAccountDialog } from "./account-dialog-store.ts";
import { migrationSummary } from "./FirstSyncDialog.tsx";
import { syncRuntime, useSyncState } from "./sync-instance.ts";

/// The Account page's cards, in the style of the Backup and Connections pages: each says
/// what it is about in its own words, how it is doing, and what can be done about it.

const errorText = (error: Error | null) => (error ? error.message : null);

type Tone = "ok" | "idle" | "busy" | "caution" | "error";

const BADGE_TONES = {
  ok: "bg-primary/10 text-primary",
  idle: "bg-muted text-muted-foreground",
  busy: "bg-muted text-muted-foreground",
  caution: "bg-caution/10 text-caution",
  error: "bg-destructive/10 text-destructive",
 satisfies Record<Tone, string>;

const TEXT_TONES = {
  ok: "text-positive",
  idle: "text-muted-foreground",
  busy: "text-muted-foreground",
  caution: "text-caution",
  error: "text-destructive",
 satisfies Record<Tone, string>;

/// A round badge with the card's icon, coloured by how things are.
function CardIcon({ icon: Icon, tone }: { icon: TablerIcon; tone: Tone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full",
        BADGE_TONES[tone],
      )}
    >
      <Icon size={18} className={tone === "busy" ? "animate-spin" : undefined} />
    </span>
  );
}

/// The frame every card here shares: a border that turns red when something is wrong.
function Card({
  tone,
  children,
  className,
  as: Tag = "div",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  return (
    <Tag
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        tone === "error" ? "border-destructive/50" : "border-border",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/// A card's head: icon, a title, a line under it, and its action on the right.
function CardHead({
  icon,
  tone,
  title,
  detail,
  action,
}: {
  icon: TablerIcon;
  tone: Tone;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <CardIcon icon={icon} tone={tone} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{title}</span>
          {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/// A quiet line under a divider at the bottom of a card.
function CardFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

interface StatusLine {
  icon: TablerIcon;
  text: string;
  tone: Tone;
}

/// How sync is doing, in one line a person reads. Never "synced" while an error shows.
export function statusLine(status: SyncStatus): StatusLine {
  switch (status.state) {
    case "syncing":
      return { icon: IconLoader2, text: "Syncing", tone: "busy" };
    case "offline":
      return {
        icon: IconCloudOff,
        text:
          status.pending > 0
            ? `Offline. ${status.pending} ${status.pending === 1 ? "change waits" : "changes wait"} to sync.`
            : "Offline. Changes sync once the server is back.",
        tone: "caution",
      };
    case "error":
      return { icon: IconAlertTriangle, text: status.error ?? "Sync failed.", tone: "error" };
    case "off":
      return { icon: IconCloudOff, text: "Sync is off.", tone: "idle" };
    case "idle":
      if (!status.live) {
        return {
          icon: IconAlertTriangle,
          text: "Synced, but not live. Changes from your other devices may take a minute.",
          tone: "caution",
        };
      }
      return {
        icon: IconCircleCheck,
        text: status.lastSyncedAt
          ? `Synced ${formatEditedAt(new Date(status.lastSyncedAt).toISOString()).toLowerCase()}. Changes arrive as you make them.`
          : "Synced. Changes arrive as you make them.",
        tone: "ok",
      };
  }
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
    <CardFoot>
      <IconDevices size={14} className="shrink-0" />
      <span className={cn("min-w-0 flex-1", migration.phase === "failed" && "text-destructive")}>
        {text}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setFirstSyncOpen(true)}>
        Details
      </Button>
    </CardFoot>
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
    <CardFoot>
      <span>
        Files: {parts.join(", ") || "waiting"}.
        {files.lastError && <span className="text-caution"> Trying again: {files.lastError}</span>}
      </span>
    </CardFoot>
  );
}

/// Signing out clears this device: said before it happens, with what has not reached the
/// account yet, which is backed up first.
function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: unsent = 0 } = useQuery({
    queryKey: qk.sync.unsent(),
    queryFn: () => syncRuntime.unsentCount(),
    enabled: open,
    gcTime: 0,
  });
  const signOut = useMutation({
    mutationFn: () => syncRuntime.signOut(),
    onSuccess: () => {
      onOpenChange(false);
      // Every view showed the account's data, which is no longer here.
      queryClient.removeQueries({ queryKey: qk.sync.root });
      void queryClient.invalidateQueries();
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of this computer?</AlertDialogTitle>
          <AlertDialogDescription>
            Everything stays in your account and on your other devices. It is removed from this
            computer, and comes back when you sign in again.
            {unsent > 0 &&
              ` ${unsent === 1 ? "1 change has" : `${unsent.toLocaleString()} changes have`} not reached the account yet. Nookly tries once more and saves a backup of this computer first.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldError message={errorText(signOut.error)} />
        <AlertDialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Stay Signed In
          </Button>
          <Button onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            <StatusButtonContent
              status={statusOf(signOut)}
              label="Sign Out"
              successLabel="Signed out"
              errorLabel="Couldn't sign out"
            />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/// The email address is not confirmed yet: what that means, and another link.
function UnconfirmedEmail({ email }: { email: string }) {
  const resend = useMutation({
    mutationFn: async () => syncRuntime.account()?.resendVerification(email),
  });
  return (
    <CardFoot>
      <IconMailExclamation size={14} className="shrink-0 text-caution" />
      <span className="min-w-0 flex-1">
        Confirm {email} with the link we sent, so you can reset a forgotten password.
      </span>
      <Button size="sm" variant="ghost" onClick={() => resend.mutate()}>
        <StatusButtonContent
          status={statusOf(resend)}
          label="Send Again"
          successLabel="Sent"
          errorLabel="Couldn't send"
        />
      </Button>
    </CardFoot>
  );
}

/// Signed in: who, how sync is doing, the server, and the way out.
function SignedInCard() {
  const user = useSyncState((s) => s.user);
  const serverUrl = useSyncState((s) => s.serverUrl);
  const status = useSyncState((s) => s.status);
  const syncNow = useMutation({ mutationFn: () => syncRuntime.syncNow() });
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const line = statusLine(status);
  return (
    <Card tone={line.tone} className="w-full">
      <CardHead
        icon={line.icon}
        tone={line.tone}
        title={
          <>
            {user.username}
            {user.email && (
              <span className="ml-2 font-normal text-muted-foreground">{user.email}</span>
            )}
          </>
        }
        detail={
          <span role="status" className={TEXT_TONES[line.tone]}>
            {line.text}
          </span>
        }
        action={
          <Button size="sm" variant="secondary" onClick={() => syncNow.mutate()}>
            <StatusButtonContent
              status={statusOf(syncNow)}
              icon={<IconRefresh size={14} />}
              label="Sync Now"
              successLabel="Synced"
              errorLabel="Couldn't sync"
            />
          </Button>
        }
      />
      {user.email !== null && !user.emailVerified && <UnconfirmedEmail email={user.email} />}
      <FirstSyncLine />
      <FilesLine />
      <CardFoot>
        <IconServer size={14} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={serverUrl ?? undefined}>
          {serverUrl}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setSigningOut(true)}>
          <IconLogout size={14} />
          Sign Out
        </Button>
      </CardFoot>
      <SignOutDialog open={signingOut} onOpenChange={setSigningOut} />
    </Card>
  );
}

/// Signed out: what an account is for, and the ways in.
function SignedOutCard() {
  const show = useAccountDialog((state) => state.show);
  const reason = useSyncState((s) => s.signedOutReason);
  return (
    <Card tone={reason ? "caution" : "idle"} className="w-full">
      <CardHead
        icon={reason ? IconAlertTriangle : IconCloudOff}
        tone={reason ? "caution" : "idle"}
        title="Not signed in"
        detail={reason ?? "Everything stays on this computer."}
        action={
          <>
            <Button size="sm" variant="secondary" onClick={() => show("signUp")}>
              Create Account
            </Button>
            <Button size="sm" onClick={() => show("signIn")}>
              Sign In
            </Button>
          </>
        }
      />
      <CardFoot>
        <span>
          An account keeps your Spaces, pages, tasks, files and settings the same on your phone and
          every other device, live, and lets you share pages. It is optional. When you sign in, you
          decide what happens to what is already here.
        </span>
      </CardFoot>
    </Card>
  );
}

export function AccountCard() {
  const signedIn = useSyncState((s) => s.user !== null);
  return signedIn ? <SignedInCard /> : <SignedOutCard />;
}

/// For a card that only means something with an account.
export function SignedInOnly({ children, what }: { children: ReactNode; what: string }) {
  const signedIn = useSyncState((s) => s.user !== null);
  if (!signedIn) return <p className="text-xs text-muted-foreground">Sign in to see {what}.</p>;
  return children;
}

/// The icon of a device, from what it says it is.
function deviceIcon(session: Session): TablerIcon {
  if (/ipad|tablet/i.test(session.deviceName)) return IconDeviceTablet;
  if (session.platform === "ios" || session.platform === "android") return IconDeviceMobile;
  if (["macos", "windows", "linux"].includes(session.platform)) return IconDeviceLaptop;
  return IconDevices;
}

function DeviceCard({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => syncRuntime.account()?.revokeSession(session.id) ?? Promise.resolve(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.sync.sessions }),
  });
  return (
    <Card as="li" tone={revoke.isError ? "error" : undefined}>
      <CardHead
        icon={deviceIcon(session)}
        tone={session.current ? "ok" : "idle"}
        title={
          <span className="flex items-center gap-2">
            {session.deviceName}
            {session.current && <Badge variant="primary">This device</Badge>}
          </span>
        }
        detail={
          session.current
            ? "The one you are using."
            : `Last active ${formatEditedAt(session.lastUsedAt).toLowerCase()}`
        }
        action={
          !session.current && (
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
          )
        }
      />
      <FieldError message={errorText(revoke.error)} />
    </Card>
  );
}

/// Every device signed in to the account, this one first.
export function DeviceCards() {
  const { data: sessions = [], error } = useQuery({
    queryKey: qk.sync.sessions,
    queryFn: async () => (await syncRuntime.account()?.sessions()) ?? [],
  });
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  return (
    <div className="flex w-full flex-col gap-2">
      <FieldError message={errorText(error)} />
      <ul aria-label="Signed in devices" className="flex flex-col gap-2">
        {ordered.map((session) => (
          <DeviceCard key={session.id} session={session} />
        ))}
      </ul>
    </div>
  );
}

function SharedCard({ share }: { share: Share }) {
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
  const pending = share.status === "pending";
  return (
    <Card as="li" tone={respond.isError ? "error" : undefined}>
      <CardHead
        icon={IconShare}
        tone={pending ? "caution" : "ok"}
        title={share.title || "Untitled"}
        detail={`From ${share.owner}. ${share.role === "editor" ? "You can edit it." : "You can view it."}${pending ? " Waiting for your answer." : ""}`}
        action={
          pending ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => respond.mutate("decline")}>
                Decline
              </Button>
              <Button size="sm" variant="secondary" onClick={() => respond.mutate("accept")}>
                <StatusButtonContent
                  status={respond.variables === "accept" ? statusOf(respond) : "idle"}
                  label="Accept"
                  successLabel="Accepted"
                  errorLabel="Couldn't accept"
                />
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
          )
        }
      />
      <FieldError message={errorText(respond.error)} />
    </Card>
  );
}

/// Pages and tasks other people shared with this account.
export function SharedCards() {
  const { data: shares = [], error } = useQuery({
    queryKey: qk.sync.sharesWithMe,
    queryFn: async () => (await syncRuntime.account()?.sharesWithMe()) ?? [],
  });
  if (shares.length === 0 && !error) {
    return <p className="text-xs text-muted-foreground">Nothing is shared with you yet.</p>;
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <FieldError message={errorText(error)} />
      <ul aria-label="Shared with me" className="flex flex-col gap-2">
        {shares.map((share) => (
          <SharedCard key={share.id} share={share} />
        ))}
      </ul>
    </div>
  );
}

/// How many changes wait for a decision, and the way into the merge editor.
export function ChangesCard() {
  const setMergeOpen = useAccountDialog((state) => state.setMergeOpen);
  // The sync status counts this device's conflicts and the ones only the server logged.
  const count = useSyncState((s) => s.status.conflicts);
  return (
    <Card tone={count > 0 ? "caution" : "idle"} className="w-full">
      <CardHead
        icon={IconGitCompare}
        tone={count > 0 ? "caution" : "idle"}
        title={
          count === 0
            ? "Nothing to review"
            : count === 1
              ? "1 change needs a look"
              : `${count} changes need a look`
        }
        detail={
          count === 0
            ? "Every change from your devices fit together."
            : "Two devices changed the same thing. Nothing was lost: pick a version, or keep both."
        }
        action={
          count > 0 && (
            <Button size="sm" onClick={() => setMergeOpen(true)}>
              Review Changes
            </Button>
          )
        }
      />
    </Card>
  );
}
