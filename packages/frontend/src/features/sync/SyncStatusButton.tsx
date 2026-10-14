import type { SyncAccountState } from "@nookly/shared/sync";
import {
  IconAlertTriangle,
  IconCloud,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUp,
  IconCloudX,
  IconRefresh,
} from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { useAccountDialog } from "./account-dialog-store.ts";
import { useSyncState } from "./sync-instance.ts";

type Summary = {
  label: string;
  icon: typeof IconCloud;
  tone: string;
  spin?: boolean;
  /// What a click opens.
  opens: "account" | "settings" | "firstSync" | "conflicts";
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/// The sync state in a few words, for the titlebar: synced, syncing, offline,
/// stopped, or changes that need a look.
export function syncSummary(
  state: Pick<SyncAccountState, "user" | "status" | "migration" | "files">,
): Summary {
  const { user, status, migration, files } = state;
  if (!user) {
    return {
      label: "Not syncing. Sign in to sync.",
      icon: IconCloud,
      tone: "text-muted-foreground",
      opens: "account",
    };
  }
  if (migration && migration.phase !== "done") {
    if (migration.phase === "failed") {
      return {
        label: "The first sync stopped before sending anything",
        icon: IconAlertTriangle,
        tone: "text-destructive",
        opens: "firstSync",
      };
    }
    const total = migration.items + migration.files;
    const sent = migration.itemsSent + migration.filesSent;
    const share = total === 0 ? 0 : Math.floor((sent / total) * 100);
    return {
      label: `Bringing this device into your account, ${share}%`,
      icon: IconCloudUp,
      tone: "text-muted-foreground",
      opens: "firstSync",
    };
  }
  if (status.conflicts > 0) {
    return {
      label: `${plural(status.conflicts, "change needs", "changes need")} a look`,
      icon: IconAlertTriangle,
      tone: "text-caution",
      opens: "conflicts",
    };
  }
  switch (status.state) {
    case "syncing":
      return {
        label: "Syncing",
        icon: IconRefresh,
        tone: "text-muted-foreground",
        spin: true,
        opens: "settings",
      };
    case "offline":
      return {
        label:
          status.pending > 0
            ? `Offline. ${plural(status.pending, "change waits", "changes wait")} to sync.`
            : "Offline. Changes sync when you're back.",
        icon: IconCloudOff,
        tone: "text-caution",
        opens: "settings",
      };
    case "error":
      return {
        label: `Sync stopped: ${status.error ?? "unknown error"}`,
        icon: IconCloudX,
        tone: "text-destructive",
        opens: "settings",
      };
    default:
      break;
  }
  const sending = files ? files.toUpload + files.toDownload : 0;
  if (sending > 0) {
    return {
      label: `Syncing ${plural(sending, "file", "files")}`,
      icon: IconCloudUp,
      tone: "text-muted-foreground",
      opens: "settings",
    };
  }
  return {
    label: "Synced",
    icon: IconCloudCheck,
    tone: "text-muted-foreground",
    opens: "settings",
  };
}

/// A quiet sync indicator in the titlebar. Its tooltip says when it last synced.
export function SyncStatusButton() {
  const user = useSyncState((s) => s.user);
  const status = useSyncState((s) => s.status);
  const migration = useSyncState((s) => s.migration);
  const files = useSyncState((s) => s.files);
  const summary = syncSummary({ user, status, migration, files });
  const Icon = summary.icon;
  const open = () => {
    if (summary.opens === "account") useAccountDialog.getState().show("signIn");
    else if (summary.opens === "firstSync") useAccountDialog.getState().setFirstSyncOpen(true);
    else if (summary.opens === "conflicts") useAccountDialog.getState().setMergeOpen(true);
    else useNavStore.getState().openSettingsAt("sync");
  };
  const when =
    user && status.lastSyncedAt && status.state === "idle"
      ? `Last synced ${formatEditedAt(new Date(status.lastSyncedAt).toISOString()).toLowerCase()}`
      : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="iconSm" aria-label={summary.label} onClick={open}>
          <Icon size={14} className={cn(summary.tone, summary.spin && "animate-spin")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {summary.label}
        {when && <span className="block text-muted-foreground">{when}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
