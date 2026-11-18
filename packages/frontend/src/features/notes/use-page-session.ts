import type { PageSession } from "@nookly/shared/sync";
import { useEffect, useState } from "react";
import { syncRuntime, useSyncState } from "#/features/sync/sync-instance.ts";

export type PageSessionState =
  | { state: "rows" }
  | { state: "waiting" }
  | { state: "live"; session: PageSession };

/// The page's live document while this device is signed in and has it (or can get
/// it); otherwise the page edits its rows as before (DECISIONS.md D6).
export function usePageSession(entityId: string): PageSessionState {
  const signedIn = useSyncState((s) => s.user !== null && s.status.state !== "off");
  const [state, setState] = useState<PageSessionState>(() =>
    signedIn && syncRuntime.pages() ? { state: "waiting" } : { state: "rows" },
  );
  useEffect(() => {
    const docs = signedIn ? syncRuntime.pages() : null;
    if (!docs) {
      setState({ state: "rows" });
      return;
    }
    let live = true;
    let opened = false;
    setState({ state: "waiting" });
    void docs.open(entityId).then((session) => {
      if (!live) {
        if (session) docs.release(entityId);
        return;
      }
      opened = session !== null;
      setState(session ? { state: "live", session } : { state: "rows" });
    });
    return () => {
      live = false;
      if (opened) docs.release(entityId);
    };
  }, [entityId, signedIn]);
  return state;
}
