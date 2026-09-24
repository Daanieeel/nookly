import {
  IconArrowUp,
  IconBookmark,
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconTag,
  IconWorld,
} from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusIcon, useActionStatus } from "@/components/action-feedback";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import { type ActiveFilter, type FilterField, FilterMenu } from "@/components/filter-menu";
import {
  buildGroups,
  isCollapsed,
  moveRowFocus,
  toggleId,
} from "@/components/grouped-view/grouping";
import { LabelChip, LabelDot } from "@/components/label-chip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateShortcut } from "@/hooks/use-create-shortcut";
import { createBookmark, fetchBookmarkMetadata, listBookmarks } from "@/lib/api/bookmarks";
import type { Bookmark, Label } from "@/lib/api/types";
import { readClipboardText } from "@/lib/clipboard";
import { formatShortDate } from "@/lib/datetime";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { BookmarkDisplayMenu } from "./BookmarkDisplayMenu";
import {
  type DisplayOptions,
  bookmarkGroupDefs,
  bookmarkTitle,
  hostOf,
  orderBookmarks,
  readDisplay,
  useCaptureScreenshot,
  useSpaceLabels,
  writeDisplay,
} from "./bookmark-model";
import { Favicon, Preview } from "./bookmark-preview";

const MAX_CHIPS = 3;

/// Bookmarks already sent for a snapshot this session, so one that can't be
/// captured isn't retried on every visit. "Refresh Preview" always retries.
const captureAttempted = new Set<string>();

function looksLikeUrl(text: string): boolean {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text.trim());
}

/// "Labels is any of" matches a bookmark carrying any chosen label, "is not" one
/// carrying none of them.
function passesFilters(bookmark: Bookmark, filters: ActiveFilter[]): boolean {
  return filters.every((f) => {
    const hit =
      f.fieldId === "labels"
        ? bookmark.labelIds.some((id) => f.values.includes(id))
        : f.values.includes(hostOf(bookmark.url));
    return f.operator === "is" ? hit : !hit;
  });
}

