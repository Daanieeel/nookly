import type { MigrationState } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconLoader2,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { cn } from "@nookly/ui/lib/utils";
import { MiddleEllipsis } from "#/components/middle-ellipsis.tsx";
import { useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime, useSyncState } from "./sync-instance.ts";

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

type StepState = "waiting" | "running" | "done" | "failed";

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <IconCircleCheck size={16} className="text-positive" />;
  if (state === "failed") return <IconAlertTriangle size={16} className="text-destructive" />;
  if (state === "running")
    return <IconLoader2 size={16} className="animate-spin text-muted-foreground" />;
  return <IconCircleDashed size={16} className="text-muted-foreground" />;
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const share = max === 0 ? 1 : Math.min(1, value / max);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full w-(--progress) rounded-full bg-primary transition-all duration-500"
        // SAFETY: `--progress` only ever receives a percentage; `CSSProperties` just
        // doesn't model custom properties.
        style={{ "--progress": `${Math.round(share * 100)}%` } as CSSProperties}
      />
    </div>
  );
}

function Step({
  state,
  title,
  detail,
  children,
}: {
  state: StepState;
  title: string;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 gap-3">
      <span className="mt-0.5 shrink-0">
        <StepIcon state={state} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2 text-sm">
          <span className={cn(state === "waiting" && "text-muted-foreground")}>{title}</span>
          {detail && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {detail}
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

function steps(m: MigrationState) {
  const order = ["backup", "sending", "checking", "done"] as const;
  const at = m.phase === "failed" ? 0 : order.indexOf(m.phase);
  const state = (index: number): StepState => {
    if (m.phase === "failed") return index === 0 ? "failed" : "waiting";
    if (index < at || m.phase === "done") return "done";
    return index === at ? "running" : "waiting";
  };
  return { backup: state(0), sending: state(1), checking: state(2) };
}

/// The summary of a first sync once it is done, also shown in Settings, Account.
export function migrationSummary(m: MigrationState): string {
  const files = m.files > 0 ? ` and ${plural(m.files, "file", "files")}` : "";
  return `All ${plural(m.items, "item", "items")}${files} are in your account, checked with the server.`;
}

/// Progress of the first sync of a device that had data: the backup, the items and
/// files going up, and the check with the server. It runs in the background either
/// way; this only shows how far it got.
export function FirstSyncDialog() {
  const open = useAccountDialog((s) => s.firstSyncOpen);
  const setOpen = useAccountDialog((s) => s.setFirstSyncOpen);
  const migration = useSyncState((s) => s.migration);
  const retry = useMutation({ mutationFn: () => syncRuntime.retryFirstSync() });
  if (!migration) return null;
  const state = steps(migration);
  const done = migration.phase === "done";
  const failed = migration.phase === "failed";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md grid-cols-1">
        <DialogHeader>
          <DialogTitle>Bringing this device into your account</DialogTitle>
          <DialogDescription>
            Everything here goes into your account, and stays here too. You can keep working while
            it runs.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex min-w-0 flex-col gap-4 py-2">
          <Step
            state={state.backup}
            title={state.backup === "done" ? "Backed up this device" : "Backing up this device"}
          >
            {migration.backupPath && (
              <MiddleEllipsis
                text={migration.backupPath}
                className="text-xs text-muted-foreground"
              />
            )}
          </Step>
          <Step
            state={state.sending}
            title="Sending your items"
            detail={`${count(migration.itemsSent)} of ${plural(migration.items, "item", "items")}`}
          >
            <ProgressBar value={migration.itemsSent} max={migration.items} label="Items sent" />
          </Step>
          {migration.files > 0 && (
            <Step
              state={state.sending}
              title="Sending your files"
              detail={`${count(migration.filesSent)} of ${plural(migration.files, "file", "files")}`}
            >
              <ProgressBar value={migration.filesSent} max={migration.files} label="Files sent" />
            </Step>
          )}
          <Step state={state.checking} title="Checking with the server" />
        </ol>
        {done && (
          <div role="status" className="flex flex-col gap-1 text-sm">
            <p>{migrationSummary(migration)}</p>
            <p className="text-xs text-muted-foreground">
              Nothing on this device was removed, and the backup from before stays where it is.
            </p>
          </div>
        )}
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {migration.error}
          </p>
        )}
        <DialogFooter>
          {failed && (
            <Button size="sm" onClick={() => retry.mutate()}>
              <StatusButtonContent
                status={statusOf(retry)}
                label="Try Again"
                errorLabel="Couldn't start"
              />
            </Button>
          )}
          {done ? (
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            !failed && (
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Keep Going in the Background
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
