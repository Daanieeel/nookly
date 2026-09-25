import {
  IconAppWindow,
  IconBookmark,
  IconChevronRight,
  IconDots,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileUpload,
  IconFolderOpen,
} from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { StatusButtonContent, statusOf, useActionStatus } from "#/components/action-feedback.tsx";
import { Calendar } from "#/components/date-input.tsx";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { PROPERTY_VALUE, PropertyRow } from "#/components/property-row.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { PendingIcon } from "#/features/tasks/task-properties.tsx";
import { convertEntity } from "#/lib/api/entities.ts";
import {
  copyFileIntoStorage,
  listOpenWithApps,
  openFileWith,
  downloadLinkedFile,
  exportFile,
  getFile,
  openFile,
  replaceFile,
  revealFile,
  setFileAddedAt,
} from "#/lib/api/files.ts";
import type { Entity, FileEntity } from "#/lib/api/types.ts";
import { formatDate } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import { HighlightedCode, codeLanguage } from "./code-viewer";
import { PdfViewer } from "./document-frame";
import { OfficeViewer } from "./office-viewers";
import {
  TEXT_EXTENSIONS,
  fileExtension,
  fileKind,
  filePath,
  isLinkOnly,
  isReference,
  officeFormat,
} from "./file-kind";

const REVEAL_LABEL = navigator.userAgent.includes("Mac") ? "Reveal in Finder" : "Show in Folder";

const MAX_TEXT_BYTES = 1_000_000;

/// A file's page: the file itself fills the body, its properties and
/// relationships sit in the right sidebar.
export function FileDetailView({ entity }: { entity: Entity }) {
  const { data: file } = useQuery({
    queryKey: ["file", entity.id],
    queryFn: () => getFile(entity.id),
  });

  return (
    <EntityDetailLayout entity={entity} sidebar={file && <FileProperties file={file} />}>
      {file ? (
        <FileViewer file={file} />
      ) : (
        <div className="size-full animate-pulse rounded-lg bg-muted/40" />
      )}
    </EntityDetailLayout>
  );
}

function FileViewer({ file }: { file: FileEntity }) {
  const kind = fileKind(file);
  const ext = fileExtension(file);
  const path = filePath(file);
  const src = path ? convertFileSrc(path) : null;
  const name = file.originalFilename ?? displayTitle(file.entity);

  if (!src) return <LinkOnly file={file} />;
  const office = officeFormat(file);
  if (office) {
    return (
      <OfficeViewer
        file={file}
        src={src}
        format={office}
        name={name}
        fallback={(hint) => <Placeholder file={file} hint={hint} />}
      />
    );
  }
  if (kind.id === "image") {
    return (
      <div className="flex size-full items-center justify-center">
        <img src={src} alt={name} className="max-h-full max-w-full rounded-md object-contain" />
      </div>
    );
  }
  if (kind.id === "pdf") return <PdfViewer src={src} name={name} />;
  if (kind.id === "video") {
    return (
      <div className="flex size-full items-center justify-center">
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a user's own video, no captions to offer */}
        <video src={src} controls preload="metadata" className="max-h-full max-w-full rounded-md" />
      </div>
    );
  }
  if (kind.id === "audio") {
    return (
      <Placeholder file={file}>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a user's own recording, no captions to offer */}
        <audio src={src} controls preload="metadata" className="w-full max-w-md" />
      </Placeholder>
    );
  }
  if (ext && TEXT_EXTENSIONS.has(ext)) {
    return <TextViewer file={file} src={src} />;
  }
  return <Placeholder file={file} />;
}

function TextViewer({ file, src }: { file: FileEntity; src: string }) {
  const { data: text, isError } = useQuery({
    queryKey: ["file-text", file.entity.id],
    queryFn: async () => {
      const response = await fetch(src);
      const blob = await response.blob();
      if (blob.size > MAX_TEXT_BYTES) throw new Error("too large to preview");
      return blob.text();
    },
  });
  if (isError) return <Placeholder file={file} />;
  return (
    <pre
      className={cn(
        "min-h-full rounded-md border border-border bg-muted/30 p-4 font-mono text-xs/relaxed",
        // Code keeps its lines: long ones scroll sideways instead of wrapping.
        wrapsLines(file) ? "wrap-break-word whitespace-pre-wrap" : "overflow-x-auto whitespace-pre",
        text === undefined && "animate-pulse",
      )}
    >
      {text !== undefined && (
        <HighlightedCode text={text} language={codeLanguage(fileExtension(file))} />
      )}
    </pre>
  );
}

