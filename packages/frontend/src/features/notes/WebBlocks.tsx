import {
  IconBookmark,
  IconExternalLink,
  IconLink,
  IconRefresh,
  IconReplace,
  IconWorld,
} from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  StatusIcon,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { createBookmark, fetchBookmarkMetadata, getBookmark } from "#/lib/api/bookmarks.ts";
import type { Bookmark, Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { cn } from "@nookly/ui/lib/utils";
import { mentionMarkdown } from "#/features/relationships/mention-utils.ts";
import { asString, type JSONAttrValue } from "./block-markdown";
import { embedTarget } from "./embed-providers";

export interface WebBlockOptions {
  /// The page's Space, where new bookmarks land.
  spaceId: string;
}

const HTTP_URL = /^https?:\/\/\S+$/;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
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

/// The empty state of both blocks: a URL field, plus whatever else `children` offers.
function UrlForm({
  icon,
  prompt,
  submitLabel,
  status = "idle",
  error,
  onSubmit,
  children,
}: {
  icon: ReactNode;
  prompt: string;
  submitLabel: string;
  status?: ReturnType<typeof useActionStatus>;
  error?: string | null;
  onSubmit: (url: string) => void;
  children?: ReactNode;
}) {
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="media-picker flex-col items-stretch">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = url.trim();
          if (!HTTP_URL.test(trimmed)) return setInvalid(true);
          onSubmit(trimmed);
        }}
      >
        <span className="flex shrink-0 text-muted-foreground">{icon}</span>
        <Input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
          placeholder={prompt}
          aria-label={prompt}
          aria-invalid={invalid}
          className="h-7 min-w-0 flex-1 text-xs"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-7 gap-1.5">
          <StatusButtonContent status={status} label={submitLabel} errorLabel="Try again" />
        </Button>
        {children}
      </form>
      <FieldError message={invalid ? "Paste a full link, starting with https://" : error} />
    </div>
  );
}

