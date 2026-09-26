import {
  IconArrowUp,
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconCategory,
  IconExternalLink,
  IconFile,
  IconFileUpload,
  IconLink,
  IconRefresh,
  IconTag,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import {
  type ActionStatus,
  StatusButtonContent,
  StatusIcon,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { contextTarget, entityTarget } from "#/components/context-menu/registry.ts";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityKeyCopyInline } from "#/components/entity-key.tsx";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "#/components/filter-menu.tsx";
import { FLOATING_BAR_INPUT, FloatingBar } from "#/components/floating-bar.tsx";
import {
  buildGroups,
  isCollapsed,
  moveRowFocus,
  toggleId,
} from "#/components/grouped-view/grouping.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  hostOf,
  useCaptureScreenshot,
  useSpaceLabels,
} from "#/features/bookmarks/bookmark-model.ts";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";
import { LabelDot } from "#/components/label-chip.tsx";
import { createBookmark, fetchBookmarkMetadata } from "#/lib/api/bookmarks.ts";
import { convertEntity } from "#/lib/api/entities.ts";
import {
  importFile,
  importFileFromUrl,
  listFiles,
  referenceFile,
  reindexMissingFiles,
} from "#/lib/api/files.ts";
import type { FileEntity } from "#/lib/api/types.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import { FileDisplayMenu } from "./FileDisplayMenu";
import {
  FILE_KINDS,
  fileExtension,
  fileKind,
  filePath,
  isReference,
  isViewable,
} from "./file-kind";
import {
  type DisplayOptions,
  fileGroupDefs,
  orderFiles,
  readDisplay,
  writeDisplay,
} from "./file-model";
import { useNavStore } from "#/lib/store/nav.ts";

/// Marks items that just arrived for a moment, so a new file never appears silently.
function useFreshIds() {
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const mark = useCallback((ids: string[]) => {
    setFresh(new Set(ids));
    setTimeout(() => setFresh(new Set()), 2000);
  }, []);
  return [fresh, mark] as const;
}

/// A local path as typed, pasted or copied from Finder: absolute, `~/`, or a
/// `file://` URL, with shell escapes and wrapping quotes removed. Null for
/// anything else.
async function localPath(text: string): Promise<string | null> {
  const raw = text.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (raw.startsWith("file://")) return decodeURIComponent(new URL(raw).pathname);
  const unescaped = raw.replace(/\\(.)/g, "$1");
  if (unescaped.startsWith("~/")) return join(await homeDir(), unescaped.slice(2));
  if (unescaped.startsWith("/")) return unescaped;
  return null;
}

/// "example.com/x" gets its scheme; anything that isn't a web address is null.
function webUrl(text: string): string | null {
  const raw = text.trim();
  if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(raw)) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

type Added =
  | { kind: "files"; files: FileEntity[]; fromLink: boolean }
  | { kind: "webpage"; url: string };

/// What the bar offers after a link: a webpage to save as a Bookmark, or a
/// downloaded file the viewer can't show, which may be better as a Bookmark.
type Offer = { kind: "webpage"; url: string } | { kind: "unviewable"; file: FileEntity };

