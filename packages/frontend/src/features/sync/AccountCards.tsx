import type { Session } from "@nookly/shared/api";
import { type SyncStatus, filesDetail, heldLine } from "@nookly/shared/sync";
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
  IconShieldLock,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { qk } from "#/lib/query-keys.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { useAccountDialog } from "./account-dialog-store.ts";
import { useSecurityDialog } from "./security-dialog-store.ts";
import { SignOutDialog } from "./SignOutDialog.tsx";
import { useTermsGate } from "./terms-gate-store.ts";
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
} satisfies Record<Tone, string>;

const TEXT_TONES = {
  ok: "text-positive",
  idle: "text-muted-foreground",
  busy: "text-muted-foreground",
  caution: "text-caution",
  error: "text-destructive",
} satisfies Record<Tone, string>;

/// A round badge with the card's icon, coloured by how things are.
function CardIcon({ icon: Icon, tone }: { icon: TablerIcon; tone: Tone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
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
            ? `Offline, ${status.pending} ${status.pending === 1 ? "change waits" : "changes wait"}`
            : "Offline",
        tone: "caution",
      };
    case "error":
      return { icon: IconAlertTriangle, text: status.error ?? "Sync failed", tone: "error" };
    case "off":
      return { icon: IconCloudOff, text: "Sync is off", tone: "idle" };
    case "idle":
      if (status.held > 0) {
        return {
          icon: IconAlertTriangle,
          text: heldLine(status.held, "this computer"),
          tone: "caution",
        };
      }
      if (!status.live) {
        return {
          icon: IconAlertTriangle,
          text: "Synced, but not live",
          tone: "caution",
        };
      }
      return {
        icon: IconCircleCheck,
        text: status.lastSyncedAt
          ? `Synced ${formatEditedAt(new Date(status.lastSyncedAt).toISOString()).toLowerCase()}`
          : "Synced",
        tone: "ok",
      };
  }
}

/// How the first sync of this device went, or how far it is.
function FirstSyncLine() {
  const migration = useSyncState((state) => state.migration);
  const setFirstSyncOpen = useAccountDialog((state) => state.setFirstSyncOpen);
  // Once it is done there is nothing left to look at.
  if (!migration || migration.phase === "done") return null;
  const text =
    migration.phase === "failed"
      ? (migration.error ?? "The first sync stopped.")
      : `Bringing this device into your account: ${migration.itemsSent} of ${migration.items} items, ${filesDetail(migration)}.`;
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

/// The email address is not confirmed yet: what that means, and another link.
function UnconfirmedEmail({ email }: { email: string }) {
  const resend = useMutation({
    mutationFn: async () => syncRuntime.account()?.resendVerification(email),
  });
  return (
    <CardFoot>
      <IconMailExclamation size={14} className="shrink-0 text-caution" />
      <span className="min-w-0 flex-1">Confirm {email} to reset a forgotten password.</span>
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

/// Why sync is not running while the terms wait for an answer, and the way back to them.
export function TermsLine() {
  const pending = useSyncState((s) => s.termsPending);
  if (!pending) return null;
  return (
    <CardFoot>
      <IconAlertTriangle size={14} className="shrink-0 text-caution" />
      <span role="status" className="min-w-0 flex-1">
        Sync is paused on this computer until you agree to the terms.
      </span>
      <Button size="sm" variant="secondary" onClick={() => useTermsGate.getState().reopen()}>
        Review Terms
      </Button>
    </CardFoot>
  );
}

/// Whether the account signs in with a second step, and the way to change it. An account
/// made with another provider has no password to protect, so it shows nothing.
function SecurityLine() {
  const { data } = useQuery({
    queryKey: qk.sync.security,
    queryFn: async () => syncRuntime.account()?.security() ?? null,
  });
  if (!data?.available) return null;
  return (
    <CardFoot>
      <IconShieldLock size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">Two-factor sign in is {data.enabled ? "on" : "off"}</span>
      <Button size="sm" variant="secondary" onClick={() => useSecurityDialog.getState().show()}>
        Manage
      </Button>
    </CardFoot>
  );
}

/// Changes two devices disagreed on: only there while some wait for a decision.
function ChangesNotice() {
  const setMergeOpen = useAccountDialog((state) => state.setMergeOpen);
  // The sync status counts this device's conflicts and the ones only the server logged.
  const count = useSyncState((s) => s.status.conflicts);
  if (count === 0) return null;
  return (
    <CardFoot>
      <IconGitCompare size={14} className="shrink-0 text-caution" />
      <span className="min-w-0 flex-1">
        {count === 1 ? "1 change needs a look" : `${count} changes need a look`}
      </span>
      <Button size="sm" variant="secondary" onClick={() => setMergeOpen(true)}>
        Review Changes
      </Button>
    </CardFoot>
  );
}

/// Signed in: who, how sync is doing, and the way out.
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
          <>
            <Button size="sm" variant="secondary" onClick={() => syncNow.mutate()}>
              <StatusButtonContent
                status={statusOf(syncNow)}
                icon={<IconRefresh size={14} />}
                label="Sync Now"
                successLabel="Synced"
                errorLabel="Couldn't sync"
              />
            </Button>
            <Button size="sm" variant="warning" onClick={() => setSigningOut(true)}>
              <IconLogout size={14} />
              Sign Out
            </Button>
          </>
        }
      />
      {user.email !== null && !user.emailVerified && <UnconfirmedEmail email={user.email} />}
      <TermsLine />
      <SecurityLine />
      <ChangesNotice />
      <FirstSyncLine />
      <FilesLine />
      <CardFoot>
        <IconServer size={14} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={serverUrl ?? undefined}>
          {serverUrl}
        </span>
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
        <span>Optional. Keeps all your devices the same.</span>
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

function DeviceRow({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => syncRuntime.account()?.revokeSession(session.id) ?? Promise.resolve(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.sync.sessions }),
  });
  const Icon = deviceIcon(session);
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            session.current ? BADGE_TONES.ok : BADGE_TONES.idle,
          )}
        >
          <Icon size={16} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          <span className="truncate">{session.deviceName}</span>
          {session.current && <Badge variant="primary">This device</Badge>}
        </span>
        {!session.current && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatEditedAt(session.lastUsedAt)}
          </span>
        )}
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
      </div>
      <FieldError message={errorText(revoke.error)} />
    </li>
  );
}

/// Every device signed in to the account, this one first, in one list.
export function DeviceCards() {
  const { data: sessions = [], error } = useQuery({
    queryKey: qk.sync.sessions,
    queryFn: async () => (await syncRuntime.account()?.sessions()) ?? [],
  });
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  return (
    <div className="flex w-full flex-col gap-2">
      <FieldError message={errorText(error)} />
      <ul
        aria-label="Signed in devices"
        className="flex flex-col divide-y divide-border/60 rounded-lg border border-border bg-card"
      >
        {ordered.map((session) => (
          <DeviceRow key={session.id} session={session} />
        ))}
      </ul>
    </div>
  );
}
