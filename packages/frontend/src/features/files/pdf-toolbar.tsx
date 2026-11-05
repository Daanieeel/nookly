import {
  IconArrowAutofitWidth,
  IconChevronDown,
  IconChevronUp,
  IconLayoutSidebar,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Separator } from "@nookly/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { MAX_SCALE, MIN_SCALE } from "./pdf-zoom";
import { PdfSearchControls } from "./pdf-search-controls";
import type { PdfSearch } from "./use-pdf-search";

/// The bar above the pages: thumbnails, page and zoom fields, and find in document.
export function PdfToolbar({
  numPages,
  currentPage,
  goToPage,
  scale,
  sizeKnown,
  showThumbnails,
  onToggleThumbnails,
  onZoomIn,
  onZoomOut,
  onZoomTo,
  onFitWidth,
  search,
}: {
  numPages: number;
  currentPage: number;
  goToPage: (page: number) => void;
  scale: number;
  sizeKnown: boolean;
  showThumbnails: boolean;
  onToggleThumbnails: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (scale: number) => void;
  onFitWidth: () => void;
  search: PdfSearch;
}) {
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

  // The toolbar's zoom field: shows the rounded percentage, but only while
  // the user isn't actively typing a custom one in.
  const [zoomInput, setZoomInput] = useState("100");
  const [editingZoom, setEditingZoom] = useState(false);
  useEffect(() => {
    if (!editingZoom) setZoomInput(String(Math.round(scale * 100)));
  }, [scale, editingZoom]);
  const commitZoomInput = () => {
    const parsed = Number.parseInt(zoomInput, 10);
    if (Number.isFinite(parsed)) onZoomTo(parsed / 100);
    setEditingZoom(false);
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-popover px-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Toggle Page Thumbnails"
            aria-pressed={showThumbnails}
            disabled={numPages === 0}
            onClick={onToggleThumbnails}
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
            onClick={onZoomOut}
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
            onClick={onZoomIn}
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
            onClick={onFitWidth}
          >
            <IconArrowAutofitWidth />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fit Width</TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1" />

      <PdfSearchControls search={search} />
    </div>
  );
}
