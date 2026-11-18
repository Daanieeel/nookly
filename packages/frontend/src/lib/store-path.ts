import { invoke } from "@tauri-apps/api/core";

let dir: Promise<string | null> | null = null;

/// Where the store plugin keeps `name`: the platform app data folder in a release
/// build, and a debug build's own data folder (`.dev-data`), so development never
/// reads or changes the installed app's settings (`commands::settings_file::store_dir`).
export async function storePath(name: string): Promise<string> {
  dir ??= invoke<string | null>("store_dir").catch(() => null);
  const base = await dir;
  return base ? `${base.replace(/[\\/]+$/, "")}/${name}` : name;
}
