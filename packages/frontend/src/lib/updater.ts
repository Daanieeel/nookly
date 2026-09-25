import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";

/// Reads `latest.json` from the newest published GitHub release (endpoint in
/// `src-tauri/tauri.conf.json`). Resolves `null` when already up to date.
export const APP_UPDATE_QUERY_KEY = ["app-update"] as const;

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// The plugin's `ReleaseNotFound`: every endpoint answered with a non success
// status, e.g. 404 before the first release that ships `latest.json`.
const RELEASE_NOT_FOUND = "Could not fetch a valid release JSON from the remote";

export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch (error) {
    // No published manifest means nothing to install, not a failed check.
    if (String(error).includes(RELEASE_NOT_FOUND)) return null;
    throw error;
  }
}

/// Shared by the sidebar card and the settings popover, so one check serves both.
export function useAppUpdate() {
  return useQuery({
    queryKey: APP_UPDATE_QUERY_KEY,
    queryFn: checkForUpdate,
    staleTime: CHECK_INTERVAL_MS,
    refetchInterval: CHECK_INTERVAL_MS,
    refetchOnWindowFocus: false,
    retry: false,
    // `Update` is a class instance holding a resource id; keep it as is.
    structuralSharing: false,
  });
}

export function useAppVersion() {
  return useQuery({ queryKey: ["app-version"], queryFn: getVersion, staleTime: Infinity }).data;
}

type InstallState =
  | { status: "idle" }
  | { status: "pending"; progress: number | null }
  | { status: "error"; message: string };

interface UpdateInstallStore {
  state: InstallState;
  install: (update: Update) => Promise<void>;
}

/// Global so every update card shows the same download progress, wherever it was clicked.
export const useUpdateInstall = create<UpdateInstallStore>((set, get) => ({
  state: { status: "idle" },
  install: async (update) => {
    if (get().state.status === "pending") return;
    set({ state: { status: "pending", progress: null } });
    let total = 0;
    let downloaded = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            set({ state: { status: "pending", progress: Math.min(downloaded / total, 1) } });
          }
        }
      });
      await relaunch();
    } catch (error) {
      set({ state: { status: "error", message: String(error) } });
    }
  },
}));
