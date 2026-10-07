import { IconArchive, IconFolder } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Switch } from "@nookly/ui/components/switch";
import { preferences } from "#/lib/preferences.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useBackups, useChooseBackupFolder } from "./backup-data.ts";
import { runBackup } from "./backup-run.ts";

/// The controls of the Backup tab in Settings: where backups go, whether one runs
/// every day, and a backup on demand. Restoring lives in `backup-restore.tsx`.

export function BackupFolderControl() {
  const [folder] = useSetting("backup.folder");
  const choose = useChooseBackupFolder();
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex min-w-0 items-center justify-end gap-2">
        <span
          className="min-w-0 truncate text-xs text-muted-foreground"
          title={folder ?? undefined}
        >
          {folder ?? "No folder chosen"}
        </span>
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
      <FieldError message={choose.isError && choose.error.message} />
    </div>
  );
}

export function BackupAutoControl() {
  const [folder] = useSetting("backup.folder");
  const [auto, setAuto] = useSetting("backup.auto");
  return (
    <Switch
      aria-label="Back up every day"
      checked={auto}
      disabled={!folder}
      onCheckedChange={setAuto}
    />
  );
}

/// Runs a backup now. Shows when the newest one was made, and the error of the last
/// failed one, automatic or not.
export function BackupNowControl() {
  const queryClient = useQueryClient();
  const [folder] = useSetting("backup.folder");
  const { data: backups } = useBackups(folder);
  const newest = backups?.find((b) => b.manifest)?.manifest?.createdAt;
  const backUp = useMutation({ mutationFn: () => runBackup(queryClient) });
  const error =
    (backUp.isError && backUp.error.message) || preferences.get(STORAGE_KEYS.backupError);
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {!folder ? "Not set up" : newest ? `Last ${formatEditedAt(newest)}` : "No backup yet"}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={!folder}
          onClick={() => !backUp.isPending && backUp.mutate()}
        >
          <StatusButtonContent
            status={statusOf(backUp)}
            icon={<IconArchive size={14} />}
            label="Back up now"
            successLabel="Backed up"
            errorLabel="Couldn't back up"
          />
        </Button>
      </div>
      <FieldError message={error} />
    </div>
  );
}
