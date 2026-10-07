import { IconRestore } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect } from "react";
import { create } from "zustand";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { FieldError, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  type BackupInfo,
  type BackupManifest,
  inspectBackup,
  restoreBackup,
} from "#/lib/api/backup.ts";
import { formatDateTime } from "#/lib/datetime.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { formatSize, useBackups } from "./backup-data.ts";

/// Restoring from the Backup tab: pick a file or a listed backup, then confirm with
/// the typed phrase before everything is replaced.

interface RestoreTarget {
  path: string;
  manifest: BackupManifest;
}

/// The backup waiting for confirmation. Shared because the button and the list sit
/// in different parts of the tab.
const useRestoreTarget = create<{
  target: RestoreTarget | null;
  setTarget: (target: RestoreTarget | null) => void;
}>((set) => ({ target: null, setTarget: (target) => set({ target }) }));

/// Picks a backup file from disk to restore.
export function RestoreFileControl() {
  const setTarget = useRestoreTarget((s) => s.setTarget);
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
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => !pickFile.isPending && pickFile.mutate()}
      >
        <IconRestore size={14} />
        From a file
      </Button>
      <FieldError message={pickFile.isError && pickFile.error.message} />
    </div>
  );
}

/// The backups found in the chosen folder, each with a Restore button, and the
/// confirmation dialog both ways of restoring end in.
export function BackupList() {
  const [folder] = useSetting("backup.folder");
  const backups = useBackups(folder);
  const { setTarget } = useRestoreTarget.getState();
  // A confirmation left open by an unmounted tab must not greet the next visit.
  useEffect(() => () => useRestoreTarget.getState().setTarget(null), []);
  return (
    <>
      <BackupRows
        backups={backups.data ?? []}
        loading={backups.isLoading}
        hasFolder={folder !== null}
        onRestore={(b) => b.manifest && setTarget({ path: b.path, manifest: b.manifest })}
      />
      <RestoreDialog />
    </>
  );
}

function BackupRows({
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

/// Confirms replacing everything in Nookly with a backup, then restarts to install it.
function RestoreDialog() {
  const target = useRestoreTarget((s) => s.target);
  const setTarget = useRestoreTarget((s) => s.setTarget);
  const restore = useMutation({
    mutationFn: async (path: string) => {
      await restoreBackup(path);
      await relaunch();
    },
  });
  const status = statusOf(restore);
  const manifest = target?.manifest;

  return (
    <ConfirmPermanentDialog
      open={target !== null}
      onOpenChange={(next) => {
        if (next || restore.isPending) return;
        restore.reset();
        setTarget(null);
      }}
      title="Replace everything with this backup?"
      description={
        manifest && (
          <>
            Nookly goes back to the backup from{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              {formatDateTime(manifest.createdAt)}
            </code>
            . Everything you added or changed since then is replaced. Your current data is set aside
            in a restore-safety folder inside the Nookly data folder, so nothing is deleted. Nookly
            restarts to finish.
            {manifest.referencedFiles > 0 && (
              <span className="mt-2 block text-xs">
                {manifest.referencedFiles === 1
                  ? "1 file added by reference is not in the backup. It stays where it is."
                  : `${manifest.referencedFiles} files added by reference are not in the backup. They stay where they are.`}
              </span>
            )}
          </>
        )
      }
      stats={
        manifest
          ? [
              { value: manifest.fileCount, label: "Stored files" },
              { value: formatSize(manifest.bytes), label: "Total size" },
            ]
          : []
      }
      phrase="RESTORE"
      actionLabel="Replace and Restart"
      errorLabel="Couldn't restore, try again"
      status={status}
      error={restore.isError && restore.error.message}
      onConfirm={() => {
        if (target) restore.mutate(target.path);
      }}
    />
  );
}
