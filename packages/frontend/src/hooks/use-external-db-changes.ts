import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/// Matches `EXTERNAL_CHANGE_EVENT` in `src-tauri/src/db/mod.rs`.
const EXTERNAL_CHANGE_EVENT = "db:external-change";

/// Refetches every active query when another process (the CLI, usually an agent)
/// writes to the database, so open views pick up its edits without navigating away.
export function useExternalDbChanges() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unlistenPromise = listen(EXTERNAL_CHANGE_EVENT, () => {
      void queryClient.invalidateQueries();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [queryClient]);
}
