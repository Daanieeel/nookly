import { type RefObject, useLayoutEffect } from "react";

interface Position {
  top: number;
  left: number;
}

/// Where each scroller was left, per key. Lives for the session: a tab's view
/// unmounts when another tab takes over, so the position has to outlive it.
const positions = new Map<string, Position>();

/// Forgets every position whose key starts with `prefix`, such as the `tab:<id>:` of a
/// tab that was closed.
export function forgetScroll(prefix: string): void {
  for (const key of positions.keys()) {
    if (key.startsWith(prefix)) positions.delete(key);
  }
}

/// How many frames a restore keeps trying while the content is not tall enough yet.
const MAX_RESTORE_FRAMES = 600;

/// What the user does to take over scrolling, which ends a restore that is still trying.
const TAKEOVER_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/// Puts the element at `ref` back where the user left it under `key`, down and across, and
/// keeps that position up to date while they scroll. A key nobody scrolled under
/// starts at the top left, so a scroller reused for another view does not carry the last
/// one's position along. `ready` holds the restore back until the content is
/// big enough to scroll that far. A list that loads after the view mounts is
/// waited for: the restore retries for up to ten seconds, until the user scrolls themselves, and the scrolls it causes along
/// the way are not taken for the user's.
export function useRememberedScroll(
  ref: RefObject<HTMLElement | null>,
  key: string,
  ready = true,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const saved = positions.get(key) ?? { top: 0, left: 0 };
    const place = () => {
      el.scrollTop = saved.top;
      el.scrollLeft = saved.left;
      return el.scrollTop === saved.top && el.scrollLeft === saved.left;
    };
    let restoring = !place();
    let frame = 0;
    let frames = 0;
    const takeOver = () => {
      restoring = false;
      cancelAnimationFrame(frame);
    };
    const retry = () => {
      if (!restoring) return;
      if (place() || ++frames >= MAX_RESTORE_FRAMES) {
        restoring = false;
        return;
      }
      frame = requestAnimationFrame(retry);
    };
    if (restoring) {
      frame = requestAnimationFrame(retry);
      for (const type of TAKEOVER_EVENTS) el.addEventListener(type, takeOver, { passive: true });
    }
    const onScroll = () => {
      if (!restoring) positions.set(key, { top: el.scrollTop, left: el.scrollLeft });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      for (const type of TAKEOVER_EVENTS) el.removeEventListener(type, takeOver);
    };
  }, [ref, key, ready]);
}
