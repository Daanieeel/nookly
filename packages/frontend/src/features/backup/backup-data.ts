import { useMutation, useQuery } from "@tanstack/react-query";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { listBackups } from "#/lib/api/backup.ts";
import { preferences } from "#/lib/preferences.ts";
import { qk } from "#/lib/query-keys.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";

export function useBackups(folder: string | null) {
  return useQuery({
    queryKey: qk.backups.inFolder(folder),
    queryFn: () => listBackups(folder ?? ""),
    enabled: folder !== null,
  });
}

/// Asks for a backup folder and saves the choice.
export function useChooseBackupFolder() {
  const [folder] = useSetting("backup.folder");
  return useMutation({
    mutationFn: async () => {
      const picked = await pickPath({
        directory: true,
        multiple: false,
        defaultPath: folder ?? undefined,
        title: "Choose a backup folder",
      });
      if (!picked) return;
      settings.set("backup.folder", picked);
      preferences.remove(STORAGE_KEYS.backupError);
    },
  });
}

export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
