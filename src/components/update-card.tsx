import { IconAlertTriangle, IconDownload, IconLoader2 } from "@tabler/icons-react";
import { StatusAnnouncer } from "@/components/action-feedback";
import { useAppUpdate, useUpdateInstall } from "@/lib/updater";
import { cn } from "@/lib/utils";

/// Caution card announcing a newer release. Clicking it downloads and installs
/// the update, then restarts the app. Renders nothing while up to date.
export function UpdateCard({ className }: { className?: string }) {
  const { data: update } = useAppUpdate();
  const state = useUpdateInstall((s) => s.state);
  const install = useUpdateInstall((s) => s.install);

  if (!update) return null;

  const pending = state.status === "pending";
  const failed = state.status === "error";
  const title = pending
    ? state.progress === null
      ? "Installing update..."
      : `Installing update... ${Math.round(state.progress * 100)}%`
    : failed
      ? "Couldn't update"
      : "Update available";
  const detail = pending
    ? "Nookly restarts when done."
    : failed
      ? "Click to try again."
      : `Version ${update.version} is ready. Click to install and restart.`;

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      title={failed ? state.message : undefined}
      onClick={() => void install(update)}
      className={cn(
        "flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        failed
          ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-caution/50 bg-caution/10 text-caution hover:bg-caution/20",
        pending && "cursor-default hover:bg-caution/10",
        className,
      )}
    >
      {pending ? (
        <IconLoader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
      ) : failed ? (
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <IconDownload className="mt-0.5 size-4 shrink-0" />
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{detail}</span>
      </span>
      <StatusAnnouncer
        message={pending ? "Installing update" : failed ? "Couldn't install the update" : null}
      />
    </button>
  );
}
