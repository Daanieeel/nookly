import {
  IconCategory,
  IconDragDrop,
  IconExternalLink,
  IconFile,
  IconFileUpload,
  IconLayoutGrid,
  IconLink,
  IconList,
} from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ActionStatus,
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  statusTextClass,
  useActionStatus,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import { EntityKeyCopyInline } from "@/components/entity-key";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "@/components/filter-menu";
import { moveRowFocus } from "@/components/grouped-view/grouping";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateShortcut } from "@/hooks/use-create-shortcut";
import { createFileLink, importFile, listFiles } from "@/lib/api/files";
import type { FileEntity } from "@/lib/api/types";
import { formatShortDate } from "@/lib/datetime";
import { displayTitle } from "@/lib/entity-title";
import { preferences } from "@/lib/preferences";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { FILE_KINDS, fileExtension, fileKind } from "./file-kind";

type Layout = "grid" | "list";

function readLayout(): Layout {
  return preferences.get(STORAGE_KEYS.filesLayout) === "list" ? "list" : "grid";
}

/// Marks items that just arrived for a moment, so a new file never appears silently.
function useFreshIds() {
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const mark = useCallback((ids: string[]) => {
    setFresh(new Set(ids));
    setTimeout(() => setFresh(new Set()), 2000);
  }, []);
  return [fresh, mark] as const;
}

/// Files like Finder's icon view: a grid of type tinted tiles by default, a dense
/// list as the toggle. Dropping files anywhere on the window is the main way in;
/// "Import file" and "Add link" are the fallbacks.
export function FilesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fresh, markFresh] = useFreshIds();

  const { data: files = [], isPending } = useQuery({
    queryKey: ["files", spaceId],
    queryFn: () => listFiles(spaceId),
  });

  const setLayout = (next: Layout) => {
    setLayoutState(next);
    preferences.set(STORAGE_KEYS.filesLayout, next);
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
  const importPaths = useMutation({
    mutationFn: (paths: string[]) => Promise.all(paths.map((path) => importFile(spaceId, path))),
    onSuccess: imported,
  });

  const pickStatusRaw = useActionStatus(pickAndImport);
  // A cancelled native open dialog resolves `null`: back to rest, not success.
  const pickStatus: ActionStatus =
    pickStatusRaw === "success" && pickAndImport.data === null ? "idle" : pickStatusRaw;
  const dropStatus = useActionStatus(importPaths);
  const droppedCount = importPaths.variables?.length ?? 0;
  const droppedLabel = droppedCount === 1 ? "1 file" : `${droppedCount} files`;
  const dropMessage =
    dropStatus === "pending"
      ? `Importing ${droppedLabel}`
      : dropStatus === "success"
        ? `${droppedLabel} imported`
        : dropStatus === "error"
          ? `Couldn't import dropped files: ${importPaths.error?.message ?? ""}`
          : null;

  const startImport = useCallback(() => {
    if (!pickAndImport.isPending) pickAndImport.mutate();
  }, [pickAndImport]);
  useCreateShortcut(startImport);

  // A browser `ondrop` only hands over File objects without a filesystem path
  // inside a Tauri webview, so `importFile` can't use them. Tauri's own drag and
  // drop event carries the real paths.
  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        if (event.payload.paths.length > 0) importPaths.mutate(event.payload.paths);
      } else {
        setIsDragOver(event.payload.type === "enter" || event.payload.type === "over");
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [spaceId]);

  const filterFields = useMemo<FilterField[]>(() => {
    const present = new Set(files.map((f) => fileKind(f).id));
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
    ];
  }, [files]);

  const visible = applyFilters(files, filters, (f) => fileKind(f).id).sort((a, b) =>
    b.entity.createdAt.localeCompare(a.entity.createdAt),
  );
  const openFile = (f: FileEntity) => openEntity(f.entity.id, spaceId);

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
        {dropMessage && (
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 truncate text-xs",
              statusTextClass(dropStatus) ?? "text-muted-foreground",
            )}
          >
            <StatusIcon status={dropStatus} idle={null} size={12} />
            {dropMessage}
          </span>
        )}
        <StatusAnnouncer message={dropStatus === "pending" ? null : dropMessage} />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="min-w-0 flex-1">
            <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
          </div>
          <LayoutToggle layout={layout} onChange={setLayout} />
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 gap-1.5"
            onClick={() => setLinkOpen(true)}
          >
            <IconLink />
            Add link
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={startImport}>
                <StatusButtonContent
                  status={pickStatus}
                  icon={<IconFileUpload />}
                  label="Import file"
                  successLabel="Imported"
                  errorLabel="Couldn't import, try again"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Import a file <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {!isPending && files.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={IconDragDrop}
            title="No files yet"
            description="Drop files anywhere in this window. Nookly keeps its own copy, the original stays untouched."
            action={{ label: "Import file", onClick: startImport }}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">No files match these filters.</p>
          <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
            Clear filters
          </Button>
        </div>
      ) : layout === "grid" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul
            aria-label="Files"
            className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 p-4"
          >
            {visible.map((f) => (
              <FileTile
                key={f.entity.id}
                file={f}
                fresh={fresh.has(f.entity.id)}
                onOpen={() => openFile(f)}
              />
            ))}
          </ul>
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
        <div className="min-h-0 flex-1 overflow-y-auto pb-6" onKeyDown={moveRowFocus}>
          {visible.map((f) => (
            <FileRow
              key={f.entity.id}
              file={f}
              fresh={fresh.has(f.entity.id)}
              onOpen={() => openFile(f)}
            />
          ))}
        </div>
      )}

      {isDragOver && (
        <div className="pointer-events-none absolute inset-x-2 top-14 bottom-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
          <span className="flex items-center gap-2 rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm">
            <IconDragDrop size={16} className="text-primary" />
            Drop to import into Files
          </span>
        </div>
      )}

      <AddLinkDialog
        spaceId={spaceId}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onCreated={(f) => markFresh([f.entity.id])}
      />
    </div>
  );
}