/// Turns the File into a Bookmark of its link and shows it in the details sheet.
function useConvertToBookmark(file: FileEntity) {
  const queryClient = useQueryClient();
  const { entity } = file;
  return useMutation({
    mutationFn: () => convertEntity(entity.id, "bookmark"),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["files", entity.spaceId] }),
        queryClient.invalidateQueries({ queryKey: ["bookmarks", entity.spaceId] }),
        // The entity route sees the new type and hands over to the sheet.
        queryClient.invalidateQueries({ queryKey: ["entity", entity.id] }),
      ]),
  });
}

function ConvertButton({
  file,
  emphasis = false,
  className,
}: {
  file: FileEntity;
  emphasis?: boolean;
  className?: string;
}) {
  const convert = useConvertToBookmark(file);
  return (
    <Button
      variant={emphasis ? "secondary" : "ghost"}
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => !convert.isPending && convert.mutate()}
    >
      <StatusButtonContent
        status={statusOf(convert)}
        icon={<IconBookmark />}
        label="Convert to Bookmark"
        successLabel="Converted"
        errorLabel="Couldn't convert, try again"
      />
    </Button>
  );
}

function useDownloadLocalCopy(file: FileEntity) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => downloadLinkedFile(file.entity.id),
    onSuccess: (result) =>
      result.kind === "file" &&
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["file", file.entity.id] }),
        queryClient.invalidateQueries({ queryKey: ["files", file.entity.spaceId] }),
      ]),
  });
}

/// A File from before links were downloaded: fetch the file behind it, or, when
/// it's a webpage, make it the Bookmark it really is.
function LinkOnly({ file }: { file: FileEntity }) {
  const kind = fileKind(file);
  const download = useDownloadLocalCopy(file);
  const isWebpage = download.data?.kind === "webpage";
  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border p-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-xl bg-muted/60">
        <kind.icon size={32} stroke={1.5} className={kind.tone} />
      </div>
      <div className="flex max-w-full flex-col gap-1">
        <p className="text-sm font-medium">
          {isWebpage ? "This link is a webpage, not a file" : "Only a link so far"}
        </p>
        <p className="truncate text-xs text-muted-foreground">{file.url}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {!isWebpage && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => !download.isPending && download.mutate()}
          >
            <StatusButtonContent
              status={statusOf(download)}
              icon={<IconDownload />}
              label="Download Local Copy"
              successLabel="Downloaded"
              errorLabel="Couldn't download, try again"
            />
          </Button>
        )}
        <ConvertButton file={file} emphasis={isWebpage} />
        <OpenButton file={file} />
      </div>
    </div>
  );
}

/// For files the app can't show itself: the kind, the name, and the way to open
/// it elsewhere. One that came from a link can also become a Bookmark.
function Placeholder({
  file,
  hint,
  children,
}: {
  file: FileEntity;
  /// Replaces the default "open in their own app" line, e.g. how to get a preview.
  hint?: string;
  children?: React.ReactNode;
}) {
  const kind = fileKind(file);
  const name = file.originalFilename ?? displayTitle(file.entity);
  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border p-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-xl bg-muted/60">
        <kind.icon size={32} stroke={1.5} className={kind.tone} />
      </div>
      <div className="flex max-w-full flex-col gap-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {hint ?? `${kind.label} files open in their own app`}
        </p>
      </div>
      {children}
      <div className="flex flex-col items-center gap-1">
        <OpenButton file={file} variant="secondary" />
        {filePath(file) && <OpenInMenu file={file} side="bottom" />}
        {file.url && <ConvertButton file={file} />}
      </div>
    </div>
  );
}

function OpenButton({
  file,
  variant = "ghost",
  className,
}: {
  file: FileEntity;
  variant?: "ghost" | "secondary";
  className?: string;
}) {
  const kind = fileKind(file);
  const linkOnly = isLinkOnly(file);
  const label = !linkOnly
    ? "Open with Default App"
    : kind.id === "link"
      ? "Open Link"
      : `Open in ${kind.label}`;
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => {
        if (filePath(file)) void openFile(file.entity.id);
        else if (file.url) void openUrl(file.url);
      }}
    >
      <IconExternalLink />
      {label}
    </Button>
  );
}

