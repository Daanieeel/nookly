import { IconFileCode, IconFileText, IconSearch } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { openLogsFolder } from "#/lib/api/logs.ts";
import { openSettingsFile } from "#/lib/api/settings-file.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";
import { cn } from "@nookly/ui/lib/utils";
import { Kbd } from "#/components/kbd.tsx";
import { searchSettings } from "#/lib/settings/search.ts";
import { useShortcutMap } from "#/hooks/use-shortcut.ts";
import { isShortcutName, keySynonyms } from "#/lib/shortcuts.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cancelPendingShortcut } from "./shortcut-editing.ts";
import { ShortcutConflictDialog } from "./ShortcutConflictDialog.tsx";
import { CalendarPage } from "./CalendarPage.tsx";
import { ShortcutsPage } from "./ShortcutsTab.tsx";
import { SettingRow } from "./SettingRow.tsx";
import {
  FOOTER_PAGES,
  NAV_GROUPS,
  PAGES,
  PAGE_ORDER,
  type PageId,
  pageOf,
} from "./settings-pages.ts";
import { ROWS, type RowSpec } from "./setting-rows.tsx";

function Row({ row }: { row: RowSpec }) {
  return (
    <SettingRow
      title={row.title}
      description={row.description}
      settingId={row.setting}
      control={row.control}
      footer={row.footer}
      hideTitle={row.hideTitle}
    />
  );
}

/// One page's rows under their section headings, in display order.
function PageRows({ page }: { page: PageId }) {
  if (page === "shortcuts") return <ShortcutsPage />;
  if (page === "calendar") return <CalendarPage />;
  const rows = ROWS.filter((r) => pageOf(r) === page);
  const sections = [...new Set(rows.map((r) => r.section))];
  const showHeadings = sections.length > 1;
  return sections.map((section) => (
    <Fragment key={section}>
      {showHeadings && (
        <h3 className="pt-5 pb-1 text-xs font-medium text-muted-foreground first:pt-0">
          {section}
        </h3>
      )}
      {rows
        .filter((r) => r.section === section)
        .map((row) => (
          <Row key={row.id} row={row} />
        ))}
    </Fragment>
  ));
}

/// The rows, with each shortcut also searchable by the key it has right now ("cmd k").
function useSearchableRows(): RowSpec[] {
  const keys = useShortcutMap();
  return useMemo(
    () =>
      ROWS.map((row) => {
        const name = row.setting?.replace(/^shortcuts\./, "");
        if (!row.setting?.startsWith("shortcuts.") || !name || !isShortcutName(name)) return row;
        return { ...row, synonyms: [...row.synonyms, ...keySynonyms(keys[name])] };
      }),
    [keys],
  );
}

/// Matches grouped by category, best match first inside each group.
function SearchResults({
  results,
  query,
  onClear,
}: {
  results: RowSpec[];
  query: string;
  onClear: () => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm">No settings match “{query.trim()}”.</p>
        <p className="text-xs text-muted-foreground">
          Check the spelling, try a different word, or clear the search to browse every setting.
        </p>
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear search
        </Button>
      </div>
    );
  }
  return PAGE_ORDER.map((page) => {
    const rows = results.filter((r) => pageOf(r) === page);
    if (rows.length === 0) return null;
    return (
      <section key={page} id={`settings-results-${page}`} className="pb-4">
        <h3 className="pb-1 text-xs font-medium text-muted-foreground">{PAGES[page].label}</h3>
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </section>
    );
  });
}

