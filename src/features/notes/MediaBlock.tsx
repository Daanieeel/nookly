import {
  IconExternalLink,
  IconFile,
  IconFolderOpen,
  IconLink,
  IconMovie,
  IconMusic,
  IconPhoto,
  IconReplace,
  IconUpload,
} from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { type ComponentType, useState } from "react";
import { StatusButtonContent, useActionStatus } from "@/components/action-feedback";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getFile, importFile } from "@/lib/api/files";
import type { Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { cn } from "@/lib/utils";
import { mentionMarkdown } from "@/features/relationships/mention-utils";
import { asString, type JSONAttrValue } from "./block-markdown";

export type MediaKind = "image" | "video" | "audio" | "file";

export interface MediaBlockOptions {
  kind: MediaKind;
  /// The page's Space, where uploads land as File entities.
  spaceId: string;
}

interface MediaKindInfo {
  noun: string;
  icon: ComponentType<{ className?: string }>;
  /// What the upload dialog offers; empty for any file.
  extensions: string[];
}

const KINDS = {
  image: {
    noun: "image",
    icon: IconPhoto,
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"],
  },
  video: { noun: "video", icon: IconMovie, extensions: ["mp4", "webm", "mov", "m4v", "ogv"] },
  audio: {
    noun: "audio file",
    icon: IconMusic,
    extensions: ["mp3", "wav", "m4a", "ogg", "oga", "flac", "aac", "opus"],
  },
  file: { noun: "file", icon: IconFile, extensions: [] },
} satisfies Record<MediaKind, MediaKindInfo>;

const MENTION = /^\[([^\]]*)\]\(mention:([a-zA-Z0-9-]+)\)$/;

interface Source {
  /// What the webview loads: an asset URL for an imported copy, else the URL.
  src: string | null;
  name: string;
  /// Where Open goes: the imported copy's path, or the URL.
  localPath: string | null;
  url: string | null;
}

interface SourceState {
  /// `null` while the File entity loads, or when the block is empty.
  source: Source | null;
  /// The mentioned File entity is gone.
  missing: boolean;
}

/// The media behind a block: a File entity from its mention, or a plain URL.
function useSource(content: string): SourceState {
  const mention = MENTION.exec(content.trim());
  const fileId = mention?.[2];
  const { data: file, isError } = useQuery({
    queryKey: ["file", fileId],
    queryFn: () => getFile(fileId ?? ""),
    enabled: fileId !== undefined,
  });
  if (!content.trim()) return { source: null, missing: false };
  if (!fileId) {
    const url = content.trim();
    return {
      source: {
        src: url,
        name: url.split("/").filter(Boolean).at(-1) ?? url,
        localPath: null,
        url,
      },
      missing: false,
    };
  }
  if (!file) return { source: null, missing: isError };
  return {
    source: {
      src: file.localPath ? convertFileSrc(file.localPath) : file.url,
      name: file.originalFilename ?? displayTitle(file.entity),
      localPath: file.localPath,
      url: file.url,
    },
    missing: false,
  };
}

