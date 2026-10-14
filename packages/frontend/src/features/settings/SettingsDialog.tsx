import {
  IconArchive,
  IconFileCode,
  IconCalendar,
  IconKeyboard,
  IconMathFunction,
  IconNotes,
  IconPalette,
  IconRobot,
  IconUserCircle,
  IconSearch,
  IconSettings,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { openSettingsFile } from "#/lib/api/settings-file.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";
import { cn } from "@nookly/ui/lib/utils";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { SETTING_CATEGORIES, type SettingCategory } from "#/lib/settings/registry.ts";
import { searchSettings } from "#/lib/settings/search.ts";
import { useShortcutMap } from "#/hooks/use-shortcut.ts";
import { isShortcutName, keySynonyms } from "#/lib/shortcuts.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cancelPendingShortcut } from "./shortcut-editing.ts";
import { ShortcutConflictDialog } from "./ShortcutConflictDialog.tsx";
import { FixedShortcuts, ShortcutsToolbar } from "./ShortcutsTab.tsx";
import { SettingRow } from "./SettingRow.tsx";
import { ROWS, type RowSpec, sectionsOf } from "./setting-rows.tsx";
import { PAGE_TITLE_CLASSES, SECTION_HEADING_CLASSES } from "#/classes.ts";

const CATEGORY_META = {
  general: { label: "General", icon: IconSettings },
  appearance: { label: "Appearance", icon: IconPalette },
  calendar: { label: "Calendar", icon: IconCalendar },
  notes: { label: "Editor", icon: IconNotes },
  backup: { label: "Backup", icon: IconArchive },
  agent: { label: "Agent", icon: IconRobot },
  sync: { label: "Account", icon: IconUserCircle },
  shortcuts: { label: "Shortcuts", icon: IconKeyboard },
} satisfies Record<SettingCategory, { label: string; icon: TablerIcon }>;

/// A page of the dialog: a category, or the LaTeX page that sits under Editor.
type PageId = SettingCategory | "latex";

interface NavItem {
  id: PageId;
  category: SettingCategory;
  label: string;
  icon: TablerIcon;
  /// Drawn indented under the item before it.
  child?: boolean;
}

/// The navigation: every category, and under Editor its LaTeX page.
const NAV: NavItem[] = SETTING_CATEGORIES.flatMap((id): NavItem[] => {
  const item = { id, category: id, ...CATEGORY_META[id] };
  if (id !== "notes") return [item];
  return [
    item,
    { id: "latex", category: "notes", label: "LaTeX", icon: IconMathFunction, child: true },
  ];
});

/// The section of Editor that has a page of its own.
const LATEX_SECTION = "LaTeX";

/// Whether a row belongs to a page: the LaTeX page holds the LaTeX section of Editor, the
/// Editor page the rest of it.
function onPage(row: RowSpec, page: NavItem): boolean {
  if (row.category !== page.category) return false;
  if (page.category !== "notes") return true;
  return (row.section === LATEX_SECTION) === (page.id === "latex");
}

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
function CategoryRows({ page }: { page: NavItem }) {
  const { category } = page;
  const rows = ROWS.filter((r) => onPage(r, page));
  const pageSections = sectionsOf(category).filter((section) =>
    rows.some((r) => r.section === section),
  );
  const showHeadings = pageSections.length > 1;
  const sections = pageSections.map((section) => (
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
  if (category !== "shortcuts") return sections;
  return (
    <>
      <ShortcutsToolbar />
      {sections}
      <FixedShortcuts />
    </>
  );
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
  return SETTING_CATEGORIES.map((category) => {
    const rows = results.filter((r) => r.category === category);
    if (rows.length === 0) return null;
    return (
      <section key={category} id={`settings-results-${category}`} className="pb-4">
        <h3 className={SECTION_HEADING_CLASSES}>{CATEGORY_META[category].label}</h3>
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </section>
    );
  });
}

/// Opens `settings.json` in the user's editor. The result shows on the button.
function OpenSettingsFileButton() {
  const open = useMutation({ mutationFn: openSettingsFile });
  const status = useActionStatus(open);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => !open.isPending && open.mutate()}
        >
          <StatusButtonContent
            status={status}
            icon={<IconFileCode size={16} />}
            label="Open settings file"
            errorLabel="Couldn't open, try again"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Edit settings.json in your editor. Quit Nookly first, it saves over edits made while it
        runs.
      </TooltipContent>
    </Tooltip>
  );
}

/// The full size Settings dialog: search on top, categories on the left, rows on the right.
/// Opened from the titlebar, the command palette and Cmd+,.
export function SettingsDialog() {
  const open = useNavStore((s) => s.settingsOpen);
  const setOpen = useNavStore((s) => s.setSettingsOpen);
  const [query, setQuery] = useState("");
  const [pageId, setPageId] = useState<PageId>("general");
  const page = NAV.find((item) => item.id === pageId) ?? NAV[0];
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = query.trim() !== "";
  const results = searchSettings(query, useSearchableRows());

  // Opened on a page (Account, from the sync status): that page, once.
  const requestedPage = useNavStore((s) => s.settingsPage);
  useEffect(() => {
    if (!open || !requestedPage) return;
    const target = NAV.find((item) => item.id === requestedPage);
    if (target) setPageId(target.id);
    useNavStore.getState().clearSettingsPage();
  }, [open, requestedPage]);

  // Closed from anywhere (another overlay opening, Cmd+,), it reopens with a clean search.
  useEffect(() => {
    if (!open) {
      setQuery("");
      cancelPendingShortcut();
    }
  }, [open]);

  useAppHotkey("settings", () => setOpen(!useNavStore.getState().settingsOpen));

  function pick(next: NavItem) {
    setPageId(next.id);
    if (!searching) return;
    document
      .getElementById(`settings-results-${next.category}`)
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
        <div className="relative shrink-0 border-b border-border px-4 py-3 pr-12">
          <IconSearch
            size={14}
            className="pointer-events-none absolute top-1/2 left-7 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search settings"
            placeholder="Search settings"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-52 shrink-0 flex-col border-r border-border">
            <nav
              aria-label="Settings categories"
              className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2"
            >
              {NAV.map((item) => {
                const { label, icon: Icon } = item;
                const count = results.filter((r) => onPage(r, item)).length;
                const active = !searching && page.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => pick(item)}
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      item.child && "pl-7",
                      active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60",
                      searching && count === 0 && "opacity-50",
                    )}
                  >
                    <Icon size={item.child ? 14 : 16} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {searching && (
                      <span className="text-xs tabular-nums" aria-label={`${count} matches`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="shrink-0 p-2 pt-0">
              <OpenSettingsFileButton />
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            <h2 className={PAGE_TITLE_CLASSES}>{searching ? "Search results" : page.label}</h2>
            {searching ? (
              <SearchResults results={results} query={query} onClear={() => setQuery("")} />
            ) : (
              <CategoryRows page={page} />
            )}
          </div>
        </div>
      </DialogContent>
      <ShortcutConflictDialog />
    </Dialog>
  );
}
