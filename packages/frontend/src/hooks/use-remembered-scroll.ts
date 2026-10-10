import { type RefObject, useLayoutEffect } from "react";

/// Where each scroller was left, per key. Lives for the session: a tab's view
/// unmounts when another tab takes over, so the position has to outlive it.
const positions = new Map<string, number>();

/// Forgets every position whose key starts with `prefix`, such as the `tab:<id>:` of a
/// tab that was closed.
export function forgetScroll(prefix: string): void {
  for (const key of positions.keys()) {
    if (key.startsWith(prefix)) positions.delete(key);
  }
}

/// How many frames a restore keeps trying while the content is not tall enough yet.
const MAX_RESTORE_FRAMES = 60;

/// Puts the element at `ref` back where the user left it under `key`, and
/// keeps that position up to date while they scroll. A key nobody scrolled under
/// starts at the top, so a scroller reused for another view does not carry the last
/// one's position along. `ready` holds the restore back until the content is
/// tall enough to scroll that far. A list that loads after the view mounts is
/// waited for: the restore retries for about a second, and the scrolls it causes along
/// the way are not taken for the user's.
export function useRememberedScroll(
  ref: RefObject<HTMLElement | null>,
  key: string,
  ready = true,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const saved = positions.get(key) ?? 0;
    el.scrollTop = saved;
    let restoring = el.scrollTop !== saved;
    let frame = 0;
    let frames = 0;
    const retry = () => {
      el.scrollTop = saved;
      if (el.scrollTop === saved || ++frames >= MAX_RESTORE_FRAMES) {
        restoring = false;
        return;
      }
      frame = requestAnimationFrame(retry);
    };
    if (restoring) frame = requestAnimationFrame(retry);
    const onScroll = () => {
      if (!restoring) positions.set(key, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref, key, ready]);
}
