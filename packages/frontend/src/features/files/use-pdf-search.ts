import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useHasGroupFocus } from "#/components/tab-group-scope.ts";
import { escapeHtml, escapeRegExp } from "./pdf-pages";

/// Find in document: the query, the match counts per page (from each page's extracted
/// text, so pages that are not drawn count too), stepping through matches and the
/// highlight of each text run.
export function usePdfSearch({
  pdf,
  scrollRef,
  pageRefs,
}: {
  pdf: PDFDocumentProxy | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  pageRefs: RefObject<Map<number, HTMLDivElement>>;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  // Matches per page, counted from each page's extracted text so the search
  // covers pages that aren't rendered right now.
  const [pageMatches, setPageMatches] = useState<number[]>([]);
  const matchCount = useMemo(() => pageMatches.reduce((a, b) => a + b, 0), [pageMatches]);

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

  return {
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
    renderMatch,
    onTextLayerRendered,
  };
}

export type PdfSearch = ReturnType<typeof usePdfSearch>;
