import { qk } from "#/lib/query-keys.ts";
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
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { type ComponentType, type MouseEvent, useEffect, useState } from "react";
import { z } from "zod";
import { StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { getEntity } from "#/lib/api/entities.ts";
import { getFile, importFile } from "#/lib/api/files.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import { notify } from "#/components/notify.tsx";
import { inheritPageContext } from "#/features/relationships/inherit-context.ts";
import { mentionMarkdown } from "#/features/relationships/mention-utils.ts";
import { asString, type JSONAttrValue } from "./block-markdown";
import { ToolbarButton } from "./ToolbarButton";

export type MediaKind = "image" | "video" | "audio" | "file";

export interface MediaBlockOptions {
  kind: MediaKind;
  /// The page's Space, where uploads land as File entities.
  spaceId: string;
  /// The page the block sits on; imported files are attached to it and its context.
  pageId: string;
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
    queryKey: qk.files.byId(fileId),
    queryFn: () => getFile(fileId ?? ""),
    enabled: fileId !== undefined,
  });
  // The name follows renames: a rename refreshes `["entity", id]`, not the file query.
  const { data: entity } = useQuery({
    queryKey: qk.entity.byId(fileId),
    queryFn: () => getEntity(fileId ?? ""),
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
      src:
        (file.localPath ?? file.sourcePath)
          ? convertFileSrc(file.localPath ?? file.sourcePath ?? "")
          : file.url,
      name: displayTitle(entity ?? file.entity),
      localPath: file.localPath ?? file.sourcePath,
      url: file.url,
    },
    missing: false,
  };
}

/// Image, video, audio and file blocks. Each shows a File entity (imported into
/// the page's Space on upload, so it also appears under Files) or a web URL.
export function MediaBlock({ node, updateAttributes, extension, editor }: ReactNodeViewProps) {
  // SAFETY: media nodes are always created with `MediaBlockOptions` (`custom-block-extensions.ts`).
  const { kind, spaceId, pageId } = extension.options as MediaBlockOptions;
  // SAFETY: media nodes only ever write `rows` as a string.
  const content = asString(node.attrs.rows as JSONAttrValue | undefined) ?? "";
  // SAFETY: media nodes only ever write `caption` as a string or null.
  const caption = asString(node.attrs.caption as JSONAttrValue | undefined) ?? "";
  const { source, missing } = useSource(content);
  const editable = editor.isEditable;

  // The stored mention label is the file's name, so it follows a rename too (the
  // backend rewrites saved blocks; this catches a page open while it happened).
  const mention = MENTION.exec(content.trim());
  const fresh =
    mention && source ? mentionMarkdown(source.name.replace(/[[\]]/g, ""), mention[2]) : null;
  useEffect(() => {
    if (editable && fresh && fresh !== content.trim()) updateAttributes({ rows: fresh });
  }, [editable, fresh, content, updateAttributes]);

  if (!content.trim()) {
    return (
      <NodeViewWrapper className="my-1" contentEditable={false}>
        <MediaPicker
          kind={kind}
          spaceId={spaceId}
          pageId={pageId}
          onPick={(rows) => updateAttributes({ rows })}
        />
      </NodeViewWrapper>
    );
  }

  const Icon = KINDS[kind].icon;
  const openSource = () => {
    if (source?.localPath) void openPath(source.localPath);
    else if (source?.url) void openUrl(source.url);
  };
  /// Cmd or Ctrl and a click on the media itself opens it; a plain click is left alone
  /// (it selects the block, and a video or audio player has its own controls).
  const openOnModifierClick = (event: MouseEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey) openSource();
  };

  return (
    <NodeViewWrapper className="my-1" contentEditable={false}>
      <div
        className={cn(
          "group/media relative",
          // An image keeps its own width, so the toolbar sits on its corner.
          kind === "image" && source && !missing ? "w-fit min-w-32 max-w-full" : "w-full",
        )}
      >
        {missing || !source ? (
          <div className={cn("media-card", !missing && "h-14 animate-pulse")}>
            {missing && (
              <span className="text-sm text-muted-foreground">This file no longer exists.</span>
            )}
          </div>
        ) : kind === "image" && source.src ? (
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Cmd or Ctrl and click is a pointer shortcut; the toolbar's Open File is the keyboard way
          <img
            src={source.src}
            alt={caption || source.name}
            className="media-image"
            onClick={openOnModifierClick}
          />
        ) : kind === "video" && source.src ? (
          // oxlint-disable-next-line jsx-a11y/media-has-caption -- a user's own video, no captions to offer
          <video src={source.src} controls preload="metadata" className="media-video" />
        ) : (
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Cmd or Ctrl and click is a pointer shortcut; the toolbar's Open File is the keyboard way
          <div className="media-card flex flex-col gap-2" onClick={openOnModifierClick}>
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
                // oxlint-disable-next-line jsx-a11y/media-has-caption -- a user's own recording, no captions to offer
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

const linkSchema = z.object({
  url: z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+$/),
});

/// The empty block: upload a file, pick one already under Files, or paste a URL.
function MediaPicker({
  kind,
  spaceId,
  pageId,
  onPick,
}: {
  kind: MediaKind;
  spaceId: string;
  pageId: string;
  onPick: (rows: string) => void;
}) {
  const queryClient = useQueryClient();
  const { noun, icon: Icon, extensions } = KINDS[kind];
  const [linking, setLinking] = useState(false);
  // A value that is not a full link is ignored on submit.
  const form = useForm({
    defaultValues: { url: "" },
    validators: { onSubmit: linkSchema },
    onSubmit: ({ value }) => onPick(value.url.trim()),
  });

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
      void queryClient.invalidateQueries({ queryKey: qk.files.bySpace(spaceId) });
      void queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(spaceId) });
      attachToPage(file.entity.id);
      onPick(mentionMarkdown(file.originalFilename ?? displayTitle(file.entity), file.entity.id));
    },
  });
  const status = useActionStatus(upload);
  // The block still shows the file if attaching it to the page's context fails.
  const attachToPage = (fileId: string) =>
    void inheritPageContext(queryClient, pageId, fileId).catch(() => {
      notify.error("Couldn't attach the file to this page", {
        description: "Try attaching it again.",
      });
    });
  const pickExisting = (entity: Entity) => {
    attachToPage(entity.id);
    onPick(mentionMarkdown(displayTitle(entity), entity.id));
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
            void form.handleSubmit();
          }}
        >
          <form.Field name="url">
            {(field) => (
              <Input
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by the user to type the value, so focus belongs in the field
                autoFocus
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && setLinking(false)}
                placeholder="https://"
                aria-label={`Link to the ${noun}`}
                className="h-7 min-w-0 flex-1 text-xs"
              />
            )}
          </form.Field>
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