/// Bookmarks as a wall of link previews, or a dense list. Pasting a URL is the
/// way in: into the floating field at the bottom, or anywhere on the page. The
/// new card shows up at once and fills in as the page's metadata arrives.
export function BookmarksListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openDetails = useNavStore((s) => s.setBookmarkSheetId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [display, setDisplayState] = useState<DisplayOptions>(readDisplay);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: bookmarks = [], isPending } = useQuery({
    queryKey: ["bookmarks", spaceId],
    queryFn: () => listBookmarks(spaceId),
  });
  const labels = useSpaceLabels(spaceId);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const setDisplay = (next: DisplayOptions) => {
    setDisplayState(next);
    writeDisplay(next);
  };

  const capture = useCaptureScreenshot(spaceId);
  const add = useMutation({
    mutationFn: async (u: string) => {
      const bookmark = await createBookmark(spaceId, u);
      captureAttempted.add(bookmark.entity.id);
      // Best effort: offline, the card keeps its placeholder until metadata is
      // refreshed later. The `og:image` shows while the page itself is captured.
      fetchBookmarkMetadata(bookmark.entity.id, u)
        .then(() => queryClient.invalidateQueries({ queryKey: ["bookmarks", spaceId] }))
        .catch(() => {})
        .finally(() => capture.mutate(bookmark.entity.id));
      return bookmark;
    },
    onSuccess: async (bookmark) => {
      await queryClient.invalidateQueries({ queryKey: ["bookmarks", spaceId] });
      setUrl("");
      setPendingUrl(null);
      setFreshId(bookmark.entity.id);
      setTimeout(() => setFreshId(null), 2000);
    },
    onError: () => setPendingUrl(null),
  });
  const addStatus = useActionStatus(add);

  const submit = useCallback(
    (u: string) => {
      const trimmed = u.trim();
      if (!trimmed || add.isPending) return;
      setPendingUrl(trimmed);
      add.mutate(trimmed);
    },
    [add],
  );

  // Bookmarks saved before snapshots existed, or whose capture failed last session.
  const { mutate: captureMutate } = capture;
  useEffect(() => {
    for (const b of bookmarks) {
      if (b.screenshotPath || captureAttempted.has(b.entity.id)) continue;
      captureAttempted.add(b.entity.id);
      captureMutate(b.entity.id);
    }
  }, [bookmarks, captureMutate]);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  useCreateShortcut(focusInput);

  // A URL pasted anywhere on the page, outside a text field, saves it right away.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))
      ) {
        return;
      }
      if (document.querySelector("[role=dialog],[role=menu]")) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!looksLikeUrl(text)) return;
      e.preventDefault();
      submit(text);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [submit]);

  const filterFields = useMemo<FilterField[]>(() => {
    const used = labels.filter((l) => bookmarks.some((b) => b.labelIds.includes(l.id)));
    const hosts = [...new Set(bookmarks.map((b) => hostOf(b.url)))].sort();
    return [
      {
        id: "labels",
        label: "Labels",
        icon: IconTag,
        options: used.map((l) => ({ value: l.id, label: l.name, icon: <LabelDot label={l} /> })),
      },
      {
        id: "site",
        label: "Site",
        icon: IconWorld,
        options: hosts.map((host) => ({ value: host, label: host })),
      },
    ];
  }, [labels, bookmarks]);

  const visible = orderBookmarks(
    bookmarks.filter((b) => passesFilters(b, filters)),
    display.ordering,
  );
  const defs = bookmarkGroupDefs(display.grouping, visible, labels);
  const groups = buildGroups(
    visible,
    defs ?? [{ id: "all", name: "All bookmarks", match: () => true }],
    null,
  ).filter((g) => g.items.length > 0);
  const labelsOf = (b: Bookmark) => b.labelIds.flatMap((id) => labelById.get(id) ?? []);

  const renderItems = (items: Bookmark[], withPending: boolean) =>
    display.layout === "grid" ? (
      <ul
        aria-label="Bookmarks"
        className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 p-4"
      >
        {withPending && pendingUrl && (
          <PendingCard url={pendingUrl} preview={display.showPreviews} />
        )}
        {items.map((b) => (
          <BookmarkCard
            key={b.entity.id}
            bookmark={b}
            labels={labelsOf(b)}
            display={display}
            fresh={freshId === b.entity.id}
            onOpenDetails={() => openDetails(b.entity.id)}
          />
        ))}
      </ul>
    ) : (
      <div>
        {withPending && pendingUrl && <PendingRow url={pendingUrl} />}
        {items.map((b) => (
          <BookmarkRow
            key={b.entity.id}
            bookmark={b}
            labels={labelsOf(b)}
            showDescription={display.showDescriptions}
            fresh={freshId === b.entity.id}
            onOpenDetails={() => openDetails(b.entity.id)}
          />
        ))}
      </div>
    );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Bookmark from Clipboard",
        create: () => void readClipboardText().then(submit),
      })}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconBookmark size={16} className="text-muted-foreground" />
          Bookmarks
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="min-w-0 flex-1">
            <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
          </div>
          <BookmarkDisplayMenu display={display} onChange={setDisplay} />
        </div>
      </header>

      {!isPending && bookmarks.length === 0 && !pendingUrl ? (
        <div className="p-6">
          <EmptyState
            icon={IconBookmark}
            title="No bookmarks yet"
            description="Paste a link anywhere on this page. Title, icon and preview are filled in for you."
            action={{ label: "Paste a URL", onClick: focusInput }}
          />
        </div>
      ) : visible.length === 0 && !pendingUrl ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">No bookmarks match these filters.</p>
          <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
            Clear filters
          </Button>
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
        <div className="min-h-0 flex-1 overflow-y-auto pb-24" onKeyDown={moveRowFocus}>
          {defs === null
            ? renderItems(visible, true)
            : groups.map((group, i) => (
                <GroupSection
                  key={group.id}
                  name={group.name}
                  count={group.items.length}
                  collapsed={isCollapsed(collapsed, group.id, false)}
                  onToggle={() => setCollapsed((prev) => toggleId(prev, group.id))}
                >
                  {renderItems(group.items, i === 0)}
                </GroupSection>
              ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(url);
        }}
        className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4"
      >
        <div
          className={cn(
            "pointer-events-auto flex w-full max-w-lg items-center gap-2 rounded-xl border border-border bg-popover py-1.5 pr-1.5 pl-3 shadow-lg transition-colors focus-within:border-foreground/30",
            add.isError && "border-destructive/60",
          )}
        >
          <IconLink size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            placeholder="Paste a URL to save it"
            aria-label={add.isError ? `Couldn't save the bookmark: ${add.error.message}` : "URL"}
            aria-invalid={add.isError || undefined}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd className="max-sm:hidden">C</Kbd>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                size="iconSm"
                aria-label={add.isError ? "Couldn't save, try again" : "Save Bookmark"}
                disabled={!url.trim() && addStatus === "idle"}
              >
                <StatusIcon status={addStatus} idle={<IconArrowUp />} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {add.isError ? "Couldn't save, try again" : "Save Bookmark"}
            </TooltipContent>
          </Tooltip>
        </div>
      </form>
    </div>
  );
}

function GroupSection({
  name,
  count,
  collapsed,
  onToggle,
  children,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={name}>
      <div className="sticky top-0 z-30 flex h-9 items-center border-b border-border bg-card px-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
        >
          {collapsed ? (
            <IconCaretRightFilled size={10} className="text-muted-foreground" />
          ) : (
            <IconCaretDownFilled size={10} className="text-muted-foreground" />
          )}
          <span className="truncate font-medium">{name}</span>
          <span className="text-muted-foreground tabular-nums">{count}</span>
        </button>
      </div>
      {!collapsed && children}
    </section>
  );
}

