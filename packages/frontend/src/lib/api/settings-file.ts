import { invoke } from "@tauri-apps/api/core";

/// Opens `settings.json` in the default editor, creating it first when it does not exist.
export function openSettingsFile(): Promise<void> {
  return invoke("open_settings_file");
}
