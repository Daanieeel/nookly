import {
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
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
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

// Vite bundles the worker as its own asset; pdf.js can't run without one.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.1;

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

// How far past the visible area a page still stays rendered. A long PDF drawn
// all at once (canvas, text layer and annotations per page) is what made big
// documents crawl, so only pages near the viewport are mounted.
const RENDER_MARGIN = "1500px 0px";
const THUMBNAIL_MARGIN = "600px 0px";
const FALLBACK_PAGE_SIZE = { width: 612, height: 792 };

interface PageSize {
  width: number;
  height: number;
}

/// Mounts `children` only while this box is within `margin` of the scroll area
/// `rootRef` and leaves a box of `height` otherwise, so layout and scroll
/// positions hold still while pages come and go.
function LazyMount({
  rootRef,
  margin,
  width,
  minHeight,
  children,
}: {
  rootRef: RefObject<HTMLElement | null>;
  margin: string;
  width: number;
  minHeight: number;
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
      // SAFETY: both custom properties only ever receive plain pixel lengths;
      // `CSSProperties` just doesn't model custom properties.
      style={{ "--lazy-width": `${width}px`, "--lazy-height": `${minHeight}px` } as CSSProperties}
      className="min-h-(--lazy-height) w-(--lazy-width)"
    >
      {near ? children : null}
    </div>
  );
}

/// Our own PDF viewer, on top of `react-pdf` (pdf.js): a page-by-page zoom
/// and a find-in-document search, with Nookly's own toolbar instead of
/// WebKit's built-in PDF chrome. Also used for docx/pptx, which convert
/// through LibreOffice into a PDF first (`office-viewers.tsx`).
export function PdfViewer({ src, name }: { src: string; name: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
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
  // Real sizes of the pages seen so far, so a placeholder matches its page.
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  useRememberedScroll(scrollRef, `pdf:${src}`, numPages > 0);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const thumbnailRefs = useRef(new Map<number, HTMLDivElement>());
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clampScale = (next: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  const zoomIn = () => setScale((s) => clampScale(Math.round((s + ZOOM_STEP) * 100) / 100));
  const zoomOut = () => setScale((s) => clampScale(Math.round((s - ZOOM_STEP) * 100) / 100));

  // Re-rendering a page's canvas at a new scale is expensive and clears it
  // first, flashing blank for a moment. `renderScale` is what `<Page>`
  // actually renders at, catching up to `scale` only once zooming pauses for
  // a beat; a CSS transform previews `scale` on the already-rendered pages
  // instantly in the meantime, so a click or a pinch gesture reads as one
  // smooth zoom instead of a flash per step.
  const [renderScale, setRenderScale] = useState(1);
  useEffect(() => {
    const id = setTimeout(() => setRenderScale(scale), 150);
    return () => clearTimeout(id);
  }, [scale]);

  // Trackpad pinch: WebKit (and every other engine) reports it as a wheel
  // event with `ctrlKey` set, indistinguishable from an actual Ctrl+wheel —
  // the same signal a browser's own native pinch-to-zoom-the-page listens
  // for, which is exactly why we `preventDefault` it here instead.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((s) => clampScale(Math.round((s - e.deltaY * 0.01) * 100) / 100));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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
    if (Number.isFinite(parsed)) setScale(clampScale(parsed / 100));
    setEditingZoom(false);
  };

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.min(Math.max(1, page), Math.max(1, numPages));
      // Set directly rather than waiting on the scroll-driven intersection
      // observer below: a short document that already fits the viewport
      // never actually scrolls, so nothing would otherwise mark the clicked
      // page as current.
      setCurrentPage(clamped);
      pageRefs.current.get(clamped)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [numPages],
  );

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

  // Tracks which page is most visible while scrolling, for the page indicator.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        // SAFETY: every observed target is one of the page divs below, each
        // given a `data-page` attribute; `IntersectionObserverEntry.target`
        // just isn't typed narrower than `Element`.
        const page = Number((mostVisible?.target as HTMLElement | undefined)?.dataset.page);
        if (page) setCurrentPage(page);
      },
      { root, threshold: [0.25, 0.5, 0.75, 1] },
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

  const onTextLayerRendered = (page: number) => {
    if (page === activePage.current) setRenderTick((t) => t + 1);
  };

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "Escape" && searchOpen) {
        closeSearch();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

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

        <div className="min-w-0 flex-1" />

        {searchOpen ? (
          <div className="flex items-center gap-1">
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
                    width={104}
                    minHeight={(size.height / size.width) * 96 + 8}
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
                // SAFETY: `--pdf-zoom-ratio` only ever receives `scale / renderScale`,
                // a plain number — `CSSProperties` just doesn't model custom properties.
                style={{ "--pdf-zoom-ratio": scale / renderScale } as CSSProperties}
                className="origin-top scale-(--pdf-zoom-ratio) transition-transform duration-100 ease-out"
              >
                <Document
                  file={src}
                  onLoadSuccess={(doc) => {
                    setPdf(doc);
                    setNumPages(doc.numPages);
                    setPageSizes({});
                    void doc.getPage(1).then((first) => {
                      const view = first.getViewport({ scale: 1 });
                      setDefaultSize({ width: view.width, height: view.height });
                    });
                  }}
                  // No <Suspense> boundary anywhere in this app; use the plain
                  // loading/error props instead of thrown promises.
                  suspense={false}
                  loading={<p className="p-4 text-sm text-muted-foreground">Loading {name}…</p>}
                  error={<p className="p-4 text-sm text-destructive">Couldn't load {name}.</p>}
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
                      <div
                        key={page}
                        data-page={page}
                        ref={(el) => {
                          if (el) pageRefs.current.set(page, el);
                          else pageRefs.current.delete(page);
                        }}
                        className={cn("shadow-sm", pageClass)}
                      >
                        <LazyMount
                          rootRef={scrollRef}
                          margin={RENDER_MARGIN}
                          width={size.width * renderScale}
                          minHeight={size.height * renderScale}
                        >
                          <Page
                            pageNumber={page}
                            scale={renderScale}
                            customTextRenderer={renderMatch}
                            onLoadSuccess={(loaded) =>
                              setPageSizes((sizes) =>
                                sizes[page]?.width === loaded.originalWidth
                                  ? sizes
                                  : {
                                      ...sizes,
                                      [page]: {
                                        width: loaded.originalWidth,
                                        height: loaded.originalHeight,
                                      },
                                    },
                              )
                            }
                            onRenderTextLayerSuccess={() => onTextLayerRendered(page)}
                          />
                        </LazyMount>
                      </div>
                    );
                  })}
                </Document>
              </div>
            </div>
          )}
        </InvertibleDocument>
      </div>
    </div>
  );
}
