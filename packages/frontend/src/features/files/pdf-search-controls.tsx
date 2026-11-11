import { IconChevronLeft, IconChevronRight, IconSearch, IconX } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import type { PdfSearch } from "./use-pdf-search";

/// The find in document button, which becomes the search field and its controls.
export function PdfSearchControls({ search }: { search: PdfSearch }) {
  const {
    searchOpen,
    query,
    setQuery,
    activeMatch,
    matchCount,
    searchInputRef,
    nextMatch,
    prevMatch,
    openSearch,
    closeSearch,
  } = search;
  return searchOpen ? (
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
  );
}
