import { ApiClient, type DeviceInfo } from "@nookly/shared/api";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { useStore } from "zustand";
import {
  keychainTokens,
  preSyncBackup,
  reindexEntities,
  tauriBlobs,
  tauriSqlDriver,
} from "#/lib/api/sync.ts";
import { resumeWhenBack } from "./resume-when-back.ts";
import { settingsBridge } from "./settings-bridge.ts";
import { qk } from "#/lib/query-keys.ts";
import { settings } from "#/lib/settings/settings.ts";
import { SyncRuntime, type SyncAccountState } from "@nookly/shared/sync";

function thisDevice(): DeviceInfo {
  const agent = globalThis.navigator?.userAgent ?? "";
  const platform = agent.includes("Mac")
    ? "macos"
    : agent.includes("Windows")
      ? "windows"
      : agent.includes("Linux")
        ? "linux"
        : "other";
  const names = {
    macos: "Mac",
    windows: "Windows PC",
    linux: "Linux PC",
    other: "Computer",
  } as const;
  return { name: `Nookly on ${names[platform]}`, platform };
}

/// What this computer is called to the account: the name the person gave it, found once
/// after launch. Until then (and where it can't be read) the generic "Nookly on Mac" stands,
/// and the name is only read when a sign in sends it.
const device = thisDevice();
void invoke<string | null>("sync_computer_name")
  .then((name) => {
    if (name) device.name = name;
  })
  .catch(() => {});

let refreshViews: () => void = () => {};

/// This device's sync, one for the app.
export const syncRuntime = new SyncRuntime<ApiClient>({
  driver: tauriSqlDriver,
  connect: (baseUrl, onSignedOut) =>
    new ApiClient({ baseUrl, tokens: keychainTokens, onSignedOut }),
  device,
  // The browser goes back to a port on this computer (`src-tauri/src/sync/loopback.rs`).
  providerBrowser: async (begin) => {
    const port = await invoke<number>("oauth_loopback_start");
    try {
      await openUrl(await begin(port));
    } catch (error) {
      await invoke("oauth_loopback_cancel").catch(() => {});
      throw error;
    }
    const returned = await invoke<string | null>("oauth_loopback_wait");
    if (returned)
      void getCurrentWindow()
        .setFocus()
        .catch(() => {});
    return returned;
  },
  cancelProviderBrowser: () => void invoke("oauth_loopback_cancel").catch(() => {}),
  reindex: reindexEntities,
  onApplied: () => refreshViews(),
  backup: (keep) => preSyncBackup(keep),
  blobs: (serverUrl) => tauriBlobs(serverUrl),
  settings: settingsBridge,
});

export function useSyncState<T>(selector: (state: SyncAccountState) => T): T {
  return useStore(syncRuntime.store, selector);
}

/// Matches `EXTERNAL_CHANGE_EVENT` in `src-tauri/src/db/mod.rs`.
const EXTERNAL_CHANGE_EVENT = "db:external-change";

function watchLocalChanges(queryClient: QueryClient): () => void {
  // Every write in the app is a mutation; the CLI's writes arrive as an event.
  const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.mutation.state.status === "success") {
      syncRuntime.notifyLocalChange();
    }
  });
  const unlisten = listen(EXTERNAL_CHANGE_EVENT, () => syncRuntime.notifyLocalChange());
  return () => {
    unsubscribe();
    void unlisten.then((stop) => stop());
  };
}

/// Starts sync on launch when this device is signed in, and keeps it told about
/// local changes. Changes from elsewhere refresh every view.
export function useSyncBootstrap() {
  const queryClient = useQueryClient();
  useEffect(() => {
    refreshViews = () => {
      void queryClient.invalidateQueries();
    };
    const stop = watchLocalChanges(queryClient);
    const stopResuming = resumeWhenBack(syncRuntime);
    const serverUrl = settings.get("sync.serverUrl");
    void syncRuntime.restore(serverUrl || null).then(() => {
      void queryClient.invalidateQueries({ queryKey: qk.sync.root });
    });
    return () => {
      stop();
      stopResuming();
      syncRuntime.stop();
    };
  }, [queryClient]);
}
