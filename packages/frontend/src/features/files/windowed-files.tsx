import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useWindowedList } from "#/hooks/use-windowed-list.ts";

/// The tiles of the grid are at least this wide (`9.5rem`) with this much between them
/// (`gap-3`), which is how many fit a row.
const MIN_TILE_REM = 9.5;
const GAP = 12;
/// A row of the list (`h-11`).
const LIST_ROW = 44;
/// What a tile has besides its preview: padding, the gap, and the title and details.
const TILE_CHROME = 12 + 8 + 38;

function columnsFor(width: number): number {
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.max(1, Math.floor((width + GAP) / (MIN_TILE_REM * rem + GAP)));
}

/// The width of an element, kept up to date as it changes.
function useWidth() {
  const element = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const measure = useCallback(() => {
    const next = Math.round(element.current?.getBoundingClientRect().width ?? 0);
    setWidth((current) => (current === next ? current : next));
  }, []);
  const ref = useCallback(
    (node: HTMLElement | null) => {
      element.current = node;
      measure();
    },
    [measure],
  );
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);
  return [ref, width] as const;
}

/// The room left for the rows that are not drawn.
function Room({ height }: { height: number }) {
  return (
    <div
      aria-hidden
      className="h-(--room)"
      // SAFETY: only a custom property, which `CSSProperties` can't name.
      style={{ "--room": `${height}px` } as CSSProperties}
    />
  );
}

/// Files as a grid of tiles or a list of rows. A long run draws only what is on screen
/// and a little around it (`use-windowed-list.ts`), so a Space with thousands of Files,
/// each with a preview to draw, stays smooth to scroll. A short run is drawn in full.
export function WindowedFiles<T>({
  items,
  layout,
  renderItem,
}: {
  items: T[];
  layout: "grid" | "list";
  /// A tile (`li`) for the grid, a row for the list, with the item's key.
  renderItem: (item: T) => ReactNode;
}) {
  const [widthRef, width] = useWidth();
  const columns = layout === "grid" ? columnsFor(width) : 1;
  const rows = Math.ceil(items.length / columns);
  const tileWidth = (width - GAP * (columns - 1)) / columns;
  const rowHeight =
    layout === "grid" ? Math.round((tileWidth * 3) / 4) + TILE_CHROME + GAP : LIST_ROW;
  const list = useWindowedList({ count: rows, estimateSize: () => rowHeight });

  const ref = useCallback(
    (node: HTMLElement | null) => {
      list.startRef(node);
      widthRef(node);
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- both are stable callbacks
    [list.startRef, widthRef],
  );

  // SAFETY: only a custom property, which `CSSProperties` can't name.
  const rowStyle = { "--columns": `repeat(${columns}, minmax(0, 1fr))` } as CSSProperties;

  if (!list.windowed) {
    return layout === "grid" ? (
      <ul
        ref={ref}
        aria-label="Files"
        className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 p-4"
      >
        {items.map(renderItem)}
      </ul>
    ) : (
      <div ref={ref}>{items.map(renderItem)}</div>
    );
  }

  return (
    <div className={layout === "grid" ? "p-4" : undefined}>
      <div ref={ref} role="list" aria-label="Files">
        {list.before > 0 && <Room height={list.before} />}
        {list.items.map((virtual) => (
          <div
            key={virtual.index}
            role="presentation"
            data-index={virtual.index}
            ref={list.measureElement}
            className={layout === "grid" ? "grid grid-cols-(--columns) gap-3 pb-3" : undefined}
            style={layout === "grid" ? rowStyle : undefined}
          >
            {items.slice(virtual.index * columns, (virtual.index + 1) * columns).map(renderItem)}
          </div>
        ))}
        {list.after > 0 && <Room height={list.after} />}
      </div>
    </div>
  );
}