function FileProperties({ file }: { file: FileEntity }) {
  const kind = fileKind(file);
  const queryClient = useQueryClient();
  const { entity } = file;
  const setAdded = useMutation({
    mutationFn: (day: string) => setFileAddedAt(entity.id, day),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["file", entity.id] }),
        queryClient.invalidateQueries({ queryKey: ["files", entity.spaceId] }),
      ]),
  });
  const saveCopy = useMutation({
    mutationFn: async () => {
      const path = await save({
        defaultPath: file.originalFilename ?? displayTitle(file.entity),
      });
      if (!path) return null;
      await exportFile(file.entity.id, path);
      return path;
    },
  });
  const saveStatusRaw = useActionStatus(saveCopy);
  // A cancelled save dialog resolves `null`: back to rest, not success.
  const saveStatus = saveStatusRaw === "success" && saveCopy.data === null ? "idle" : saveStatusRaw;

  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Kind">
        <Value>
          <kind.icon size={14} className={cn("shrink-0", kind.tone)} />
          <span className="truncate">{kind.label}</span>
        </Value>
      </PropertyRow>
      {file.originalFilename && (
        <PropertyRow label="File name">
          <Value title={file.originalFilename}>
            <span className="truncate">{file.originalFilename}</span>
          </Value>
        </PropertyRow>
      )}
      {file.url && (
        <PropertyRow label="Source">
          <Value title={file.url}>
            <span className="truncate">{hostOf(file.url)}</span>
          </Value>
        </PropertyRow>
      )}
      {isReference(file) && file.sourcePath && (
        <PropertyRow label="Location">
          <Value title={file.sourcePath}>
            <span className="truncate">On disk, not copied</span>
          </Value>
        </PropertyRow>
      )}
      <PropertyRow label="Added">
        <AddedDatePicker
          value={file.entity.createdAt.slice(0, 10)}
          onSelect={(day) => setAdded.mutate(day)}
        >
          <button
            type="button"
            aria-label={
              setAdded.isError ? "Couldn't set added date, try again" : "Change Added Date"
            }
            className={cn(PROPERTY_VALUE, setAdded.isError && "text-destructive")}
          >
            <PendingIcon pending={setAdded.isPending} failed={setAdded.isError} idle={null} />
            <span className="truncate">{formatDate(file.entity.createdAt)}</span>
          </button>
        </AddedDatePicker>
      </PropertyRow>

      <div className="mt-2 flex flex-col gap-0.5">
        <OpenButton file={file} className="justify-start" />
        {filePath(file) && <OpenInMenu file={file} />}
        <ReplaceButton file={file} />
        {isLinkOnly(file) && <DownloadButton file={file} />}
        {file.url && <ConvertButton file={file} className="justify-start" />}
        {isReference(file) && <CopyIntoStorageButton file={file} />}
        {filePath(file) && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-1.5"
              onClick={() => void revealFile(file.entity.id)}
            >
              <IconFolderOpen />
              {REVEAL_LABEL}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-1.5"
              onClick={() => saveStatus !== "pending" && saveCopy.mutate()}
            >
              <StatusButtonContent
                status={saveStatus}
                icon={<IconDownload />}
                label="Save a Copy…"
                successLabel="Saved"
                errorLabel="Couldn't save, try again"
              />
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/// A single day picker for the "Added" property: unlike a due date, it's never
/// unset, so there's no remove option or presets, just the calendar.
function AddedDatePicker({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: (day: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  function choose(day: string) {
    setOpen(false);
    if (day !== value) onSelect(day);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <Calendar value={value} onSelect={choose} />
      </PopoverContent>
    </Popover>
  );
}

function Value({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className="flex h-7 min-w-0 items-center gap-2 px-2 text-sm">
      {children}
    </span>
  );
}

function DownloadButton({ file }: { file: FileEntity }) {
  const download = useDownloadLocalCopy(file);
  const webpage = download.data?.kind === "webpage";
  return (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start gap-1.5"
      onClick={() => !download.isPending && download.mutate()}
    >
      <StatusButtonContent
        status={webpage ? "error" : statusOf(download)}
        icon={<IconDownload />}
        label="Download Local Copy"
        successLabel="Downloaded"
        errorLabel={webpage ? "It's a webpage, not a file" : "Couldn't download, try again"}
      />
    </Button>
  );
}

/// Picks a newer version of the file to put in place of the stored one.
function ReplaceButton({ file }: { file: FileEntity }) {
  const queryClient = useQueryClient();
  const { entity } = file;
  const replace = useMutation({
    mutationFn: async () => {
      const picked = await open({ multiple: false, directory: false });
      if (!picked || Array.isArray(picked)) return null;
      return replaceFile(entity.id, picked);
    },
    onSuccess: (replaced) =>
      replaced &&
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["file", entity.id] }),
        queryClient.invalidateQueries({ queryKey: ["file-text", entity.id] }),
        queryClient.invalidateQueries({ queryKey: ["files", entity.spaceId] }),
        queryClient.invalidateQueries({ queryKey: ["entity", entity.id] }),
      ]),
  });
  const raw = useActionStatus(replace);
  // A cancelled open dialog resolves `null`: back to rest, not success.
  const status = raw === "success" && replace.data === null ? "idle" : raw;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start gap-1.5"
      onClick={() => status !== "pending" && replace.mutate()}
    >
      <StatusButtonContent
        status={status}
        icon={<IconFileUpload />}
        label={isLinkOnly(file) ? "Replace with a Local File…" : "Replace File…"}
        successLabel="Replaced"
        errorLabel="Couldn't replace, try again"
      />
    </Button>
  );
}

