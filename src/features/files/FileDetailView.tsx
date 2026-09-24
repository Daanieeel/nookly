import { IconDownload, IconExternalLink, IconFolderOpen } from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StatusButtonContent, useActionStatus } from "@/components/action-feedback";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { PropertyRow } from "@/components/property-row";
import { Button } from "@/components/ui/button";
import { exportFile, getFile } from "@/lib/api/files";
import type { Entity, FileEntity } from "@/lib/api/types";
import { formatDateTime } from "@/lib/datetime";
import { displayTitle } from "@/lib/entity-title";
import { cn } from "@/lib/utils";
import { fileExtension, fileKind } from "./file-kind";

const REVEAL_LABEL = navigator.userAgent.includes("Mac") ? "Reveal in Finder" : "Show in Folder";

/// Plain text formats shown as text; larger files get the "open with" fallback.
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "js",
  "ts",
  "tsx",
  "py",
  "rs",
  "css",
  "html",
  "java",
  "c",
  "cpp",
]);
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
  const src = file.localPath ? convertFileSrc(file.localPath) : null;
  const name = file.originalFilename ?? displayTitle(file.entity);

  if (src && kind.id === "image") {
    return (
      <div className="flex size-full items-center justify-center">
        <img src={src} alt={name} className="max-h-full max-w-full rounded-md object-contain" />
      </div>
    );
  }
  if (src && kind.id === "pdf") {
    return <iframe src={src} title={name} className="size-full rounded-md border border-border" />;
  }
  if (src && kind.id === "video") {
    return (
      <div className="flex size-full items-center justify-center">
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a user's own video, no captions to offer */}
        <video src={src} controls preload="metadata" className="max-h-full max-w-full rounded-md" />
      </div>
    );
  }
  if (src && kind.id === "audio") {
    return (
      <Placeholder file={file}>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a user's own recording, no captions to offer */}
        <audio src={src} controls preload="metadata" className="w-full max-w-md" />
      </Placeholder>
    );
  }
  if (src && ext && TEXT_EXTENSIONS.has(ext)) {
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
        "min-h-full rounded-md border border-border bg-muted/30 p-4 font-mono text-xs/relaxed wrap-break-word whitespace-pre-wrap",
        text === undefined && "animate-pulse",
      )}
    >
      {text}
    </pre>
  );
}

/// For files the app can't show itself, and links: the kind, the name, and the
/// way to open it elsewhere.
function Placeholder({ file, children }: { file: FileEntity; children?: React.ReactNode }) {
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
          {file.url ?? `${kind.label} files open in their own app`}
        </p>
      </div>
      {children}
      <OpenButton file={file} variant="secondary" />
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
  const label = file.url
    ? kind.id === "link"
      ? "Open Link"
      : `Open in ${kind.label}`
    : "Open with Default App";
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => {
        if (file.url) void openUrl(file.url);
        else if (file.localPath) void openPath(file.localPath);
      }}
    >
      <IconExternalLink />
      {label}
    </Button>
  );
}

function FileProperties({ file }: { file: FileEntity }) {
  const kind = fileKind(file);
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
        <PropertyRow label="URL">
          <Value title={file.url}>
            <span className="truncate">{hostOf(file.url)}</span>
          </Value>
        </PropertyRow>
      )}
      <PropertyRow label="Added">
        <Value>
          <span className="truncate">{formatDateTime(file.entity.createdAt)}</span>
        </Value>
      </PropertyRow>

      <div className="mt-2 flex flex-col gap-0.5">
        <OpenButton file={file} className="justify-start" />
        {file.localPath && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-1.5"
              onClick={() => file.localPath && void revealItemInDir(file.localPath)}
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

function Value({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className="flex h-7 min-w-0 items-center gap-2 px-2 text-sm">
      {children}
    </span>
  );
}