/// A link shown in place: a player for the services that offer one, else a
/// plain link card.
export function EmbedBlock({ node, updateAttributes, editor }: ReactNodeViewProps) {
  // SAFETY: the embed node only ever writes `rows` as a string.
  const url = (asString(node.attrs.rows as JSONAttrValue | undefined) ?? "").trim();
  const target = url ? embedTarget(url) : null;

  if (!url) {
    return (
      <NodeViewWrapper className="my-1" contentEditable={false}>
        <UrlForm
          icon={<IconWorld className="size-4" />}
          prompt="Paste a YouTube, Vimeo, Loom, Figma, Maps or Spotify link"
          submitLabel="Embed"
          onSubmit={(rows) => updateAttributes({ rows })}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="group/media relative my-1" contentEditable={false}>
      {target ? (
        <iframe
          src={target.src}
          title={`${target.provider} embed`}
          className="embed-frame"
          // SAFETY: `--embed-aspect` / `--embed-height` only ever receive the provider's
          // fixed ratio or pixel height; `CSSProperties` doesn't model custom properties.
          style={
            {
              "--embed-aspect": target.aspect ?? "auto",
              "--embed-height": target.height ? `${target.height}px` : "auto",
            } as CSSProperties
          }
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          onClick={() => void openUrl(url)}
          className="media-card flex w-full items-center gap-3 text-left"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
            <IconWorld className="size-4.5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{hostOf(url)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {url} · This site can't be shown inline
            </span>
          </span>
        </button>
      )}
      <div className="media-toolbar">
        <ToolbarButton label="Open Link" onClick={() => void openUrl(url)}>
          <IconExternalLink className="size-3.5" />
        </ToolbarButton>
        {editor.isEditable && (
          <ToolbarButton label="Replace Link" onClick={() => updateAttributes({ rows: "" })}>
            <IconReplace className="size-3.5" />
          </ToolbarButton>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const MENTION = /^\[[^\]]*\]\(mention:([a-zA-Z0-9-]+)\)$/;

/// A preview card for a Bookmark entity: pasting a link adds it to the Space's
/// Bookmarks, and the card shows the page's title, description and image.
export function BookmarkBlock({ node, updateAttributes, extension, editor }: ReactNodeViewProps) {
  // SAFETY: bookmark nodes are always created with `WebBlockOptions` (`custom-block-extensions.ts`).
  const { spaceId } = extension.options as WebBlockOptions;
  // SAFETY: the bookmark node only ever writes `rows` as a string.
  const link = asString(node.attrs.rows as JSONAttrValue | undefined) ?? "";
  const bookmarkId = MENTION.exec(link.trim())?.[1];
  const queryClient = useQueryClient();
  const pick = (entity: Entity) =>
    updateAttributes({ rows: mentionMarkdown(displayTitle(entity), entity.id) });

  const add = useMutation({
    mutationFn: (url: string) => createBookmark(spaceId, url),
    onSuccess: (bookmark) => {
      void queryClient.invalidateQueries({ queryKey: ["bookmarks", spaceId] });
      void queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      updateAttributes({ rows: mentionMarkdown(bookmark.url, bookmark.entity.id) });
    },
  });
  const status = useActionStatus(add);

  if (!bookmarkId) {
    return (
      <NodeViewWrapper className="my-1" contentEditable={false}>
        <UrlForm
          icon={<IconBookmark className="size-4" />}
          prompt="Paste a link to bookmark"
          submitLabel="Add"
          status={status}
          error={add.isError ? "Couldn't add the bookmark, try again" : null}
          onSubmit={(url) => !add.isPending && add.mutate(url)}
        >
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="bookmark"
            onSelect={pick}
            trigger={
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5">
                <IconBookmark className="size-3.5" />
                From Bookmarks
              </Button>
            }
          />
        </UrlForm>
      </NodeViewWrapper>
    );
  }

  return (
    <BookmarkView
      bookmarkId={bookmarkId}
      editable={editor.isEditable}
      onReplace={() => updateAttributes({ rows: "" })}
    />
  );
}

function BookmarkView({
  bookmarkId,
  editable,
  onReplace,
}: {
  bookmarkId: string;
  editable: boolean;
  onReplace: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: bookmark, isError } = useQuery({
    queryKey: ["bookmark", bookmarkId],
    queryFn: () => getBookmark(bookmarkId),
  });
  // Fetched on its own when missing (a bookmark added offline), and again on
  // Refresh Preview.
  const refresh = useMutation({
    mutationFn: (b: Bookmark) => fetchBookmarkMetadata(b.entity.id, b.url),
    onSuccess: (fresh) => queryClient.setQueryData(["bookmark", bookmarkId], fresh),
  });
  const refreshStatus = useActionStatus(refresh);
  const needsMetadata = bookmark !== undefined && bookmark.metadataFetchedAt === null;
  useEffect(() => {
    if (needsMetadata && bookmark && refresh.isIdle) refresh.mutate(bookmark);
  }, [needsMetadata, bookmark, refresh]);

  return (
    <NodeViewWrapper className="group/media relative my-1" contentEditable={false}>
      {isError ? (
        <div className="media-card text-sm text-muted-foreground">
          This bookmark no longer exists.
        </div>
      ) : bookmark ? (
        <BookmarkCard bookmark={bookmark} />
      ) : (
        <div className="media-card h-24 animate-pulse" />
      )}
      {bookmark && (
        <div className="media-toolbar">
          <ToolbarButton
            label={refreshStatus === "error" ? "Couldn't Refresh, Try Again" : "Refresh Preview"}
            onClick={() => !refresh.isPending && refresh.mutate(bookmark)}
          >
            <StatusIcon
              status={refreshStatus}
              idle={<IconRefresh className="size-3.5" />}
              size={14}
            />
          </ToolbarButton>
          {editable && (
            <ToolbarButton label="Replace Bookmark" onClick={onReplace}>
              <IconReplace className="size-3.5" />
            </ToolbarButton>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

function BookmarkCard({ bookmark }: { bookmark: Bookmark }) {
  // Remote images fail often (hotlink protection, moved files); a failed one
  // disappears instead of leaving a broken image box.
  const [broken, setBroken] = useState<{ favicon?: string; preview?: string }>({});
  const favicon =
    bookmark.faviconUrl && broken.favicon !== bookmark.faviconUrl ? bookmark.faviconUrl : null;
  const preview =
    bookmark.previewImageUrl && broken.preview !== bookmark.previewImageUrl
      ? bookmark.previewImageUrl
      : null;
  const title = bookmark.fetchedTitle || displayTitle(bookmark.entity);
  return (
    <button
      type="button"
      onClick={() => void openUrl(bookmark.url)}
      {...entityTarget(bookmark.entity)}
      className={cn(
        "bookmark-card flex w-full overflow-hidden text-left",
        bookmark.entity.deletedAt && "opacity-50",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium">{title}</span>
        {bookmark.description && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{bookmark.description}</span>
        )}
        <span className="mt-auto flex min-w-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          {favicon ? (
            <img
              src={favicon}
              alt=""
              onError={() => setBroken((b) => ({ ...b, favicon }))}
              className="size-3.5 shrink-0 rounded-sm"
            />
          ) : (
            <IconLink className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{hostOf(bookmark.url)}</span>
        </span>
      </span>
      {preview && (
        <img
          src={preview}
          alt=""
          onError={() => setBroken((b) => ({ ...b, preview }))}
          className="hidden h-full w-44 shrink-0 border-l border-border object-cover sm:block"
        />
      )}
    </button>
  );
}
