import type { RefObject } from "react";
import { useTabGroupScope } from "#/components/tab-group-scope.ts";
import { viewKey } from "#/lib/store/nav.ts";
import { useRememberedScroll } from "./use-remembered-scroll.ts";

/// Remembers where `ref` was scrolled in its group's current tab, per view. `part` tells
/// apart the scrollers one view has (the page, a board). Closing the tab forgets it.
export function useTabScroll(ref: RefObject<HTMLElement | null>, part: string, ready = true): void {
  const { tabId, view } = useTabGroupScope();
  useRememberedScroll(ref, `tab:${tabId}:${viewKey(view)}:${part}`, ready);
}
