import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type Sample,
  capVelocity,
  isSettled,
  settleTarget,
  springStep,
  velocityOf,
} from "#/lib/space-pager.ts";

/// Used while the stage has no width to measure, as in a test.
const FALLBACK_WIDTH = 240;

/// A swipe has ended when the wheel has been quiet for this long.
const IDLE_MS = 80;

/// Lifting the fingers does not stop the wheel: the trackpad keeps gliding, with events that fade
/// away for a second or more. The fingers count as lifted once this many events in a row were
/// each no bigger than the one before, after a swipe that was going fast enough to glide.
const FADING_EVENTS = 4;
const GLIDING_FROM = 8;

/// The glide of a swipe that ended is ignored until the wheel goes quiet for this long, which is
/// the fingers touching down again (that stops the glide) before a new swipe, however brief the
/// lift was. The glide itself wobbles, so growing events alone are not taken for a new swipe,
/// only a clear jump in size is.
const NEW_SWIPE_GAP_MS = 50;

/// The Space beside the one shown that is sliding in: on the right (`1`, the next one) or left.
interface Neighbor {
  id: string;
  side: 1 | -1;
}

interface Live {
  shownId: string | null;
  neighbor: Neighbor | null;
  /// The drag as the fingers made it, before it is held to one pane and to the Spaces there are.
  raw: number;
  /// Where the shown pane is, in pixels from its resting place. The neighbor is one width away.
  offset: number;
  /// Pixels per millisecond.
  velocity: number;
  dragging: boolean;
  frame: number;
  idle: ReturnType<typeof setTimeout> | undefined;
  samples: Sample[];
  /// The Space a swipe is landing on, already told to the rest of the app while the list arrives.
  pendingId: string | null;
  /// The size and time of the last wheel event, the fastest one of this swipe, and how many in a
  /// row faded: how a glide after lifting the fingers is told from the fingers themselves.
  lastSize: number;
  lastAt: number;
  peak: number;
  fading: number;
  /// Set after the fingers lifted, until the glide is over.
  gliding: boolean;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/// Slides the sidebar between Spaces like a page the fingers hold. A two finger swipe moves the
/// list along with it, the next Space coming in beside it, and stays put at either end. On
/// letting go it settles on the next Space or comes back, by where it was and how fast it was
/// going, and a new swipe can take hold of it at any moment of that. A Space switched to some
/// other way (a click, a key, another tab) slides in the same way. Everything moves through the
/// DOM directly, so a swipe costs no renders besides the neighbor appearing.
export function useSpacePager({
  ids,
  activeId,
  onSwipe,
}: {
  /// Every Space, in order.
  ids: string[];
  /// The Space the rest of the app says is active.
  activeId: string | null;
  /// Called once a swipe has landed on another Space.
  onSwipe: (id: string) => void;
}) {
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const [shownId, setShownState] = useState(activeId);
  const [neighborId, setNeighborState] = useState<string | null>(null);
  const live = useRef<Live>({
    shownId: activeId,
    neighbor: null,
    raw: 0,
    offset: 0,
    velocity: 0,
    dragging: false,
    frame: 0,
    idle: undefined,
    samples: [],
    pendingId: null,
    lastSize: 0,
    lastAt: 0,
    peak: 0,
    fading: 0,
    gliding: false,
  });
  const stage = useRef<HTMLElement | null>(null);
  const panes = useRef(new Map<string, HTMLElement>());
  const paneRefs = useRef(new Map<string, (element: HTMLElement | null) => void>());

  const width = () => stage.current?.clientWidth || FALLBACK_WIDTH;

  const paint = useCallback(() => {
    const state = live.current;
    const span = width();
    for (const [id, element] of panes.current) {
      let x: number | null = null;
      if (id === state.shownId) x = state.offset;
      else if (state.neighbor && id === state.neighbor.id) {
        x = state.offset + state.neighbor.side * span;
      }
      // A transform, even a zero one, makes the pane the container of anything fixed inside it,
      // such as the preview of a dragged row, so a pane at rest has none.
      const resting = x === null || (x === 0 && !state.neighbor);
      element.style.transform = resting ? "" : `translate3d(${x}px, 0, 0)`;
    }
  }, []);

  function setNeighbor(neighbor: Neighbor | null) {
    live.current.neighbor = neighbor;
    setNeighborState(neighbor?.id ?? null);
  }

  function setShown(id: string | null) {
    live.current.shownId = id;
    setShownState(id);
  }

  function stopAnimation() {
    cancelAnimationFrame(live.current.frame);
    live.current.frame = 0;
  }

  /// Springs the shown pane from where it is to `target`, then calls `done`.
  function animateTo(target: number, done: () => void) {
    stopAnimation();
    const state = live.current;
    if (prefersReducedMotion()) {
      state.offset = target;
      state.velocity = 0;
      done();
      return;
    }
    let spring = { x: state.offset, v: capVelocity(state.velocity * 1000, state.offset, target) };
    // The frame times come from the animation frames themselves; the first frame only starts the clock.
    let last: number | null = null;
    const tick = (now: number) => {
      const elapsed = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
      spring = springStep(spring, target, elapsed);
      last = now;
      state.offset = spring.x;
      state.velocity = spring.v / 1000;
      if (isSettled(spring, target)) {
        state.offset = target;
        state.velocity = 0;
        state.frame = 0;
        paint();
        done();
        return;
      }
      paint();
      state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
  }

  /// Puts the drag at `raw`: which Space is beside it, and how far the pane really moved.
  function dragTo(raw: number) {
    const state = live.current;
    const span = width();
    state.raw = raw;
    const side: 1 | -1 = raw < 0 ? 1 : -1;
    const clamped = Math.max(-span, Math.min(span, raw));
    const list = idsRef.current;
    const keep = state.neighbor?.side === side ? state.neighbor.id : undefined;
    const at = state.shownId === null ? -1 : list.indexOf(state.shownId);
    const next = raw === 0 || at === -1 ? undefined : (keep ?? list[at + side]);
    // Past the first or the last Space there is nothing to show, so the list does not move, and what
    // was swiped into that end is not kept: turning around moves at once.
    state.offset = next === undefined ? 0 : clamped;
    if (next === undefined) state.raw = 0;
    const changed = next !== state.neighbor?.id;
    if (changed) setNeighbor(next === undefined ? null : { id: next, side });
    else paint();
  }

  /// A swipe that is still sliding to the Space it chose is as good as there: the list is set down
  /// on that Space, with the one it left now beside it, so the next swipe goes on from it instead
  /// of waiting for the slide to end.
  function landNow() {
    const state = live.current;
    const target = state.neighbor;
    if (!target || state.pendingId !== target.id || state.shownId === null) return;
    const left = state.shownId;
    state.pendingId = null;
    state.offset += target.side * width();
    state.raw = state.offset;
    setShown(target.id);
    setNeighbor({ id: left, side: target.side === 1 ? -1 : 1 });
  }

  /// The fingers are off: settles on the Space the list is closest to, going on or coming back.
  function release(glideFollows: boolean) {
    const state = live.current;
    clearTimeout(state.idle);
    state.idle = undefined;
    state.dragging = false;
    state.gliding = glideFollows;
    state.fading = 0;
    state.peak = 0;
    const velocity = velocityOf(state.samples, performance.now());
    state.samples = [];
    state.velocity = velocity;
    const target = settleTarget({
      offset: state.offset,
      velocity,
      width: width(),
      hasNeighbor: state.neighbor !== null,
    });
    const landing = target === 0 ? null : state.neighbor;
    if (landing) {
      // The rest of the app (the bottom row, the pages) learns of the new Space now, not once the
      // list has arrived; the list is only catching up with it.
      state.pendingId = landing.id;
      onSwipeRef.current(landing.id);
    }
    animateTo(target, () => {
      state.offset = 0;
      state.raw = 0;
      state.pendingId = null;
      if (landing) {
        setShown(landing.id);
        setNeighbor(null);
        return;
      }
      setNeighbor(null);
      paint();
      // It came back to a Space the app was already told to leave, so tell it to return.
      if (state.shownId !== null && state.shownId !== activeIdRef.current) {
        onSwipeRef.current(state.shownId);
      }
    });
  }

  const onWheel = useCallback((event: React.WheelEvent) => {
    const state = live.current;
    const { deltaX, deltaY } = event;
    // Scrolling the list up and down is not a swipe, unless a swipe is already going.
    if (!state.dragging && Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (deltaX === 0) return;
    const now = performance.now();
    const size = Math.abs(deltaX);
    const pause = now - state.lastAt;
    const previous = state.lastSize;
    state.lastSize = size;
    state.lastAt = now;
    if (state.gliding) {
      // Still the tail of the swipe that ended: it fades. A pause, or an event far bigger than the
      // one before, is the fingers coming back for another.
      if (pause <= NEW_SWIPE_GAP_MS && size <= previous * 2 + 4) return;
      state.gliding = false;
    }
    if (!state.dragging) {
      // Takes hold of the list wherever it is, even halfway through settling.
      stopAnimation();
      landNow();
      state.dragging = true;
      state.samples = [];
      state.raw = state.offset;
      state.peak = 0;
      state.fading = 0;
    }
    state.samples.push({ t: now, dx: deltaX });
    state.peak = Math.max(state.peak, size);
    state.fading = size <= previous ? state.fading + 1 : 0;
    dragTo(state.raw - deltaX);
    if (state.fading >= FADING_EVENTS && state.peak >= GLIDING_FROM) {
      release(true);
      return;
    }
    clearTimeout(state.idle);
    state.idle = setTimeout(() => release(false), IDLE_MS);
    // `dragTo` and `release` only read refs and state setters, which never change.
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);

  // Another way of changing the Space (a click, a key, a tab) slides it in from the side it is on.
  useEffect(() => {
    const state = live.current;
    if (activeId === null || activeId === state.shownId || activeId === state.pendingId) return;
    // Picked another way while a swipe was going on: that wins, and the swipe is over.
    clearTimeout(state.idle);
    state.idle = undefined;
    state.dragging = false;
    state.gliding = false;
    state.samples = [];
    state.pendingId = null;
    stopAnimation();
    const list = idsRef.current;
    const from = state.shownId;
    const direction = from === null ? 0 : Math.sign(list.indexOf(activeId) - list.indexOf(from));
    state.offset = 0;
    state.raw = 0;
    state.velocity = 0;
    if (from === null || list.indexOf(from) === -1 || direction === 0 || prefersReducedMotion()) {
      setShown(activeId);
      setNeighbor(null);
      return;
    }
    setShown(activeId);
    setNeighbor({ id: from, side: direction > 0 ? -1 : 1 });
    state.offset = direction * width();
    animateTo(0, () => {
      setNeighbor(null);
      paint();
    });
    // The movement lives in refs; only a new active Space starts one.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [activeId]);

  // A pane that just mounted (the neighbor) is placed before it is ever painted.
  useLayoutEffect(paint);

  useEffect(
    () => () => {
      cancelAnimationFrame(live.current.frame);
      clearTimeout(live.current.idle);
    },
    [],
  );

  const stageRef = useCallback((element: HTMLElement | null) => {
    stage.current = element;
  }, []);

  const paneRef = useCallback((id: string) => {
    let ref = paneRefs.current.get(id);
    if (!ref) {
      ref = (element) => {
        if (element) panes.current.set(id, element);
        else panes.current.delete(id);
      };
      paneRefs.current.set(id, ref);
    }
    return ref;
  }, []);

  return { shownId, neighborId, stageRef, paneRef, onWheel };
}