/// Image, video, audio and file blocks. Each shows a File entity (imported into
/// the page's Space on upload, so it also appears under Files) or a web URL.
export function MediaBlock({ node, updateAttributes, extension, editor }: ReactNodeViewProps) {
  // SAFETY: media nodes are always created with `MediaBlockOptions` (`custom-block-extensions.ts`).
  const { kind, spaceId } = extension.options as MediaBlockOptions;
  // SAFETY: media nodes only ever write `rows` as a string.
  const content = asString(node.attrs.rows as JSONAttrValue | undefined) ?? "";
  // SAFETY: media nodes only ever write `caption` as a string or null.
  const caption = asString(node.attrs.caption as JSONAttrValue | undefined) ?? "";
  const { source, missing } = useSource(content);
  const editable = editor.isEditable;

  if (!content.trim()) {
    return (
      <NodeViewWrapper className="my-1" contentEditable={false}>
        <MediaPicker kind={kind} spaceId={spaceId} onPick={(rows) => updateAttributes({ rows })} />
      </NodeViewWrapper>
    );
  }

  const Icon = KINDS[kind].icon;
  const openSource = () => {
    if (source?.localPath) void openPath(source.localPath);
    else if (source?.url) void openUrl(source.url);
  };

  return (
    <NodeViewWrapper className="my-1" contentEditable={false}>
      <div
        className={cn(
          "group/media relative",
          (kind === "image" || kind === "video") && source && !missing
            ? "w-fit min-w-32 max-w-full"
            : "w-full",
        )}
      >
        {missing || !source ? (
          <div className={cn("media-card", !missing && "h-14 animate-pulse")}>
            {missing && (
              <span className="text-sm text-muted-foreground">This file no longer exists.</span>
            )}
          </div>
        ) : kind === "image" && source.src ? (
          <img src={source.src} alt={caption || source.name} className="media-image" />
        ) : kind === "video" && source.src ? (
          // oxlint-disable-next-line jsx-a11y/media-has-caption: a user's own video, no captions to offer
          <video src={source.src} controls preload="metadata" className="media-video" />
        ) : (
          <div className="media-card flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
                <Icon className="size-4.5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{source.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {source.localPath ? "Stored in Nookly" : (source.url ?? "")}
                </span>
              </span>
            </div>
            {kind === "audio" &&
              source.src && (
                // oxlint-disable-next-line jsx-a11y/media-has-caption: a user's own recording, no captions to offer
                <audio src={source.src} controls preload="metadata" className="w-full" />
              )}
          </div>
        )}
        <div className="media-toolbar">
          {source && (source.localPath || source.url) && (
            <ToolbarButton
              label={source.localPath ? "Open File" : "Open Link"}
              onClick={openSource}
            >
              <IconExternalLink className="size-3.5" />
            </ToolbarButton>
          )}
          {source?.localPath && (
            <ToolbarButton
              label="Show in Folder"
              onClick={() => source.localPath && void revealItemInDir(source.localPath)}
            >
              <IconFolderOpen className="size-3.5" />
            </ToolbarButton>
          )}
          {editable && (
            <ToolbarButton
              label={`Replace ${KINDS[kind].noun[0]?.toUpperCase()}${KINDS[kind].noun.slice(1)}`}
              onClick={() => updateAttributes({ rows: "" })}
            >
              <IconReplace className="size-3.5" />
            </ToolbarButton>
          )}
        </div>
      </div>
      {(kind === "image" || kind === "video") && source && (editable || caption) && (
        <input
          value={caption}
          onChange={(event) => updateAttributes({ caption: event.target.value || null })}
          readOnly={!editable}
          placeholder="Add a caption"
          aria-label="Caption"
          className="media-caption"
        />
      )}
    </NodeViewWrapper>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="iconSm"
          aria-label={label}
          onClick={onClick}
          className="size-7"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/// The empty block: upload a file, pick one already under Files, or paste a URL.
function MediaPicker({
  kind,
  spaceId,
  onPick,
}: {
  kind: MediaKind;
  spaceId: string;
  onPick: (rows: string) => void;
}) {
  const queryClient = useQueryClient();
  const { noun, icon: Icon, extensions } = KINDS[kind];
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");

  const upload = useMutation({
    mutationFn: async () => {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: extensions.length > 0 ? [{ name: noun, extensions }] : undefined,
      });
      if (selected === null) return null;
      return importFile(spaceId, selected);
    },
    onSuccess: (file) => {
      if (!file) return;
      void queryClient.invalidateQueries({ queryKey: ["files", spaceId] });
      void queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      onPick(mentionMarkdown(file.originalFilename ?? displayTitle(file.entity), file.entity.id));
    },
  });
  const status = useActionStatus(upload);
  const pickExisting = (entity: Entity) => onPick(mentionMarkdown(displayTitle(entity), entity.id));
  const submitUrl = () => {
    const trimmed = url.trim();
    if (/^https?:\/\/\S+$/.test(trimmed)) onPick(trimmed);
  };

  return (
    <div className="media-picker">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        Add {kind === "image" ? "an" : "a"} {noun}
      </span>
      {linking ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submitUrl();
          }}
        >
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setLinking(false)}
            placeholder="https://"
            aria-label={`Link to the ${noun}`}
            className="h-7 min-w-0 flex-1 text-xs"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-7">
            Add
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => !upload.isPending && upload.mutate()}
          >
            <StatusButtonContent
              status={status}
              icon={<IconUpload className="size-3.5" />}
              label="Upload"
              errorLabel="Couldn't import, try again"
            />
          </Button>
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="file"
            onSelect={pickExisting}
            trigger={
              <Button variant="ghost" size="sm" className="h-7 gap-1.5">
                <IconFile className="size-3.5" />
                From Files
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => setLinking(true)}
          >
            <IconLink className="size-3.5" />
            Link
          </Button>
        </div>
      )}
    </div>
  );
}
