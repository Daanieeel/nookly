/// The pieces that draw the pages of the PDF viewer: lazily mounted, scaled, with their text
/// layer and search highlights.
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  memo,
  useRef,
  useState,
} from "react";
import { Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./pdf-viewer.css";
import { cn } from "@nookly/ui/lib/utils";
import { canvasPixelRatio } from "./pdf-zoom";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// How far past the visible area a page still stays rendered: one scroll area height
// each way, whatever the zoom. A long PDF drawn all at once (canvas, text layer and
// annotations per page) is what made big documents crawl, so only pages near the
// viewport are mounted.
const RENDER_MARGIN = "100% 0px";
export const THUMBNAIL_MARGIN = "600px 0px";
export const FALLBACK_PAGE_SIZE = { width: 612, height: 792 };
/// How long a requested page is held at the top while pages above it are measured.
export const PIN_MS = 3000;
/// How long a page just outside the viewport waits to redraw at a new zoom, so the
/// pages in view get the drawing time first.
const OFFSCREEN_REDRAW_MS = 300;
/// Pages measured at once while the sizes of the whole document are read.
export const SIZE_BATCH = 25;
/// The padding around the pages in the scroll area (`p-4`, both sides).
export const SCROLL_PADDING = 32;

export interface PageSize {
  width: number;
  height: number;
}

/// The sizes `updates` add to `sizes`; the same object when none differs.
export function withPageSizes(
  sizes: Record<number, PageSize>,
  updates: Array<readonly [number, PageSize]>,
): Record<number, PageSize> {
  let next = sizes;
  for (const [page, size] of updates) {
    const known = next[page];
    if (known?.width === size.width && known.height === size.height) continue;
    if (next === sizes) next = { ...sizes };
    next[page] = size;
  }
  return next;
}

/// Mounts `children` only while this box is within `margin` of the scroll area
/// `rootRef` and leaves a box of `width` by `minHeight` (CSS lengths) otherwise, so
/// layout and scroll positions hold still while pages come and go.
export function LazyMount({
  rootRef,
  margin,
  width,
  minHeight,
  children,
}: {
  rootRef: RefObject<HTMLElement | null>;
  margin: string;
  width: string;
  minHeight: string;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: rootRef.current,
      rootMargin: margin,
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [rootRef, margin]);
  return (
    <div
      ref={boxRef}
      // SAFETY: only custom properties, which `CSSProperties` does not model.
      style={{ "--lazy-width": width, "--lazy-height": minHeight } as CSSProperties}
      className="min-h-(--lazy-height) w-(--lazy-width)"
    >
      {near ? children : null}
    </div>
  );
}

/// `value`, but following a change only after `ms` unless `immediate`.
function useLagged<T>(value: T, ms: number, immediate: boolean): T {
  const [lagged, setLagged] = useState(value);
  if (immediate && lagged !== value) setLagged(value);
  useEffect(() => {
    if (immediate) return;
    const id = setTimeout(() => setLagged(value), ms);
    return () => clearTimeout(id);
  }, [value, ms, immediate]);
  return immediate ? value : lagged;
}

/// A page drawn at `renderScale` but laid out and shown at the viewer's zoom
/// (`--pdf-scale`): the box follows the zoom at once, with no render, and the page
/// inside is stretched to match. While pdf.js redraws at the new `renderScale`
/// (react-pdf hides the canvas for that), a copy of the last drawn canvas stays
/// visible behind it, so zooming never flashes blank. `width` and `height` are the
/// page's size at zoom 1. Only a `visible` page gets a text and annotation layer,
/// a copy of its canvas and an instant redraw; pages around it follow a moment later.
function ScaledPage({
  width,
  height,
  renderScale: wantedRenderScale,
  visible,
  onRenderSuccess,
  ...pageProps
}: {
  width: number;
  height: number;
  renderScale: number;
  visible: boolean;
} & Omit<ComponentProps<typeof Page>, "scale">) {
  const renderScale = useLagged(wantedRenderScale, OFFSCREEN_REDRAW_MS, visible);
  const staleRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Runs before react-pdf's own effect clears the canvas for the redraw.
  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const canvas = hostRef.current?.querySelector("canvas");
    const stale = staleRef.current;
    if (!visibleRef.current || !canvas || !stale) return;
    if (canvas.width === 0 || canvas.style.visibility === "hidden") return;
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    copy.className = "size-full";
    stale.replaceChildren(copy);
  }, [renderScale]);
  return (
    <div ref={hostRef} className="relative h-(--box-height) w-(--box-width) overflow-hidden">
      <div ref={staleRef} className="absolute inset-0" aria-hidden />
      <div
        // SAFETY: only custom properties, which `CSSProperties` does not model.
        style={
          {
            "--page-stretch": `calc(var(--pdf-scale) / ${renderScale})`,
          } as CSSProperties
        }
        className="absolute top-0 left-0 origin-top-left scale-(--page-stretch)"
      >
        <Page
          {...pageProps}
          scale={renderScale}
          renderTextLayer={visible}
          renderAnnotationLayer={visible}
          devicePixelRatio={canvasPixelRatio(
            window.devicePixelRatio || 1,
            width,
            height,
            renderScale,
          )}
          onRenderSuccess={(page) => {
            staleRef.current?.replaceChildren();
            onRenderSuccess?.(page);
          }}
        />
      </div>
    </div>
  );
}

interface PdfPageRowProps {
  page: number;
  /// The page's size at zoom 1.
  width: number;
  height: number;
  renderScale: number;
  visible: boolean;
  pageClass: string;
  scrollRef: RefObject<HTMLElement | null>;
  register: (page: number, el: HTMLDivElement | null) => void;
  customTextRenderer: ComponentProps<typeof Page>["customTextRenderer"];
  onPageSize: (page: number, size: PageSize) => void;
  onTextLayer: (page: number) => void;
}

/// One page of the document. Memoized, with every prop a plain value or a stable
/// function, so a change to one page (or to the viewer's own state) leaves the
/// other pages alone. Zooming does not touch its props at all: the box follows
/// `--pdf-scale` in CSS.
export const PdfPageRow = memo(function PdfPageRow({
  page,
  width,
  height,
  renderScale,
  visible,
  pageClass,
  scrollRef,
  register,
  customTextRenderer,
  onPageSize,
  onTextLayer,
}: PdfPageRowProps) {
  return (
    <div
      data-page={page}
      ref={(el) => register(page, el)}
      // SAFETY: only custom properties, which `CSSProperties` does not model.
      style={
        {
          "--page-width": width,
          "--page-height": height,
          "--box-width": "calc(var(--page-width) * var(--pdf-scale) * 1px)",
          "--box-height": "calc(var(--page-height) * var(--pdf-scale) * 1px)",
        } as CSSProperties
      }
      className={cn("shadow-sm", pageClass)}
    >
      <LazyMount
        rootRef={scrollRef}
        margin={RENDER_MARGIN}
        width="var(--box-width)"
        minHeight="var(--box-height)"
      >
        <ScaledPage
          pageNumber={page}
          width={width}
          height={height}
          renderScale={renderScale}
          visible={visible}
          customTextRenderer={customTextRenderer}
          onLoadSuccess={(loaded) =>
            onPageSize(page, { width: loaded.originalWidth, height: loaded.originalHeight })
          }
          onRenderTextLayerSuccess={() => onTextLayer(page)}
        />
      </LazyMount>
    </div>
  );
});
