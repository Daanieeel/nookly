import { useHasGroupFocus } from "#/components/tab-group-scope.ts";
import {
  IconArrowAutofitWidth,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconLayoutSidebar,
  IconSearch,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import {
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Document, Page, Thumbnail, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./pdf-viewer.css";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Separator } from "@nookly/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { useRememberedScroll } from "#/hooks/use-remembered-scroll.ts";
import { InvertibleDocument } from "./document-frame";
import { findZoomAnchor, scrollDeltaForAnchor, type ZoomAnchor } from "./pdf-zoom-anchor";
import {
  canvasPixelRatio,
  clampScale,
  fitWidthScale,
  MAX_SCALE,
  MIN_SCALE,
  pinchScale,
  stepScale,
} from "./pdf-zoom";

// Vite bundles the worker as its own asset; pdf.js can't run without one.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// How far past the visible area a page still stays rendered: one scroll area height
// each way, whatever the zoom. A long PDF drawn all at once (canvas, text layer and
// annotations per page) is what made big documents crawl, so only pages near the
// viewport are mounted.
const RENDER_MARGIN = "100% 0px";
const THUMBNAIL_MARGIN = "600px 0px";
const FALLBACK_PAGE_SIZE = { width: 612, height: 792 };
/// How long a requested page is held at the top while pages above it are measured.
const PIN_MS = 3000;
/// How long a page just outside the viewport waits to redraw at a new zoom, so the
/// pages in view get the drawing time first.
const OFFSCREEN_REDRAW_MS = 300;
/// Pages measured at once while the sizes of the whole document are read.
const SIZE_BATCH = 25;
/// The padding around the pages in the scroll area (`p-4`, both sides).
const SCROLL_PADDING = 32;

interface PageSize {
  width: number;
  height: number;
}

/// The sizes `updates` add to `sizes`; the same object when none differs.
function withPageSizes(
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
function LazyMount({
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
const PdfPageRow = memo(function PdfPageRow({
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

/// The zoom each file was left at, so coming back to its tab shows the same zoom the
/// scroll position was saved under. Lives for the session, like the scroll positions.
const rememberedZoom = new Map<string, number>();

/// Our own PDF viewer, on top of `react-pdf` (pdf.js): a page-by-page zoom
/// and a find-in-document search, with Nookly's own toolbar instead of
/// WebKit's built-in PDF chrome. Also used for docx/pptx, which convert
/// through LibreOffice into a PDF first (`office-viewers.tsx`).
/// What the viewer asks of the pdf.js document loader, so a test can swap it.
export interface PdfDocumentProps {
  file: string;
  onLoadSuccess: (doc: PDFDocumentProxy) => void;
  onLoadError: (error: Error) => void;
  onSourceError: (error: Error) => void;
  suspense: boolean;
  loading: ReactNode;
  error: ReactNode;
  className: string;
  children: ReactNode;
}

export function PdfViewer({
  src,
  name,
  documentComponent: PdfDocument = Document,
  initialPage,
  onInitialPageShown,
}: {
  src: string;
  name: string;
  /// A page to open on, from a mention of one (`[Slides (p. 12)]`). It wins over where
  /// the viewer was last scrolled.
  initialPage?: number;
  /// Called once the viewer has gone to `initialPage`, so the request is not repeated.
  onInitialPageShown?: () => void;
  /// The pdf.js document loader; tests pass a fake that fails on demand.
  documentComponent?: ComponentType<PdfDocumentProps>;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(() => rememberedZoom.get(src) ?? 1);
  useEffect(() => {
    rememberedZoom.set(src, scale);
  }, [src, scale]);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  // Matches per page, counted from each page's extracted text so the search
  // covers pages that aren't rendered right now.
  const [pageMatches, setPageMatches] = useState<number[]>([]);
  const matchCount = useMemo(() => pageMatches.reduce((a, b) => a + b, 0), [pageMatches]);
  const [defaultSize, setDefaultSize] = useState<PageSize>(FALLBACK_PAGE_SIZE);
  // Until the first page is measured every page is laid out at the fallback size, so a
  // page far down sits at the wrong offset; going to a page waits for the real size.
  const [sizeKnown, setSizeKnown] = useState(false);
  // Real sizes of the pages seen so far, so a placeholder matches its page.
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  // A load that failed (an iCloud file not downloaded yet, say) can be tried again;
  // `retry` remounts the Document so pdf.js starts over.
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  // A different file starts clean, never with the previous file's pages.
  const [shownSrc, setShownSrc] = useState(src);
  if (shownSrc !== src) {
    setShownSrc(src);
    setPdf(null);
    setNumPages(0);
    setPageSizes({});
    setSizeKnown(false);
    setLoadFailed(false);
  }

  // The file often becomes reachable while the user is elsewhere, so coming back to
  // the window tries again on its own.
  useEffect(() => {
    if (!loadFailed) return;
    const again = () => setRetry((n) => n + 1);
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [loadFailed]);

  const clearOnError = () => {
    setLoadFailed(true);
    setPdf(null);
    setNumPages(0);
    setPageSizes({});
    setSizeKnown(false);
  };

  // Reads every page's size up front: a page's box is laid out at its real size
  // before it is ever drawn, so pages of different sizes do not shift the ones
  // below them as they come into view.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    void (async () => {
      for (let first = 1; first <= pdf.numPages; first += SIZE_BATCH) {
        const last = Math.min(pdf.numPages, first + SIZE_BATCH - 1);
        const batch = await Promise.all(
          Array.from({ length: last - first + 1 }, async (_, i) => {
            try {
              const view = (await pdf.getPage(first + i)).getViewport({ scale: 1 });
              return [first + i, { width: view.width, height: view.height }] as const;
            } catch {
              // This page is laid out at the first page's size until it is drawn.
              return null;
            }
          }),
        );
        if (cancelled) return;
        const sizes = batch.filter((entry) => entry !== null);
        setPageSizes((known) => withPageSizes(known, sizes));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useRememberedScroll(scrollRef, `pdf:${src}`, numPages > 0);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const thumbnailRefs = useRef(new Map<number, HTMLDivElement>());
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const zoomIn = () => applyScale(stepScale(scaleRef.current, 1));
  const zoomOut = () => applyScale(stepScale(scaleRef.current, -1));
  const fitWidth = () => {
    const room = (scrollRef.current?.clientWidth ?? 0) - SCROLL_PADDING;
    const next = fitWidthScale(room, (pageSizes[currentPage] ?? defaultSize).width);
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

  // The toolbar's zoom field: shows the rounded percentage, but only while
  // the user isn't actively typing a custom one in.
  const [zoomInput, setZoomInput] = useState("100");
  const [editingZoom, setEditingZoom] = useState(false);
  useEffect(() => {
    if (!editingZoom) setZoomInput(String(Math.round(scale * 100)));
  }, [scale, editingZoom]);
  const commitZoomInput = () => {
    const parsed = Number.parseInt(zoomInput, 10);
    if (Number.isFinite(parsed)) applyScale(parsed / 100);
    setEditingZoom(false);
  };

  const goToPage = useCallback(
    (page: number, instant = false) => {
      const clamped = Math.min(Math.max(1, page), Math.max(1, numPages));
      // Set directly rather than waiting on the scroll-driven intersection
      // observer below: a short document that already fits the viewport
      // never actually scrolls, so nothing would otherwise mark the clicked
      // page as current.
      setCurrentPage(clamped);
      pageRefs.current
        .get(clamped)
        ?.scrollIntoView(instant ? { block: "start" } : { behavior: "smooth", block: "start" });
    },
    [numPages],
  );

  // The page a mention asked for stays at the top while the layout settles: pages
  // measured above it change their height, which would otherwise leave it far off. The
  // user taking over (wheel, touch, click, key) or a few seconds ends it.
  const pinnedPage = useRef<number | null>(null);
  const pinTimer = useRef<number | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = scrollRef.current;
    const content = contentRef.current;
    if (!root || !content || numPages === 0 || !("ResizeObserver" in window)) return;
    const realign = () => {
      const page = pinnedPage.current;
      if (page) pageRefs.current.get(page)?.scrollIntoView({ block: "start" });
    };
    const release = () => {
      pinnedPage.current = null;
    };
    const observer = new ResizeObserver(realign);
    observer.observe(content);
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const type of events) root.addEventListener(type, release, { passive: true });
    return () => {
      observer.disconnect();
      for (const type of events) root.removeEventListener(type, release);
    };
  }, [numPages]);

  // Goes to a requested page once the document is laid out. This runs after the layout
  // effect that restores the remembered scroll, so the request wins over it.
  const shownRef = useRef(onInitialPageShown);
  shownRef.current = onInitialPageShown;
  useEffect(() => {
    if (!initialPage || numPages === 0 || !sizeKnown) return;
    goToPage(initialPage, true);
    pinnedPage.current = Math.min(Math.max(1, initialPage), numPages);
    // Not cleared with the effect: handing the request back clears `initialPage`, which
    // reruns it, and the hold must still end on its own.
    window.clearTimeout(pinTimer.current);
    pinTimer.current = window.setTimeout(() => {
      pinnedPage.current = null;
    }, PIN_MS);
    shownRef.current?.();
  }, [initialPage, numPages, sizeKnown, goToPage]);
  useEffect(() => () => window.clearTimeout(pinTimer.current), []);
  // Zooming is the user taking over too.
  useEffect(() => {
    pinnedPage.current = null;
  }, [scale]);

  // The toolbar's page field: shows the page currently in view, but only
  // while the user isn't actively typing a page to jump to.
  const [pageInput, setPageInput] = useState("1");
  const [editingPage, setEditingPage] = useState(false);
  useEffect(() => {
    if (!editingPage) setPageInput(String(currentPage));
  }, [currentPage, editingPage]);
  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) goToPage(parsed);
    setEditingPage(false);
  };

  // Tracks which pages are in view while scrolling: the most visible one for the page
  // indicator, the whole range for which pages are drawn first. Entries only report
  // the pages that changed, so the ratios of all of them are kept here.
  const [visibleRange, setVisibleRange] = useState<readonly [number, number]>([0, 0]);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // SAFETY: every observed target is one of the page divs below, each
          // given a `data-page` attribute; `IntersectionObserverEntry.target`
          // just isn't typed narrower than `Element`.
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) ratios.set(page, entry.intersectionRatio);
          else ratios.delete(page);
        }
        let mostVisible = 0;
        let first = 0;
        let last = 0;
        for (const [page, ratio] of ratios) {
          if (!first || page < first) first = page;
          last = Math.max(last, page);
          if (ratio > (ratios.get(mostVisible) ?? -1)) mostVisible = page;
        }
        if (mostVisible) setCurrentPage(mostVisible);
        setVisibleRange((range) =>
          range[0] === first && range[1] === last ? range : [first, last],
        );
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [numPages]);

  // Keeps the thumbnail rail following the main document as the user
  // scrolls it by hand, not just when a thumbnail click drives `currentPage`.
  useEffect(() => {
    if (!showThumbnails) return;
    thumbnailRefs.current.get(currentPage)?.scrollIntoView({ block: "nearest" });
  }, [currentPage, showThumbnails]);

  const textCache = useRef(new Map<number, string[]>());
  useEffect(() => {
    textCache.current.clear();
  }, [pdf]);

  // Counts matches page by page. Extracted text is cached, so typing more of
  // the query doesn't read the document again. Each count uses the same
  // pattern `renderMatch` highlights with, per text run, so counter and marks agree.
  useEffect(() => {
    const trimmed = query.trim();
    if (!pdf || !trimmed) {
      setPageMatches([]);
      return;
    }
    let cancelled = false;
    const pattern = new RegExp(escapeRegExp(trimmed), "gi");
    void (async () => {
      const counts: number[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        let items = textCache.current.get(n);
        if (!items) {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          if (cancelled) return;
          items = content.items.map((item) => ("str" in item ? item.str : ""));
          textCache.current.set(n, items);
          page.cleanup();
        }
        counts.push(items.reduce((sum, str) => sum + (str.match(pattern)?.length ?? 0), 0));
        if (n % 25 === 0) setPageMatches([...counts]);
      }
      if (!cancelled) setPageMatches(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, query]);

  // 0: nothing to scroll to, 1: bring the active match's page into view,
  // 2: page is coming in, scroll to the mark once its text layer is drawn.
  const scrollStage = useRef<0 | 1 | 2>(0);
  const activePage = useRef(0);
  const [renderTick, setRenderTick] = useState(0);

  useEffect(() => {
    setActiveMatch(0);
    scrollStage.current = 1;
  }, [query]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    for (const mark of root.querySelectorAll(".pdf-search-mark-active")) {
      mark.classList.remove("pdf-search-mark-active");
    }
    let rest = activeMatch;
    let page = 0;
    let index = 0;
    for (let i = 0; i < pageMatches.length; i++) {
      if (rest < pageMatches[i]) {
        page = i + 1;
        index = rest;
        break;
      }
      rest -= pageMatches[i];
    }
    activePage.current = page;
    if (!page) return;
    const wrapper = pageRefs.current.get(page);
    const mark = wrapper?.querySelectorAll<HTMLElement>(".pdf-search-mark")[index];
    mark?.classList.add("pdf-search-mark-active");
    if (scrollStage.current === 0) return;
    if (mark) {
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      scrollStage.current = 0;
    } else if (scrollStage.current === 1) {
      wrapper?.scrollIntoView({ block: "start" });
      scrollStage.current = 2;
    }
  }, [activeMatch, pageMatches, renderTick]);

  const onTextLayerRendered = useCallback((page: number) => {
    if (page === activePage.current) setRenderTick((t) => t + 1);
  }, []);
  const registerPage = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);
  const onPageSize = useCallback(
    (page: number, size: PageSize) => setPageSizes((known) => withPageSizes(known, [[page, size]])),
    [],
  );

  const stepMatch = (delta: number) => {
    scrollStage.current = 1;
    setActiveMatch((i) => (i + delta + matchCount) % matchCount);
  };
  const nextMatch = () => matchCount > 0 && stepMatch(1);
  const prevMatch = () => matchCount > 0 && stepMatch(-1);

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const hasGroupFocus = useHasGroupFocus();
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!hasGroupFocus()) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "Escape" && searchOpen) {
        closeSearch();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, hasGroupFocus]);

  // Memoized so its identity only changes with `query`: react-pdf tears down
  // and rebuilds the whole text layer whenever this reference changes, and
  // `recount` (called once that rebuild finishes) sets state, which would
  // otherwise re-render this component, produce a *new* function here, and
  // trigger another rebuild forever — wiping the highlights before they're
  // ever visible.
  const renderMatch = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return undefined;
    const pattern = new RegExp(escapeRegExp(trimmed), "gi");
    return ({ str }: { str: string }) =>
      escapeHtml(str).replace(pattern, (m) => `<mark class="pdf-search-mark">${m}</mark>`);
  }, [query]);

  return (
    <div className="flex size-full flex-col overflow-hidden rounded-md border border-border">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-popover px-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Toggle Page Thumbnails"
              aria-pressed={showThumbnails}
              disabled={numPages === 0}
              onClick={() => setShowThumbnails((v) => !v)}
            >
              <IconLayoutSidebar />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Page Thumbnails</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Previous Page"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              <IconChevronUp />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous Page</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Next Page"
              disabled={currentPage >= numPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              <IconChevronDown />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next Page</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-0.5 px-1">
              <Input
                value={pageInput}
                aria-label="Page Number"
                inputMode="numeric"
                disabled={numPages === 0}
                onFocus={(e) => {
                  setEditingPage(true);
                  e.target.select();
                }}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") {
                    setEditingPage(false);
                    setPageInput(String(currentPage));
                    e.currentTarget.blur();
                  }
                }}
                className="h-7 w-10 px-1 text-center text-xs tabular-nums"
              />
              <span className="text-xs text-muted-foreground">
                {numPages > 0 ? `/ ${numPages}` : "…"}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Page Number</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Zoom Out"
              disabled={scale <= MIN_SCALE}
              onClick={zoomOut}
            >
              <IconZoomOut />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-0.5">
              <Input
                value={zoomInput}
                aria-label="Zoom Level"
                inputMode="numeric"
                onFocus={(e) => {
                  setEditingZoom(true);
                  e.target.select();
                }}
                onChange={(e) => setZoomInput(e.target.value.replace(/\D/g, ""))}
                onBlur={commitZoomInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") {
                    setEditingZoom(false);
                    setZoomInput(String(Math.round(scale * 100)));
                    e.currentTarget.blur();
                  }
                }}
                className="h-7 w-12 px-1 text-center text-xs tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Zoom Level</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Zoom In"
              disabled={scale >= MAX_SCALE}
              onClick={zoomIn}
            >
              <IconZoomIn />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Fit Width"
              disabled={!sizeKnown}
              onClick={fitWidth}
            >
              <IconArrowAutofitWidth />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit Width</TooltipContent>
        </Tooltip>

        <div className="min-w-0 flex-1" />

        {searchOpen ? (
          // Escape closes the search first, before the page goes back (`use-escape-back.ts`).
          <div className="flex items-center gap-1" data-owns-escape>
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.shiftKey ? prevMatch : nextMatch)();
              }}
              placeholder="Find in document…"
              className="h-7 w-40"
            />
            {query && (
              <span className="w-14 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                {matchCount > 0 ? `${activeMatch + 1} / ${matchCount}` : "0 / 0"}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Previous Match"
                  disabled={matchCount === 0}
                  onClick={prevMatch}
                >
                  <IconChevronLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous Match</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Next Match"
                  disabled={matchCount === 0}
                  onClick={nextMatch}
                >
                  <IconChevronRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next Match</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Close Search"
                  onClick={closeSearch}
                >
                  <IconX />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close Search</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Find in Document"
                onClick={openSearch}
              >
                <IconSearch />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Find in Document</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {showThumbnails && (
          <div
            ref={thumbnailsRef}
            className="w-32 shrink-0 space-y-3 overflow-y-auto border-r border-border p-2"
          >
            {pageNumbers.map((page) => {
              const size = pageSizes[page] ?? defaultSize;
              return (
                <div
                  key={page}
                  ref={(el) => {
                    if (el) thumbnailRefs.current.set(page, el);
                    else thumbnailRefs.current.delete(page);
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <LazyMount
                    rootRef={thumbnailsRef}
                    margin={THUMBNAIL_MARGIN}
                    // 96px wide thumbnail plus its 4px borders.
                    width="104px"
                    minHeight={`${(size.height / size.width) * 96 + 8}px`}
                  >
                    <Thumbnail
                      pdf={pdf ?? undefined}
                      pageNumber={page}
                      width={96}
                      onItemClick={() => goToPage(page)}
                      className={cn(
                        "block overflow-hidden rounded-md border-4",
                        page === currentPage
                          ? "border-primary"
                          : "border-transparent hover:border-foreground/30",
                      )}
                    />
                  </LazyMount>
                  <span className="text-xs text-muted-foreground">{page}</span>
                </div>
              );
            })}
          </div>
        )}
        <InvertibleDocument className="block min-w-0 flex-1">
          {(pageClass) => (
            <div ref={scrollRef} className="size-full overflow-auto p-4">
              <div
                ref={contentRef}
                // SAFETY: only custom properties, which `CSSProperties` does not model.
                style={{ "--pdf-scale": scale } as CSSProperties}
              >
                <PdfDocument
                  key={retry}
                  file={src}
                  onLoadSuccess={(doc) => {
                    setLoadFailed(false);
                    setPdf(doc);
                    setNumPages(doc.numPages);
                    setPageSizes({});
                    setSizeKnown(false);
                    doc
                      .getPage(1)
                      .then((first) => {
                        const view = first.getViewport({ scale: 1 });
                        setDefaultSize({
                          width: view.width,
                          height: view.height,
                        });
                      })
                      // The pages still render at the fallback size.
                      .catch(() => undefined)
                      .finally(() => setSizeKnown(true));
                  }}
                  onLoadError={clearOnError}
                  onSourceError={clearOnError}
                  // No <Suspense> boundary anywhere in this app; use the plain
                  // loading/error props instead of thrown promises.
                  suspense={false}
                  loading={<p className="p-4 text-sm text-muted-foreground">Loading {name}…</p>}
                  error={
                    <div className="flex items-center gap-3 p-4">
                      <p className="text-sm text-destructive">Couldn't load {name}.</p>
                      <Button variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)}>
                        Try Again
                      </Button>
                    </div>
                  }
                  // A flex `items-center` (or `justify-center`) column only
                  // lets an overflowing child scroll toward the end, never
                  // the start — a well known flexbox-centering quirk. Plain
                  // block centering (`mx-auto` on a shrink-wrapped box) has
                  // no such limit, so a zoomed-in page stays scrollable on
                  // both sides.
                  className="mx-auto w-fit space-y-4"
                >
                  {pageNumbers.map((page) => {
                    const size = pageSizes[page] ?? defaultSize;
                    return (
                      <PdfPageRow
                        key={page}
                        page={page}
                        width={size.width}
                        height={size.height}
                        renderScale={renderScale}
                        visible={page >= visibleRange[0] && page <= visibleRange[1]}
                        pageClass={pageClass}
                        scrollRef={scrollRef}
                        register={registerPage}
                        customTextRenderer={renderMatch}
                        onPageSize={onPageSize}
                        onTextLayer={onTextLayerRendered}
                      />
                    );
                  })}
                </PdfDocument>
              </div>
            </div>
          )}
        </InvertibleDocument>
      </div>
    </div>
  );
}
