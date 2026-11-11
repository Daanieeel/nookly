import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ignoreError } from "#/lib/log.ts";
import { refreshDatabaseData } from "#/lib/refresh-data.ts";

/// Matches `EXTERNAL_CHANGE_EVENT` in `src-tauri/src/db/mod.rs`.
const EXTERNAL_CHANGE_EVENT = "db:external-change";

/// How long writes must stop for before the screen refreshes. An agent writing in a loop
/// sends a burst of events; they become one refresh.
const SETTLE_MS = 300;

/// Refetches the queries on screen that read the database when another process (the CLI,
/// usually an agent) writes to it, so open views pick up its edits without navigating away.
export function useExternalDbChanges() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlistenPromise = listen(EXTERNAL_CHANGE_EVENT, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refreshDatabaseData(queryClient), SETTLE_MS);
    });
    return () => {
      clearTimeout(timer);
      void unlistenPromise
        .then((unlisten) => unlisten())
        .catch(ignoreError("stopping to listen for outside changes"));
    };
  }, [queryClient]);
}
