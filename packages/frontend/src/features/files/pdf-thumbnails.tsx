import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Thumbnail } from "react-pdf";
import { cn } from "@nookly/ui/lib/utils";
import { LazyMount, THUMBNAIL_MARGIN, type PageSize } from "./pdf-pages";

/// The rail of page thumbnails, which follows the page in view.
export function PdfThumbnails({
  pdf,
  pageNumbers,
  pageSizes,
  defaultSize,
  currentPage,
  goToPage,
}: {
  pdf: PDFDocumentProxy | null;
  pageNumbers: number[];
  pageSizes: Record<number, PageSize>;
  defaultSize: PageSize;
  currentPage: number;
  goToPage: (page: number) => void;
}) {
  const thumbnailRefs = useRef(new Map<number, HTMLDivElement>());
  const thumbnailsRef = useRef<HTMLDivElement>(null);

  // Keeps the thumbnail rail following the main document as the user
  // scrolls it by hand, not just when a thumbnail click drives `currentPage`.
  useEffect(() => {
    thumbnailRefs.current.get(currentPage)?.scrollIntoView({ block: "nearest" });
  }, [currentPage]);

  return (
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
  );
}
