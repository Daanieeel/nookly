import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { findZoomAnchor, scrollDeltaForAnchor, type ZoomAnchor } from "./pdf-zoom-anchor";
import { clampScale, fitWidthScale, pinchScale, stepScale } from "./pdf-zoom";
import { SCROLL_PADDING } from "./pdf-pages";

/// The zoom each file was left at, so coming back to its tab shows the same zoom the
/// scroll position was saved under. Lives for the session, like the scroll positions.
const rememberedZoom = new Map<string, number>();

/// The zoom of the viewer: its steps, fit to width, trackpad pinch, and keeping the spot
/// in view where it was while every page changes size.
export function usePdfZoom({
  src,
  scrollRef,
  pageRefs,
  pageNumbers,
  currentPageWidth,
}: {
  src: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  pageRefs: RefObject<Map<number, HTMLDivElement>>;
  pageNumbers: number[];
  /// The width of the page in view at a scale of 1, for fit width.
  currentPageWidth: number;
}) {
  const [scale, setScale] = useState(() => rememberedZoom.get(src) ?? 1);
  useEffect(() => {
    rememberedZoom.set(src, scale);
  }, [src, scale]);

  const zoomIn = () => applyScale(stepScale(scaleRef.current, 1));
  const zoomOut = () => applyScale(stepScale(scaleRef.current, -1));
  const fitWidth = () => {
    const room = (scrollRef.current?.clientWidth ?? 0) - SCROLL_PADDING;
    const next = fitWidthScale(room, currentPageWidth);
    if (next) applyScale(next);
  };

  // Re-rendering a page's canvas at a new scale is expensive, so `<Page>`
  // renders at `renderScale`, catching up to `scale` only once zooming pauses
  // for a beat. Page boxes follow `scale` right away and the rendered page is
  // stretched with a CSS transform in the meantime, so a click or a pinch
  // gesture reads as one smooth zoom and the layout (and scroll position)
  // only changes once per step, never again when the render catches up.
  const [renderScale, setRenderScale] = useState(scale);
  useEffect(() => {
    const id = setTimeout(() => setRenderScale(scale), 150);
    return () => clearTimeout(id);
  }, [scale]);

  // Every page grows or shrinks with `scale`, so the same scroll offset would
  // point somewhere else. The spot at the middle of the viewport (or under the
  // cursor, for a pinch) is noted before the layout changes and put back right after.
  const scaleRef = useRef(scale);
  // Unrounded zoom: a trackpad pinch sends many tiny wheel deltas, each far
  // under the 1% the shown scale rounds to, so they must add up here.
  const targetScaleRef = useRef(scale);
  const zoomAnchor = useRef<(ZoomAnchor & { y: number }) | null>(null);
  const pageNumbersRef = useRef(pageNumbers);
  pageNumbersRef.current = pageNumbers;
  /// `anchorY` is the viewport height to hold still, the middle of the scroll area
  /// without one.
  const applyScale = (next: number, anchorY?: number) => {
    targetScaleRef.current = clampScale(next);
    const clamped = Math.round(targetScaleRef.current * 100) / 100;
    if (clamped === scaleRef.current) return;
    const root = scrollRef.current;
    if (root && !zoomAnchor.current) {
      const box = root.getBoundingClientRect();
      const y = Math.min(Math.max(anchorY ?? box.top + box.height / 2, box.top), box.bottom);
      const anchor = findZoomAnchor(y, pageNumbersRef.current, (page) =>
        pageRefs.current.get(page)?.getBoundingClientRect(),
      );
      zoomAnchor.current = anchor && { ...anchor, y };
    }
    scaleRef.current = clamped;
    setScale(clamped);
  };
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    zoomAnchor.current = null;
    const el = anchor && pageRefs.current.get(anchor.page);
    if (!anchor || !scrollRef.current || !el) return;
    scrollRef.current.scrollTop += scrollDeltaForAnchor(
      anchor,
      el.getBoundingClientRect(),
      anchor.y,
    );
  }, [scale]);

  // Trackpad pinch: WebKit (and every other engine) reports it as a wheel
  // event with `ctrlKey` set, indistinguishable from an actual Ctrl+wheel —
  // the same signal a browser's own native pinch-to-zoom-the-page listens
  // for, which is exactly why we `preventDefault` it here instead.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A pinch can send several wheel events per frame, and every applied
    // step re-lays out all the pages, so deltas pile up in the target and
    // are applied once per frame.
    let frame = 0;
    let cursorY = 0;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      targetScaleRef.current = pinchScale(targetScaleRef.current, e.deltaY);
      cursorY = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyScale(targetScaleRef.current, cursorY);
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(frame);
    };
  }, []);

  return { scale, renderScale, zoomIn, zoomOut, fitWidth, applyScale };
}
