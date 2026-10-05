import { type RefObject, useLayoutEffect } from "react";

/// Where each scroller was left, per key. Lives for the session: a tab's view
/// unmounts when another tab takes over, so the position has to outlive it.
const positions = new Map<string, number>();

/// Puts the element at `ref` back where the user left it under `key`, and
/// keeps that position up to date while they scroll. `ready` holds the restore
/// back until the content is tall enough to scroll that far.
export function useRememberedScroll(
  ref: RefObject<HTMLElement | null>,
  key: string,
  ready = true,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const saved = positions.get(key);
    if (saved) el.scrollTop = saved;
    const onScroll = () => positions.set(key, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, key, ready]);
}
