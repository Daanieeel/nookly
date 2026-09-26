import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconSearch,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./pdf-viewer.css";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Separator } from "@nookly/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
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

/// Our own PDF viewer, on top of `react-pdf` (pdf.js): a page-by-page zoom
/// and a find-in-document search, with Nookly's own toolbar instead of
/// WebKit's built-in PDF chrome. Also used for docx/pptx, which convert
/// through LibreOffice into a PDF first (`office-viewers.tsx`).
export function PdfViewer({ src, name }: { src: string; name: string }) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
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

  // Search match count comes straight from the DOM marks `renderMatch` draws
  // (see below), so the counter and the highlights can never disagree. A
  // match split across two text runs isn't found — a known limitation of
  // per-run highlighting, same as react-pdf's own documented approach.
  const recount = useCallback(() => {
    const marks = scrollRef.current?.querySelectorAll(".pdf-search-mark") ?? [];
    setMatchCount(marks.length);
  }, []);

  useEffect(() => {
    setActiveMatch(0);
    const id = requestAnimationFrame(recount);
    return () => cancelAnimationFrame(id);
  }, [query, recount]);

  useEffect(() => {
    const marks = scrollRef.current?.querySelectorAll<HTMLElement>(".pdf-search-mark") ?? [];
    marks.forEach((mark, i) => mark.classList.toggle("pdf-search-mark-active", i === activeMatch));
    marks[activeMatch]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatch, matchCount]);

  const nextMatch = () => matchCount > 0 && setActiveMatch((i) => (i + 1) % matchCount);
  const prevMatch = () => matchCount > 0 && setActiveMatch((i) => (i - 1 + matchCount) % matchCount);

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
                <Button variant="ghost" size="iconSm" aria-label="Close Search" onClick={closeSearch}>
                  <IconX />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close Search</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Find in Document" onClick={openSearch}>
                <IconSearch />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Find in Document</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <InvertibleDocument className="block">
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
                  onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
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
                  {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
                    <div
                      key={page}
                      data-page={page}
                      ref={(el) => {
                        if (el) pageRefs.current.set(page, el);
                        else pageRefs.current.delete(page);
                      }}
                      className={cn("shadow-sm", pageClass)}
                    >
                      <Page
                        pageNumber={page}
                        scale={renderScale}
                        customTextRenderer={renderMatch}
                        onRenderTextLayerSuccess={recount}
                      />
                    </div>
                  ))}
                </Document>
              </div>
            </div>
          )}
        </InvertibleDocument>
      </div>
    </div>
  );
}