/// Files like Finder's icon view: a grid of type tinted tiles by default, a dense
/// list as the alternative. Dropping files anywhere on the window is the main way
/// in; the floating bar takes a link or a path, or opens the file picker.
export function FilesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const inputRef = useRef<HTMLInputElement>(null);
  const [display, setDisplayState] = useState<DisplayOptions>(readDisplay);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [fresh, markFresh] = useFreshIds();

  const { data: files = [], isPending } = useQuery({
    queryKey: ["files", spaceId],
    queryFn: () => listFiles(spaceId),
  });
  const labels = useSpaceLabels(spaceId);

  const setDisplay = (next: DisplayOptions) => {
    setDisplayState(next);
    writeDisplay(next);
  };

  const imported = (created: FileEntity[]) => {
    markFresh(created.map((f) => f.entity.id));
    return queryClient.invalidateQueries({ queryKey: ["files", spaceId] });
  };
  const pickAndImport = useMutation({
    mutationFn: async () => {
      const selected = await open({ multiple: true, directory: false });
      if (!selected) return null;
      const paths = Array.isArray(selected) ? selected : [selected];
      return Promise.all(paths.map((path) => importFile(spaceId, path)));
    },
    onSuccess: (created) => created && imported(created),
  });
  /// A typed path imports that file; a link downloads what's behind it, unless
  /// it's a webpage, which is offered as a Bookmark instead.
  const addFromText = useMutation({
    mutationFn: async (value: string): Promise<Added> => {
      const path = await localPath(value);
      // A typed path is referenced where it is; copying it in is one click later.
      if (path)
        return { kind: "files", files: [await referenceFile(spaceId, path)], fromLink: false };
      const url = webUrl(value);
      if (!url) throw new Error("that's neither a link nor a file path");
      const result = await importFileFromUrl(spaceId, url);
      return result.kind === "file"
        ? { kind: "files", files: [result.file], fromLink: true }
        : { kind: "webpage", url };
    },
    onSuccess: async (added) => {
      if (added.kind === "webpage") {
        setOffer({ kind: "webpage", url: added.url });
        return;
      }
      setText("");
      await imported(added.files);
      const [file] = added.files;
      if (added.fromLink && file && !isViewable(file)) setOffer({ kind: "unviewable", file });
    },
  });
  const capture = useCaptureScreenshot(spaceId);
  /// A webpage becomes a new Bookmark; an unviewable download converts in place,
  /// keeping its id, labels and relationships.
  const saveBookmark = useMutation({
    mutationFn: async (target: Offer) => {
      const id =
        target.kind === "webpage"
          ? (await createBookmark(spaceId, target.url)).entity.id
          : (await convertEntity(target.file.entity.id, "bookmark")).id;
      const url = target.kind === "webpage" ? target.url : (target.file.url ?? "");
      fetchBookmarkMetadata(id, url)
        .catch(() => {})
        .finally(() => capture.mutate(id));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookmarks", spaceId] });
      void queryClient.invalidateQueries({ queryKey: ["files", spaceId] });
      setText("");
      // The check shows on the bar for a moment before it returns to the field.
      setTimeout(() => {
        setOffer(null);
        saveBookmark.reset();
      }, 2000);
    },
  });

  /// Backfills search content for every File missing an index — the header's
  /// "Reindex" button, shown only while at least one File still needs it.
  const reindexMissing = useMutation({
    mutationFn: () => reindexMissingFiles(spaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files", spaceId] }),
  });
  const reindexStatus = useActionStatus(reindexMissing);

  const pickStatusRaw = useActionStatus(pickAndImport);
  // A cancelled native open dialog resolves `null`: back to rest, not success.
  const pickStatus: ActionStatus =
    pickStatusRaw === "success" && pickAndImport.data === null ? "idle" : pickStatusRaw;
  const addStatus = useActionStatus(addFromText);
  const bookmarkStatus = useActionStatus(saveBookmark);

  const startImport = useCallback(() => {
    if (!pickAndImport.isPending) pickAndImport.mutate();
  }, [pickAndImport]);
  useCreateShortcut(startImport);

  const submitText = () => {
    if (text.trim() && !addFromText.isPending) addFromText.mutate(text);
  };
  const dismissOffer = () => {
    setOffer(null);
    addFromText.reset();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const filterFields = useMemo<FilterField[]>(() => {
    const present = new Set(files.map((f) => fileKind(f).id));
    const usedLabels = labels.filter((l) => files.some((f) => f.labelIds.includes(l.id)));
    return [
      {
        id: "kind",
        label: "Kind",
        icon: IconCategory,
        options: FILE_KINDS.filter((k) => present.has(k.id)).map((k) => ({
          value: k.id,
          label: k.label,
          icon: <k.icon size={14} className={k.tone} />,
        })),
      },
      {
        id: "labels",
        label: "Labels",
        icon: IconTag,
        options: usedLabels.map((l) => ({ value: l.id, label: l.name, icon: <LabelDot label={l} /> })),
      },
    ];
  }, [files, labels]);

  const visible = orderFiles(
    applyFilters(files, filters, (f, fieldId) =>
      fieldId === "labels" ? f.labelIds : fileKind(f).id,
    ),
    display.ordering,
  );
  const defs = fileGroupDefs(display.grouping);
  const groups = buildGroups(
    visible,
    defs ?? [{ id: "all", name: "All files", match: () => true }],
    null,
  ).filter((g) => g.items.length > 0);
  const openFile = (f: FileEntity) => openEntity(f.entity.id, spaceId);

  const renderItems = (items: FileEntity[]) =>
    display.layout === "grid" ? (
      <ul
        aria-label="Files"
        className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 p-4"
      >
        {items.map((f) => (
          <FileTile
            key={f.entity.id}
            file={f}
            fresh={fresh.has(f.entity.id)}
            onOpen={() => openFile(f)}
          />
        ))}
      </ul>
    ) : (
      <div>
        {items.map((f) => (
          <FileRow
            key={f.entity.id}
            file={f}
            fresh={fresh.has(f.entity.id)}
            onOpen={() => openFile(f)}
          />
        ))}
      </div>
    );

  const addError = addFromText.isError
    ? `Couldn't add it: ${addFromText.error.message}`
    : saveBookmark.isError
      ? `Couldn't save the bookmark: ${saveBookmark.error.message}`
      : null;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "Import a File…",
        create: startImport,
      })}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconFile size={16} className="text-muted-foreground" />
          Files
        </h1>
        {files.some((f) => f.needsReindex) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={reindexMissing.isPending}
                onClick={() => reindexStatus === "idle" && reindexMissing.mutate()}
              >
                <StatusButtonContent
                  status={reindexStatus}
                  icon={<IconRefresh />}
                  label="Reindex"
                  successLabel={
                    reindexMissing.data
                      ? `${reindexMissing.data.reindexed} reindexed`
                      : "Reindexed"
                  }
                  errorLabel="Couldn't reindex, try again"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Index older files for search</TooltipContent>
          </Tooltip>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="min-w-0 flex-1">
            <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
          </div>
          <FileDisplayMenu display={display} onChange={setDisplay} />
        </div>
      </header>

      {!isPending && files.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={IconFileUpload}
            title="No files yet"
            description="Choose files to import, or paste a link to a file below. Nookly keeps its own copy."
            action={{ label: "Choose files", onClick: startImport }}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">No files match these filters.</p>
          <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
            Clear filters
          </Button>
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
        <div className="min-h-0 flex-1 overflow-y-auto pb-24" onKeyDown={moveRowFocus}>
          {defs === null
            ? renderItems(visible)
            : groups.map((group) => (
                <GroupSection
                  key={group.id}
                  name={group.name}
                  count={group.items.length}
                  collapsed={isCollapsed(collapsed, group.id, false)}
                  onToggle={() => setCollapsed((prev) => toggleId(prev, group.id))}
                >
                  {renderItems(group.items)}
                </GroupSection>
              ))}
        </div>
      )}

      {offer ? (
        <FloatingBar
          onSubmit={() => bookmarkStatus === "idle" && saveBookmark.mutate(offer)}
          failed={saveBookmark.isError}
        >
          {offer.kind === "webpage" ? (
            <>
              <IconWorld size={16} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm" title={offer.url}>
                <span className="font-medium">{hostOf(offer.url)}</span>
                <span className="text-muted-foreground"> is a webpage, not a file.</span>
              </span>
            </>
          ) : (
            <>
              <StatusIcon status="success" idle={null} />
              <span className="min-w-0 flex-1 truncate text-sm" title={offer.file.url ?? undefined}>
                <span className="font-medium">{displayTitle(offer.file.entity)}</span>
                <span className="text-muted-foreground"> added, but it can't be shown here.</span>
              </span>
            </>
          )}
          <Button type="submit" variant="secondary" size="sm" className="shrink-0">
            <StatusButtonContent
              status={bookmarkStatus}
              label={offer.kind === "webpage" ? "Save as Bookmark" : "Convert to Bookmark"}
              successLabel="Saved to Bookmarks"
              errorLabel="Couldn't save, try again"
            />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                aria-label={offer.kind === "webpage" ? "Dismiss" : "Keep as File"}
                onClick={dismissOffer}
              >
                <IconX />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{offer.kind === "webpage" ? "Dismiss" : "Keep as File"}</TooltipContent>
          </Tooltip>
        </FloatingBar>
      ) : (
        <FloatingBar onSubmit={submitText} failed={addError !== null}>
          <IconLink size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            placeholder="Paste a link or file path"
            aria-label={addError ?? "Link or file path"}
            aria-invalid={addError !== null || undefined}
            title={addError ?? undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (addFromText.isError) addFromText.reset();
            }}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            className={FLOATING_BAR_INPUT}
          />
          {(text.trim() || addStatus !== "idle") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  variant="ghost"
                  size="iconSm"
                  aria-label={addError ? "Couldn't add, try again" : "Add File"}
                >
                  <StatusIcon status={addStatus} idle={<IconArrowUp />} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{addError ?? "Add File"}</TooltipContent>
            </Tooltip>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">or</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={startImport}
              >
                <StatusButtonContent
                  status={pickStatus}
                  icon={<IconFileUpload />}
                  label="Choose Files"
                  successLabel="Imported"
                  errorLabel="Couldn't import, try again"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Choose files to import <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </FloatingBar>
      )}
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

