import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Document, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./pdf-viewer.css";
import { Button } from "@nookly/ui/components/button";
import { useRememberedScroll } from "#/hooks/use-remembered-scroll.ts";
import { InvertibleDocument } from "./document-frame";
import { ignoreError } from "#/lib/log.ts";
import {
  FALLBACK_PAGE_SIZE,
  PdfPageRow,
  PIN_MS,
  SIZE_BATCH,
  withPageSizes,
  type PageSize,
} from "./pdf-pages";
import { PdfThumbnails } from "./pdf-thumbnails";
import { PdfToolbar } from "./pdf-toolbar";
import { usePdfSearch } from "./use-pdf-search";
import { usePdfZoom } from "./use-pdf-zoom";

// Vite bundles the worker as its own asset; pdf.js can't run without one.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

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
  const [showThumbnails, setShowThumbnails] = useState(false);
  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
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
  const { scale, renderScale, zoomIn, zoomOut, fitWidth, applyScale } = usePdfZoom({
    src,
    scrollRef,
    pageRefs,
    pageNumbers,
    currentPageWidth: (pageSizes[currentPage] ?? defaultSize).width,
  });
  const search = usePdfSearch({ pdf, scrollRef, pageRefs });

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
  const registerPage = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);
  const onPageSize = useCallback(
    (page: number, size: PageSize) => setPageSizes((known) => withPageSizes(known, [[page, size]])),
    [],
  );

  return (
    <div className="flex size-full flex-col overflow-hidden rounded-md border border-border">
      <PdfToolbar
        numPages={numPages}
        currentPage={currentPage}
        goToPage={goToPage}
        scale={scale}
        sizeKnown={sizeKnown}
        showThumbnails={showThumbnails}
        onToggleThumbnails={() => setShowThumbnails((v) => !v)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomTo={applyScale}
        onFitWidth={fitWidth}
        search={search}
      />

      <div className="flex min-h-0 flex-1">
        {showThumbnails && (
          <PdfThumbnails
            pdf={pdf}
            pageNumbers={pageNumbers}
            pageSizes={pageSizes}
            defaultSize={defaultSize}
            currentPage={currentPage}
            goToPage={goToPage}
          />
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
                      .catch(ignoreError("a PDF viewer step"))
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
                        customTextRenderer={search.renderMatch}
                        onPageSize={onPageSize}
                        onTextLayer={search.onTextLayerRendered}
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
