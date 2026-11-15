import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { activePath } from "./workspace.ts";
import { useWorkspace } from "./workspace-store.ts";

/// A window narrowed past 600 (Slide Over, a small Stage Manager window) takes the phone's
/// shell: it shows the page the tablet's focused tab showed, which the router may not be
/// on (tabs change without it). Widened again, the tablet's tabs stand as they were and the
/// follower opens what the phone went to.
export function useHandOver(tablet: boolean, pathname: string) {
  const router = useRouter();
  const was = useRef(tablet);
  useEffect(() => {
    const before = was.current;
    was.current = tablet;
    if (!before || tablet) return;
    const path = activePath(useWorkspace.getState().ws);
    // SAFETY: a tab only ever holds a page route's path (`pages.tsx`).
    if (path !== pathname) router.navigate(path as never);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only a change of shell hands over
  }, [tablet]);
}
