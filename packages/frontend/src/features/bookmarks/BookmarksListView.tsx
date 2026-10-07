import { qk } from "#/lib/query-keys.ts";
import {
  IconArrowUp,
  IconBookmark,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconTag,
  IconWorld,
} from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GroupedList } from "#/features/group-section.tsx";
import { z } from "zod";
import { StatusIcon, useActionStatus } from "#/components/action-feedback.tsx";
import { contextTarget, entityTarget } from "#/components/context-menu/registry.ts";
import { EmptyState } from "#/components/empty-state.tsx";
import { hasVisibleErrors } from "#/components/form-field.tsx";
import { FLOATING_BAR_INPUT, FloatingBar } from "#/components/floating-bar.tsx";
import { type ActiveFilter, type FilterField, FilterMenu } from "#/components/filter-menu.tsx";
import { LabelChip, LabelDot } from "#/components/label-chip.tsx";
import { Button } from "@nookly/ui/components/button";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Skeleton } from "@nookly/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";
import { createBookmark, fetchBookmarkMetadata, listBookmarks } from "#/lib/api/bookmarks.ts";
import type { Bookmark, Label } from "#/lib/api/types.ts";
import { readClipboardText } from "#/lib/clipboard.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
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
const urlSchema = z.object({ url: z.string().trim().min(1, "Paste a URL to save") });

export function BookmarksListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openDetails = useNavStore((s) => s.setBookmarkSheetId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [display, setDisplayState] = useState<DisplayOptions>(readDisplay);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const form = useForm({
    defaultValues: { url: "" },
    validators: { onChange: urlSchema },
    onSubmit: ({ value }) => submit(value.url),
  });
  const emptyError = useStore(form.store, (state) =>
    hasVisibleErrors(state) ? "Paste a URL to save" : null,
  );

  const { data: bookmarks = [], isPending } = useQuery({
    queryKey: qk.bookmarks.bySpace(spaceId),
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
        .then(() => queryClient.invalidateQueries({ queryKey: qk.bookmarks.bySpace(spaceId) }))
        .catch(() => {})
        .finally(() => capture.mutate(bookmark.entity.id));
      return bookmark;
    },
    onSuccess: async (bookmark) => {
      await queryClient.invalidateQueries({ queryKey: qk.bookmarks.bySpace(spaceId) });
      form.reset();
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
        <GroupedList
          items={visible}
          defs={defs}
          allName="All bookmarks"
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          renderItems={renderItems}
        />
      )}

      <FloatingBar
        onSubmit={() => void form.handleSubmit()}
        failed={add.isError || emptyError !== null}
      >
        <IconLink size={16} className="shrink-0 text-muted-foreground" />
        <form.Field name="url">
          {(field) => (
            <input
              ref={inputRef}
              placeholder="Paste a URL to save it"
              aria-label={
                add.isError
                  ? `Couldn't save the bookmark: ${add.error.message}`
                  : (emptyError ?? "URL")
              }
              aria-invalid={add.isError || emptyError !== null || undefined}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
              className={FLOATING_BAR_INPUT}
            />
          )}
        </form.Field>
        <ShortcutKbd name="create" className="max-sm:hidden" />
        <form.Subscribe selector={hasVisibleErrors}>
          {(blocked) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  size="iconSm"
                  aria-label={
                    add.isError ? "Couldn't save, try again" : (emptyError ?? "Save Bookmark")
                  }
                  disabled={blocked}
                >
                  <StatusIcon status={addStatus} idle={<IconArrowUp />} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {add.isError ? "Couldn't save, try again" : (emptyError ?? "Save Bookmark")}
              </TooltipContent>
            </Tooltip>
          )}
        </form.Subscribe>
      </FloatingBar>
    </div>
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
export function BookmarkCard({
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

export function BookmarkRow({
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
