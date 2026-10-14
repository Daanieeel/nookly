import { ApiClient, type DeviceInfo } from "@nookly/shared/api";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useStore } from "zustand";
import { keychainTokens, reindexEntities, tauriSqlDriver } from "#/lib/api/sync.ts";
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

let refreshViews: () => void = () => {};

/// This device's sync, one for the app.
export const syncRuntime = new SyncRuntime<ApiClient>({
  driver: tauriSqlDriver,
  connect: (baseUrl, onSignedOut) =>
    new ApiClient({ baseUrl, tokens: keychainTokens, onSignedOut }),
  device: thisDevice(),
  reindex: reindexEntities,
  onApplied: () => refreshViews(),
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
    const serverUrl = settings.get("sync.serverUrl");
    void syncRuntime.restore(serverUrl || null).then(() => {
      void queryClient.invalidateQueries({ queryKey: qk.sync.root });
    });
    return () => {
      stop();
      syncRuntime.stop();
    };
  }, [queryClient]);
}
