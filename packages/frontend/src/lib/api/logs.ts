import { invoke } from "@tauri-apps/api/core";

/// Opens the folder with Nookly's log files in the file manager.
export function openLogsFolder(): Promise<void> {
  return invoke("open_logs_folder");
}
