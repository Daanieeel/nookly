import { IconAlertTriangle, IconArchive, IconFolder, IconRestore } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Switch } from "@nookly/ui/components/switch";
import {
  BACKUP_KEEP,
  type BackupInfo,
  type BackupManifest,
  inspectBackup,
  listBackups,
  restoreBackup,
} from "#/lib/api/backup.ts";
import { formatDateTime } from "#/lib/datetime.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { BACKUPS_KEY, autoBackupEnabled, backupFolder, runBackup } from "./backup-run.ts";

export function useBackups(folder: string | null) {
  return useQuery({
    queryKey: [BACKUPS_KEY, folder],
    queryFn: () => listBackups(folder ?? ""),
    enabled: folder !== null,
  });
}

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

interface RestoreTarget {
  path: string;
  manifest: BackupManifest;
}

/// Shortens a long path from the middle so the last segment always stays visible.
function MiddleTruncatedPath({ path }: { path: string }) {
  const end = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const head = end > 0 ? path.slice(0, end) : "";
  const tail = end > 0 ? path.slice(end) : path;
  return (
    <span className="flex min-w-0 text-sm" title={path}>
      <span className="min-w-0 truncate">{head}</span>
      <span className="max-w-full shrink-0 truncate">{tail}</span>
    </span>
  );
}

/// Where the whole app is backed up to a folder, on demand or daily, and where a
/// backup is restored. Point the folder into iCloud Drive, Google Drive or Dropbox
/// to keep the backups off this computer.
export function BackupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState(backupFolder);
  const [auto, setAuto] = useState(autoBackupEnabled);
  const [target, setTarget] = useState<RestoreTarget | null>(null);
  const backups = useBackups(folder);
  const lastError = preferences.get(STORAGE_KEYS.backupError);

  const choose = useMutation({
    mutationFn: async () => {
      const picked = await pickPath({
        directory: true,
        multiple: false,
        defaultPath: folder ?? undefined,
        title: "Choose a backup folder",
      });
      if (!picked) return;
      preferences.set(STORAGE_KEYS.backupFolder, picked);
      preferences.remove(STORAGE_KEYS.backupError);
      setFolder(picked);
    },
  });
  const backUp = useMutation({ mutationFn: () => runBackup(queryClient) });
  const pickFile = useMutation({
    mutationFn: async () => {
      const picked = await pickPath({
        multiple: false,
        filters: [{ name: "Nookly backup", extensions: ["zip"] }],
        title: "Choose a backup to restore",
      });
      if (!picked) return;
      setTarget({ path: picked, manifest: await inspectBackup(picked) });
    },
  });

  const backUpStatus = statusOf(backUp);
  const error =
    (backUp.isError && backUp.error.message) ||
    (pickFile.isError && pickFile.error.message) ||
    (choose.isError && choose.error.message) ||
    lastError;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Backup</DialogTitle>
            <DialogDescription>
              Saves everything in Nookly to one file: every Space, note, file, deck and setting.
              Choose a folder in iCloud Drive, Google Drive or Dropbox to keep your backups off this
              computer.
            </DialogDescription>
          </DialogHeader>

          <section className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-xs font-medium text-muted-foreground">Folder</span>
                {folder ? (
                  <MiddleTruncatedPath path={folder} />
                ) : (
                  <span className="truncate text-sm">No folder chosen</span>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => !choose.isPending && choose.mutate()}
              >
                <IconFolder size={14} />
                {folder ? "Change" : "Choose"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="backup-auto" className="flex flex-col">
                <span className="text-sm">Back up every day</span>
                <span className="text-xs text-muted-foreground">
                  Runs when Nookly is open. Keeps the newest {BACKUP_KEEP} backups.
                </span>
              </label>
              <Switch
                id="backup-auto"
                checked={auto}
                disabled={!folder}
                onCheckedChange={(next) => {
                  preferences.set(STORAGE_KEYS.backupAuto, next ? "1" : "0");
                  setAuto(next);
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Files added by reference stay where they are and are not copied.
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={!folder}
                onClick={() => !backUp.isPending && backUp.mutate()}
              >
                <StatusButtonContent
                  status={backUpStatus}
                  icon={<IconArchive size={14} />}
                  label="Back up now"
                  successLabel="Backed up"
                  errorLabel="Couldn't back up"
                />
              </Button>
            </div>
            <FieldError message={error} />
          </section>

          <section className="flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Restore</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => !pickFile.isPending && pickFile.mutate()}
              >
                <IconRestore size={14} />
                From a file
              </Button>
            </div>
            <BackupList
              backups={backups.data ?? []}
              loading={backups.isLoading}
              hasFolder={folder !== null}
              onRestore={(b) => b.manifest && setTarget({ path: b.path, manifest: b.manifest })}
            />
          </section>
        </DialogContent>
      </Dialog>
      <RestoreDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function BackupList({
  backups,
  loading,
  hasFolder,
  onRestore,
}: {
  backups: BackupInfo[];
  loading: boolean;
  hasFolder: boolean;
  onRestore: (backup: BackupInfo) => void;
}) {
  if (!hasFolder || loading) return null;
  if (backups.length === 0) {
    return <p className="text-xs text-muted-foreground">No backups in this folder yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {backups.map((backup) => (
        <li key={backup.path} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm">
              {backup.manifest ? formatDateTime(backup.manifest.createdAt) : backup.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {backup.manifest
                ? `${formatSize(backup.size)}, Nookly ${backup.manifest.appVersion}`
                : "Can't be read"}
            </span>
          </div>
          {backup.manifest && (
            <Button variant="ghost" size="sm" onClick={() => onRestore(backup)}>
              <IconRestore size={14} />
              Restore
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/// Confirms replacing everything in Nookly with a backup, then restarts to install it.
function RestoreDialog({ target, onClose }: { target: RestoreTarget | null; onClose: () => void }) {
  const restore = useMutation({
    mutationFn: async (path: string) => {
      await restoreBackup(path);
      await relaunch();
    },
  });
  const status = statusOf(restore);
  const manifest = target?.manifest;

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(next) => {
        if (next || restore.isPending) return;
        restore.reset();
        onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-1.5">
            <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
            Replace everything with this backup?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {manifest && (
              <>
                Nookly goes back to the backup from{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  {formatDateTime(manifest.createdAt)}
                </code>
                . Everything you added or changed since then is replaced. Your current data is set
                aside in a restore-safety folder inside the Nookly data folder, so nothing is
                deleted. Nookly restarts to finish.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {manifest && (
          <div className="grid grid-cols-2 gap-2">
            <Stat value={String(manifest.fileCount)} label="Stored files" />
            <Stat value={formatSize(manifest.bytes)} label="Total size" />
          </div>
        )}
        {manifest && manifest.referencedFiles > 0 && (
          <p className="text-xs text-muted-foreground">
            {manifest.referencedFiles === 1
              ? "1 file added by reference is not in the backup. It stays where it is."
              : `${manifest.referencedFiles} files added by reference are not in the backup. They stay where they are.`}
          </p>
        )}
        <FieldError message={restore.isError && restore.error.message} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              if (target && (status === "idle" || status === "error")) {
                restore.mutate(target.path);
              }
            }}
          >
            <StatusButtonContent
              status={status}
              label="Replace and Restart"
              errorLabel="Couldn't restore, try again"
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