function PendingCard({ url, preview }: { url: string; preview: boolean }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {preview && <Skeleton className="aspect-[1.91/1] w-full rounded-none" />}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <p className="truncate text-xs text-muted-foreground">{hostOf(url)}</p>
      </div>
    </li>
  );
}

function PendingRow({ url }: { url: string }) {
  return (
    <div className="flex h-11 items-center gap-3 border-b border-border/60 px-4">
      <Skeleton className="size-4 rounded-sm" />
      <Skeleton className="h-4 w-1/3" />
      <span className="ml-auto truncate text-xs text-muted-foreground">{hostOf(url)}</span>
    </div>
  );
}

function LabelChips({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, MAX_CHIPS);
  const extra = labels.length - shown.length;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {shown.map((label) => (
        <LabelChip key={label.id} label={label} className="rounded-full border-foreground/10" />
      ))}
      {extra > 0 && <span className="text-xs text-muted-foreground">+{extra}</span>}
    </span>
  );
}

function DetailsButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <span className={cn("relative z-20 flex", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="iconSm"
            aria-label="Open Details"
            onClick={onClick}
            className="size-6"
          >
            <IconLayoutSidebarRightExpand />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open Details</TooltipContent>
      </Tooltip>
    </span>
  );
}

/// A rich link preview. The card opens the page in the browser; the corner
/// button opens the details sheet.
function BookmarkCard({
  bookmark,
  labels,
  display,
  fresh,
  onOpenDetails,
}: {
  bookmark: Bookmark;
  labels: Label[];
  display: DisplayOptions;
  fresh: boolean;
  onOpenDetails: () => void;
}) {
  const title = bookmarkTitle(bookmark);
  const added = formatShortDate(bookmark.entity.createdAt);
  return (
    <li
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors focus-within:border-foreground/30 hover:border-foreground/20",
        fresh && "border-primary/50 ring-1 ring-primary/30",
      )}
      {...entityTarget(bookmark.entity, bookmark)}
    >
      <button
        type="button"
        data-task-row
        aria-label={`Open ${title} in Browser`}
        onClick={() => openUrl(bookmark.url)}
        className="absolute inset-0 z-10 cursor-pointer outline-none"
      />
      {display.showPreviews && (
        <div className="pointer-events-none aspect-[1.91/1] overflow-hidden border-b border-border/60">
          <Preview bookmark={bookmark} />
        </div>
      )}
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Favicon bookmark={bookmark} />
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        {display.showDescriptions && bookmark.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{bookmark.description}</p>
        )}
        <div className="mt-auto flex min-w-0 items-center gap-2 pt-1">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {bookmark.metadataFetchedAt
              ? `${hostOf(bookmark.url)} · ${added}`
              : `Added on ${added}, preview comes once online`}
          </p>
          <LabelChips labels={labels} />
        </div>
      </div>
      <DetailsButton
        onClick={onOpenDetails}
        className="absolute top-2 right-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
    </li>
  );
}

function BookmarkRow({
  bookmark,
  labels,
  showDescription,
  fresh,
  onOpenDetails,
}: {
  bookmark: Bookmark;
  labels: Label[];
  showDescription: boolean;
  fresh: boolean;
  onOpenDetails: () => void;
}) {
  const title = bookmarkTitle(bookmark);
  return (
    <div
      className={cn(
        "group relative flex h-11 items-center gap-3 border-b border-border/60 px-4 transition-colors focus-within:bg-accent/50 hover:bg-accent/40",
        fresh && "bg-primary/5",
      )}
      {...entityTarget(bookmark.entity, bookmark)}
    >
      <button
        type="button"
        data-task-row
        aria-label={`Open ${title} in Browser`}
        onClick={() => openUrl(bookmark.url)}
        className="absolute inset-0 cursor-pointer outline-none"
      />
      <span className="pointer-events-none relative flex">
        <Favicon bookmark={bookmark} />
      </span>
      <span className="pointer-events-none relative min-w-0 shrink truncate text-sm">{title}</span>
      {showDescription && bookmark.description && (
        <span className="pointer-events-none relative min-w-0 flex-1 truncate text-xs text-muted-foreground max-md:hidden">
          {bookmark.description}
        </span>
      )}
      <span className="pointer-events-none relative ml-auto flex shrink-0 items-center gap-3">
        <LabelChips labels={labels} />
        <span className="w-32 truncate text-right text-xs text-muted-foreground max-sm:hidden">
          {hostOf(bookmark.url)}
        </span>
        <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
          {formatShortDate(bookmark.entity.createdAt)}
        </span>
      </span>
      <DetailsButton onClick={onOpenDetails} />
    </div>
  );
}