/// "PDF · Sep 24", or the provider for a cloud link.
function fileMeta(file: FileEntity): string {
  const kind = fileKind(file);
  const ext = fileExtension(file);
  const label = kind.id === "other" && ext ? ext.toUpperCase() : kind.label;
  const where = isReference(file) ? " · On disk" : "";
  return `${label} · ${formatShortDate(file.entity.createdAt)}${where}`;
}

function FilePreview({ file }: { file: FileEntity }) {
  const kind = fileKind(file);
  const [broken, setBroken] = useState(false);
  const ext = fileExtension(file);
  const path = filePath(file);
  if (kind.id === "image" && path && !broken) {
    return (
      <img
        src={convertFileSrc(path)}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="size-full object-cover"
      />
    );
  }
  return (
    <>
      <kind.icon size={36} stroke={1.5} className={kind.tone} />
      {ext && (
        <Badge variant="secondary" className="absolute bottom-1.5 left-1.5 uppercase">
          {ext}
        </Badge>
      )}
    </>
  );
}

function OpenLinkButton({
  url,
  variant = "ghost",
  className,
}: {
  url: string;
  variant?: "ghost" | "secondary";
  className?: string;
}) {
  return (
    <span className={cn("relative flex", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size="iconSm"
            aria-label="Open Link"
            onClick={() => openUrl(url)}
            className="size-6"
          >
            <IconExternalLink />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open Link</TooltipContent>
      </Tooltip>
    </span>
  );
}

export function FileTile({
  file,
  fresh,
  onOpen,
}: {
  file: FileEntity;
  fresh: boolean;
  onOpen: () => void;
}) {
  const title = displayTitle(file.entity);
  return (
    <li
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg p-1.5 transition-colors focus-within:bg-accent/50 hover:bg-accent/40",
        fresh && "bg-primary/5 ring-1 ring-primary/40",
      )}
      {...entityTarget(file.entity, file)}
    >
      <button
        type="button"
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer rounded-lg outline-none"
      />
      <div className="pointer-events-none relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40">
        <FilePreview file={file} />
      </div>
      <div className="pointer-events-none relative flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{fileMeta(file)}</span>
      </div>
      {file.url && (
        <OpenLinkButton
          url={file.url}
          variant="secondary"
          className="absolute top-2.5 right-2.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        />
      )}
    </li>
  );
}

