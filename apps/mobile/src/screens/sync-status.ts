import type { SyncStatus } from "@nookly/shared/sync";

/// Sync's state in one short line, for Settings and the sidebar.
export function statusText(status: SyncStatus): string {
  const { state, pending, error, lastSyncedAt } = status;
  if (state === "syncing") return "Syncing";
  if (state === "offline")
    return pending > 0
      ? `Offline. ${pending} ${pending === 1 ? "change waits" : "changes wait"} to sync.`
      : "Offline.";
  if (state === "error") return error ?? "Sync failed.";
  if (state === "off") return "Sync is off.";
  return lastSyncedAt
    ? `Synced at ${new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "Synced";
}

/// The sidebar's line under Settings.
export function syncLine(signedIn: boolean, status: SyncStatus): string {
  if (!signedIn) return "Sync is off";
  if (status.conflicts > 0) {
    return `${status.conflicts} ${status.conflicts === 1 ? "change needs" : "changes need"} a look`;
  }
  return statusText(status);
}
