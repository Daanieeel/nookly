import type { PageSession } from "@nookly/shared/sync";
import { useEffect, useState } from "react";
import { useAppData, useSyncState } from "../data/context.tsx";
import { useEntity } from "../data/queries.ts";

/// A page made a moment ago may not have reached the server yet, which then refuses its
/// document. While the phone is online, such a page asks again a few times before it
/// settles for its rows, so a page made on the phone opens live.
const FRESH_MS = 120_000;
const RETRIES = 3;
const RETRY_AFTER_MS = 3000;

export type PageSessionState =
  | { state: "rows" }
  | { state: "waiting" }
  | { state: "live"; session: PageSession };

/// The page's live document while this phone is signed in and has it (or can get it);
/// otherwise the page edits its rows as before (DECISIONS.md D6).
export function usePageSession(entityId: string): PageSessionState {
  const { sync } = useAppData();
  const signedIn = useSyncState((s) => s.user !== null && s.status.state !== "off");
  const online = useSyncState((s) => s.status.state !== "offline");
  const { data: entity } = useEntity(entityId);
  const created = entity ? Date.parse(entity.createdAt) : 0;
  const [state, setState] = useState<PageSessionState>({ state: "rows" });
  useEffect(() => {
    const docs = signedIn ? sync.pages() : null;
    if (!docs) {
      setState({ state: "rows" });
      return;
    }
    let live = true;
    let opened = false;
    setState({ state: "waiting" });
    const attempt = async (left: number) => {
      const session = await docs.open(entityId);
      if (!live) {
        if (session) docs.release(entityId);
        return;
      }
      if (!session && left > 0 && online && Date.now() - created < FRESH_MS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
        if (live) await attempt(left - 1);
        return;
      }
      opened = session !== null;
      setState(session ? { state: "live", session } : { state: "rows" });
    };
    void attempt(RETRIES);
    return () => {
      live = false;
      if (opened) docs.release(entityId);
    };
    // The page's age and the connection are read when the page opens, not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, signedIn, sync, created === 0]);
  return state;
}