/// A footer button that runs one action and shows its result on the button.
function FooterActionButton({
  action,
  icon,
  label,
  tooltip,
}: {
  action: () => Promise<void>;
  icon: ReactNode;
  label: string;
  tooltip: string;
}) {
  const run = useMutation({ mutationFn: action });
  const status = useActionStatus(run);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => !run.isPending && run.mutate()}
        >
          <StatusButtonContent
            status={status}
            icon={icon}
            label={label}
            errorLabel="Couldn't open, try again"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/// Whether a key press happened while typing, where `/` is just a character.
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/// A page of the navigation. While searching it shows how many matches it holds.
function PageButton({
  page,
  active,
  count,
  searching,
  onPick,
}: {
  page: PageId;
  active: boolean;
  count: number;
  searching: boolean;
  onPick: () => void;
}) {
  const { label, icon: Icon } = PAGES[page];
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onPick}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60",
        searching && count === 0 && "opacity-50",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {searching && (
        <span className="text-xs tabular-nums" aria-label={`${count} matches`}>
          {count}
        </span>
      )}
    </button>
  );
}

/// The full size Settings dialog: search and a flat, grouped list of pages on the left, the
/// rows of the page on the right. Opened from the titlebar, the command palette and Cmd+,.
export function SettingsDialog() {
  const open = useNavStore((s) => s.settingsOpen);
  const setOpen = useNavStore((s) => s.setSettingsOpen);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<PageId>("general");
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = query.trim() !== "";
  const results = searchSettings(query, useSearchableRows());

  // Closed from anywhere (another overlay opening, Cmd+,), it reopens with a clean search.
  useEffect(() => {
    if (!open) {
      setQuery("");
      cancelPendingShortcut();
    }
  }, [open]);

  // `/` jumps to the search, unless it is being typed as a character.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function pageButton(id: PageId) {
    return (
      <PageButton
        key={id}
        page={id}
        active={!searching && page === id}
        count={results.filter((r) => pageOf(r) === id).length}
        searching={searching}
        onPick={() => pick(id)}
      />
    );
  }

  function pick(next: PageId) {
    setPage(next);
    if (!searching) return;
    document
      .getElementById(`settings-results-${next}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          if (!searching) return;
          e.preventDefault();
          setQuery("");
        }}
        className="flex h-[min(46rem,calc(100vh-3rem))] w-[calc(100vw-3rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Search or browse every Nookly setting by category.
        </DialogDescription>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-56 shrink-0 flex-col border-r border-border">
            <div className="relative shrink-0 p-2 pb-1">
              <IconSearch
                size={14}
                className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchRef}
                type="search"
                aria-label="Search settings"
                placeholder="Search settings"
                className="px-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {!searching && (
                <Kbd
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
                >
                  /
                </Kbd>
              )}
            </div>
            <nav
              aria-label="Settings categories"
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2"
            >
              {NAV_GROUPS.map((group, index) => (
                <div
                  key={group.label ?? index}
                  role={group.label ? "group" : undefined}
                  aria-label={group.label ?? undefined}
                  className="flex flex-col gap-0.5"
                >
                  {group.label && (
                    <p
                      aria-hidden
                      className="px-2.5 pb-0.5 text-xs font-medium text-muted-foreground/80"
                    >
                      {group.label}
                    </p>
                  )}
                  {group.pages.map(pageButton)}
                </div>
              ))}
            </nav>
            <div className="flex shrink-0 flex-col gap-0.5 border-t border-border p-2">
              {FOOTER_PAGES.map(pageButton)}
              <FooterActionButton
                action={openSettingsFile}
                icon={<IconFileCode size={16} />}
                label="Show settings file"
                tooltip="Edit settings.json in your editor. Quit Nookly first, it saves over edits made while it runs."
              />
              <FooterActionButton
                action={openLogsFolder}
                icon={<IconFileText size={16} />}
                label="Open logs folder"
                tooltip="Show the folder with Nookly's log files. Attach them when you report a problem."
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            <h2 className="pb-3 text-lg font-semibold">
              {searching ? "Search results" : PAGES[page].label}
            </h2>
            {searching ? (
              <SearchResults results={results} query={query} onClear={() => setQuery("")} />
            ) : (
              <PageRows page={page} />
            )}
          </div>
        </div>
      </DialogContent>
      <ShortcutConflictDialog />
    </Dialog>
  );
}
