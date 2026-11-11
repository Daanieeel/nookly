import { IconAlertTriangle, IconArchive, IconCircleCheck, IconFolder } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@nookly/ui/lib/utils";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Switch } from "@nookly/ui/components/switch";
import { preferences } from "#/lib/preferences.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { formatSize, useBackups, useChooseBackupFolder } from "./backup-data.ts";
import { runBackup } from "./backup-run.ts";

/// The controls of the Backup tab in Settings: where backups go, whether one runs
/// every day, and a backup on demand. Restoring lives in `backup-restore.tsx`.

/// Choosing the folder. Where it is now shows on the status card above.
export function BackupFolderControl() {
  const [folder] = useSetting("backup.folder");
  const choose = useChooseBackupFolder();
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        onClick={() => !choose.isPending && choose.mutate()}
      >
        <IconFolder size={14} />
        {folder ? "Change folder" : "Choose folder"}
      </Button>
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

/// How the backups are doing, and a button to make one now: when the newest was made and how
/// big it is, where backups go, and the error of the last failed one, automatic or not.
export function BackupStatusCard() {
  const queryClient = useQueryClient();
  const [folder] = useSetting("backup.folder");
  const [auto] = useSetting("backup.auto");
  const { data: backups } = useBackups(folder);
  const newest = backups?.find((b) => b.manifest);
  const backUp = useMutation({ mutationFn: () => runBackup(queryClient) });
  const error =
    (backUp.isError && backUp.error.message) || preferences.get(STORAGE_KEYS.backupError);
  const created = newest?.manifest?.createdAt;
  return (
    <div
      data-testid="backup-status"
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        error ? "border-destructive/50" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              error
                ? "bg-destructive/10 text-destructive"
                : created
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {error ? (
              <IconAlertTriangle size={18} />
            ) : created ? (
              <IconCircleCheck size={18} />
            ) : (
              <IconArchive size={18} />
            )}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">
              {!folder
                ? "Not set up"
                : created
                  ? `Last backup ${formatEditedAt(created)}`
                  : "No backup yet"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {!folder
                ? "Choose a folder to start backing up."
                : newest
                  ? `${formatSize(newest.size)}. ${auto ? "Backs up every day." : "Daily backups are off."}`
                  : auto
                    ? "The first one runs soon."
                    : "Back up now to make the first one."}
            </span>
          </div>
        </div>
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
      <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <IconFolder size={14} className="shrink-0" />
        <span className="min-w-0 truncate" title={folder ?? undefined}>
          {folder ?? "No folder chosen"}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          The last backup failed: {error}
        </p>
      )}
    </div>
  );
}