function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (l: Layout) => void }) {
  const options = [
    { id: "grid", label: "Grid View", icon: IconLayoutGrid },
    { id: "list", label: "List View", icon: IconList },
  ] as const;
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-input bg-accent p-0.5">
      {options.map((o) => (
        <Tooltip key={o.id}>
          <TooltipTrigger asChild>
            <Button
              variant={layout === o.id ? "secondary" : "ghost"}
              size="iconSm"
              className="size-6"
              aria-label={o.label}
              aria-pressed={layout === o.id}
              onClick={() => onChange(o.id)}
            >
              <o.icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{o.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/// "PDF · Sep 24", or the provider for a cloud link.
function fileMeta(file: FileEntity): string {
  const kind = fileKind(file);
  const ext = fileExtension(file);
  const label = kind.id === "other" && ext ? ext.toUpperCase() : kind.label;
  return `${label} · ${formatShortDate(file.entity.createdAt)}`;
}

function FilePreview({ file }: { file: FileEntity }) {
  const kind = fileKind(file);
  const [broken, setBroken] = useState(false);
  const ext = fileExtension(file);
  if (kind.id === "image" && file.localPath && !broken) {
    return (
      <img
        src={convertFileSrc(file.localPath)}
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

function FileTile({
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

function FileRow({
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

/// A cloud document by URL: Google Drive, Dropbox and iCloud are recognized from
/// the address, anything else is kept as a plain link.
function AddLinkDialog({
  spaceId,
  open,
  onOpenChange,
  onCreated,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (file: FileEntity) => void;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: () => createFileLink(spaceId, title.trim() || url.trim(), url.trim()),
    onSuccess: (file) => {
      onCreated(file);
      return queryClient.invalidateQueries({ queryKey: ["files", spaceId] });
    },
  });
  const createStatus = statusOf(create);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setUrl("");
      setTitle("");
      create.reset();
    }
  }

  useCloseAfterSuccess(create, () => handleOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a link</DialogTitle>
        </DialogHeader>
        <form
          id="add-file-link"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && (createStatus === "idle" || createStatus === "error")) {
              create.mutate();
            }
          }}
        >
          <Input
            aria-label="URL"
            placeholder="Google Drive, Dropbox, iCloud or any URL"
            value={url}
            aria-invalid={create.isError || undefined}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            aria-label="Title"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </form>
        <DialogFooter>
          <Button size="sm" type="submit" form="add-file-link" disabled={!url.trim()}>
            <StatusButtonContent
              status={createStatus}
              label="Add link"
              successLabel="Added"
              errorLabel="Couldn't add, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
