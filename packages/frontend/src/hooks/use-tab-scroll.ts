import type { RefObject } from "react";
import { useNavStore, viewKey } from "#/lib/store/nav.ts";
import { useRememberedScroll } from "./use-remembered-scroll.ts";

/// Remembers where `ref` was scrolled in the current tab, per view. `part` tells apart
/// the scrollers one view has (the page, a board). Closing the tab forgets it.
export function useTabScroll(ref: RefObject<HTMLElement | null>, part: string, ready = true): void {
  const activeTabId = useNavStore((s) => s.activeTabId);
  const view = useNavStore((s) => s.view);
  useRememberedScroll(ref, `tab:${activeTabId}:${viewKey(view)}:${part}`, ready);
}