export function FileRow({
  file,
  fresh,
  onOpen,
}: {
  file: FileEntity;
  fresh: boolean;
  onOpen: () => void;
}) {
  const title = displayTitle(file.entity);
  const kind = fileKind(file);
  return (
    <div
      className={cn(
        "relative flex h-11 items-center gap-3 border-b border-border/60 px-4 transition-colors focus-within:bg-accent/50 hover:bg-accent/40",
        fresh && "bg-primary/5",
      )}
      {...entityTarget(file.entity, file)}
    >
      <button
        type="button"
        data-task-row
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer outline-none"
      />
      <kind.icon size={16} className={cn("pointer-events-none relative shrink-0", kind.tone)} />
      <span className="relative hidden w-20 shrink-0 sm:flex">
        <EntityKeyCopyInline entityKey={file.entity.key} className="-ml-1" />
      </span>
      <span className="pointer-events-none relative min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="pointer-events-none relative w-28 shrink-0 truncate text-xs text-muted-foreground max-md:hidden">
        {kind.label}
      </span>
      <span className="pointer-events-none relative w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {formatShortDate(file.entity.createdAt)}
      </span>
      <span className="relative flex w-6 shrink-0 justify-end">
        {file.url && <OpenLinkButton url={file.url} />}
      </span>
    </div>
  );
}