/// Makes a file added by path independent of the original: Nookly keeps its own copy.
function CopyIntoStorageButton({ file }: { file: FileEntity }) {
  const queryClient = useQueryClient();
  const { entity } = file;
  const copy = useMutation({
    mutationFn: () => copyFileIntoStorage(entity.id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["file", entity.id] }),
        queryClient.invalidateQueries({ queryKey: ["files", entity.spaceId] }),
      ]),
  });
  return (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start gap-1.5"
      onClick={() => !copy.isPending && copy.mutate()}
    >
      <StatusButtonContent
        status={statusOf(copy)}
        icon={<IconCopy />}
        label="Copy into Nookly"
        successLabel="Copied"
        errorLabel="Couldn't copy, is the original still there?"
      />
    </Button>
  );
}

/// Prose and plain text wrap to the viewer; code and tables keep their lines.
function wrapsLines(file: FileEntity): boolean {
  return fileKind(file).id !== "code" && fileExtension(file) !== "csv";
}

/// "Open in…": the apps the system offers for this file, then any other app.
function OpenInMenu({
  file,
  side = "left",
}: {
  file: FileEntity;
  /// Left of the sidebar; below the button in the body.
  side?: "left" | "bottom";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { entity } = file;
  const { data: apps = [], isPending: loading } = useQuery({
    queryKey: ["open-with-apps", entity.id, filePath(file)],
    queryFn: () => listOpenWithApps(entity.id),
    enabled: menuOpen,
    staleTime: 60_000,
  });
  const openWith = useMutation({
    mutationFn: (appPath: string) => openFileWith(entity.id, appPath),
  });
  const pickOther = useMutation({
    mutationFn: async () => {
      const picked = await open({
        multiple: false,
        directory: false,
        defaultPath: "/Applications",
        filters: [{ name: "Applications", extensions: ["app"] }],
      });
      if (!picked || Array.isArray(picked)) return;
      await openFileWith(entity.id, picked);
    },
  });
  const failed = openWith.isError || pickOther.isError;
  const pending = openWith.isPending || pickOther.isPending;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-1.5"
          aria-label={failed ? "Couldn't open the file there, try again" : "Open in…"}
        >
          <StatusButtonContent
            status={pending ? "pending" : failed ? "error" : "idle"}
            icon={<IconAppWindow />}
            label="Open in…"
            errorLabel="Couldn't open, try again"
          />
          <IconChevronRight className="ml-auto text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={side === "left" ? "start" : "center"}
        className="w-56"
      >
        {loading ? (
          <DropdownMenuItem disabled>Finding apps…</DropdownMenuItem>
        ) : (
          apps.map((app) => (
            <DropdownMenuItem key={app.path} onSelect={() => openWith.mutate(app.path)}>
              {app.icon ? (
                <img src={app.icon} alt="" className="size-4 shrink-0" />
              ) : (
                <IconAppWindow className="text-muted-foreground" />
              )}
              <span className="truncate">{app.name}</span>
              {app.isDefault && (
                <span className="ml-auto text-xs text-muted-foreground">Default</span>
              )}
            </DropdownMenuItem>
          ))
        )}
        {apps.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => pickOther.mutate()}>
          <IconDots className="text-muted-foreground" />
          Other App…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
