import { defaultRangeExtractor, useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/// Long lists draw only the rows around what is on screen, so a Space with thousands of
/// Notes or Files costs about as much as one with a few dozen. A list inside a page uses
/// the page's own scroll (the nearest element marked `data-scroll-root`), so scrolling,
/// the scroll position kept per tab and a list's room above it all work as they do for a
/// list drawn in full. Short lists are drawn in full, exactly as before.

/// A list shorter than this is drawn in full: nothing to save, and nothing that could look
/// different.
export const WINDOW_FROM = 150;

/// Rows drawn above and below the screen, so a quick scroll shows rows, not blanks.
const OVERSCAN = 12;

export const SCROLL_ROOT_ATTRIBUTE = "data-scroll-root";

function scrollRootOf(element: HTMLElement | null): HTMLElement | null {
  return element?.closest<HTMLElement>(`[${SCROLL_ROOT_ATTRIBUTE}]`) ?? null;
}

export interface WindowedList {
  /// Put on the element the first row starts at: the body of a table or the list itself.
  startRef: (element: HTMLElement | null) => void;
  /// False while the list is drawn in full: `items` is empty and the caller draws every row.
  windowed: boolean;
  /// The rows to draw now, each with the `index` of its row.
  items: VirtualItem[];
  /// Room to leave above and below the drawn rows for the ones left out.
  before: number;
  after: number;
  /// Put on each drawn row, with `data-index` set to its index, so its real height counts.
  measureElement: (element: HTMLElement | null) => void;
}

export function useWindowedList({
  count,
  estimateSize,
  keepIndex = null,
  enabled = count >= WINDOW_FROM,
}: {
  count: number;
  /// The height of row `index` before it has been drawn. The closer, the less the page
  /// jumps when a row turns out to be another height.
  estimateSize: (index: number) => number;
  /// A row to keep drawn wherever the page is scrolled, e.g. the one that has the focus.
  keepIndex?: number | null;
  enabled?: boolean;
}): WindowedList {
  const start = useRef<HTMLElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  // Where the first row starts, measured from the top of the scrolled content.
  const [margin, setMargin] = useState(0);

  const measureMargin = useCallback(() => {
    const root = scrollRoot;
    const element = start.current;
    if (!root || !element) return;
    const next = Math.round(
      element.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop,
    );
    setMargin((current) => (current === next ? current : next));
  }, [scrollRoot]);

  const startRef = useCallback((element: HTMLElement | null) => {
    start.current = element;
    setScrollRoot(scrollRootOf(element));
  }, []);

  // Anything above the list growing or shrinking moves where it starts.
  useLayoutEffect(measureMargin);
  useLayoutEffect(() => {
    const content = scrollRoot?.firstElementChild;
    if (!content) return;
    const observer = new ResizeObserver(measureMargin);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollRoot, measureMargin]);

  const windowed = enabled && scrollRoot !== null;
  const virtualizer = useVirtualizer({
    count: windowed ? count : 0,
    getScrollElement: () => scrollRoot,
    estimateSize,
    overscan: OVERSCAN,
    useFlushSync: false,
    scrollMargin: margin,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (keepIndex === null || keepIndex >= count || indexes.includes(keepIndex)) return indexes;
      return [...indexes, keepIndex].sort((a, b) => a - b);
    },
    // Without layout (or while a row is hidden) a row measures 0: go on with its estimate.
    measureElement: (element, entry) => {
      const size = entry?.borderBoxSize[0]?.blockSize ?? element.getBoundingClientRect().height;
      if (size > 0) return Math.round(size);
      return estimateSize(Number(element.getAttribute("data-index")));
    },
  });

  const items = windowed ? virtualizer.getVirtualItems() : [];
  const first = items[0];
  const last = items.at(-1);
  return {
    startRef,
    windowed,
    items,
    before: first ? first.start - margin : 0,
    after: last ? virtualizer.getTotalSize() - (last.end - margin) : 0,
    measureElement: virtualizer.measureElement,
  };
}
