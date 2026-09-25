import { IconCheck, IconExternalLink, IconPhoto, IconRefresh, IconTag } from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StatusAnnouncer, useActionStatus } from "#/components/action-feedback.tsx";
import { EntityActions } from "#/components/entity-actions.tsx";
import { EntityKeyCopy } from "#/components/entity-key.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { TextProperty } from "#/components/property-fields.tsx";
import { PROPERTY_VALUE, PropertyRow } from "#/components/property-row.tsx";
import { TrashEntityDialog } from "#/components/trash-entity-dialog.tsx";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@nookly/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { StatusIcon } from "#/components/action-feedback.tsx";
import { LabelsPicker, PendingIcon } from "#/features/tasks/task-properties.tsx";
import { MentionedInPanel } from "#/features/relationships/MentionedInPanel.tsx";
import { RelationshipsPanel } from "#/features/relationships/RelationshipsPanel.tsx";
import {
  fetchBookmarkMetadata,
  getBookmark,
  setBookmarkPreferredImage,
  updateBookmarkUrl,
} from "#/lib/api/bookmarks.ts";
import { updateEntity } from "#/lib/api/entities.ts";
import type { Bookmark } from "#/lib/api/types.ts";
import { formatDateTime } from "#/lib/datetime.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import {
  bookmarkTitle,
  hostOf,
  useBookmarkLabels,
  useCaptureScreenshot,
  useSpaceLabels,
} from "./bookmark-model";
import { Favicon, Preview } from "./bookmark-preview";

/// A Bookmark's details, sliding in from the right over whatever is open.
/// Bookmarks have no page of their own; this sheet is where they're opened.
export function BookmarkSheet() {
  const id = useNavStore((s) => s.bookmarkSheetId);
  const setId = useNavStore((s) => s.setBookmarkSheetId);
  const { data: bookmark } = useQuery({
    queryKey: ["bookmark", id],
    queryFn: () => getBookmark(id ?? ""),
    enabled: id !== null,
  });

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {bookmark && bookmark.entity.id === id ? (
          <BookmarkDetails bookmark={bookmark} onClose={() => setId(null)} />
        ) : (
          <>
            <SheetTitle className="sr-only">Bookmark</SheetTitle>
            <div className="aspect-[1.91/1] w-full animate-pulse bg-muted/40" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BookmarkDetails({ bookmark, onClose }: { bookmark: Bookmark; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [trashOpen, setTrashOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const { entity } = bookmark;

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bookmark", entity.id] }),
      queryClient.invalidateQueries({ queryKey: ["bookmarks", entity.spaceId] }),
    ]);
  const capture = useCaptureScreenshot(entity.spaceId);
  const refresh = useMutation({
    mutationFn: () => fetchBookmarkMetadata(entity.id, bookmark.url),
    onSuccess: refreshAll,
    onSettled: () => capture.mutate(entity.id),
  });
  const rename = useMutation({
    mutationFn: (title: string) => updateEntity(entity.id, { title }),
    onSuccess: refreshAll,
  });
  // The new page's metadata replaces the old one's; offline, the placeholder stays.
  const changeUrl = useMutation({
    mutationFn: async (url: string) => {
      await updateBookmarkUrl(entity.id, url);
      await fetchBookmarkMetadata(entity.id, url).catch(() => {});
    },
    onSuccess: async () => {
      await refreshAll();
      capture.mutate(entity.id);
    },
  });
  const togglePin = useMutation({
    mutationFn: () => updateEntity(entity.id, { pinned: !entity.pinned }),
    onSuccess: refreshAll,
  });
  const setPreferred = useMutation({
    mutationFn: (preferredImage: "screenshot" | "preview") =>
      setBookmarkPreferredImage(entity.id, preferredImage),
    onSuccess: refreshAll,
  });
  const bothPreviewsAvailable = !!bookmark.screenshotPath && !!bookmark.previewImageUrl;
  const refreshStatus = useActionStatus(refresh);
  const pinStatus = useActionStatus(togglePin);

  return (
    <>
      <div className="aspect-[1.91/1] w-full shrink-0 overflow-hidden border-b border-border">
        <Preview bookmark={bookmark} eager />
      </div>

      <div className="flex flex-col gap-5 p-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex min-w-0 items-start gap-2">
            <span className="flex h-6 items-center">
              <Favicon bookmark={bookmark} />
            </span>
            <SheetTitle className="sr-only">{bookmarkTitle(bookmark)}</SheetTitle>
            <TitleField
              value={bookmarkTitle(bookmark)}
              onSave={(title) => rename.mutate(title)}
              pending={rename.isPending}
              failed={rename.isError}
            />
          </div>
          {bookmark.description ? (
            <SheetDescription className="text-xs">{bookmark.description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{hostOf(bookmark.url)}</SheetDescription>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => openUrl(bookmark.url)}
          >
            <IconExternalLink />
            Open in Browser
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={
                  refreshStatus === "error" ? "Couldn't refresh, try again" : "Refresh Preview"
                }
                onClick={() => refreshStatus !== "pending" && refresh.mutate()}
              >
                <StatusIcon status={refreshStatus} idle={<IconRefresh />} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {refreshStatus === "error"
                ? "Couldn't refresh, try again"
                : refreshStatus === "success"
                  ? "Refreshed"
                  : "Refresh Preview"}
            </TooltipContent>
          </Tooltip>
          <StatusAnnouncer
            message={refreshStatus === "error" ? "Couldn't refresh, try again" : null}
          />
          {bothPreviewsAvailable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Compare Previews"
                  onClick={() => setCompareOpen(true)}
                >
                  <IconPhoto />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Compare Previews</TooltipContent>
            </Tooltip>
          )}
          <EntityActions
            entity={entity}
            exportable={false}
            pin={{
              status: pinStatus,
              toggle: async () => {
                await togglePin.mutateAsync();
              },
            }}
            onTrash={() => setTrashOpen(true)}
            className="ml-auto"
          />
        </div>

        <section aria-label="Properties" className="-mx-2 flex flex-col gap-0.5">
          <PropertyRow label="URL">
            <div className="flex min-w-0 items-center gap-0.5">
              <div className="min-w-0 flex-1">
                <TextProperty
                  value={bookmark.url}
                  onSave={(url) => url && changeUrl.mutate(url)}
                  placeholder="Add a URL"
                  label="URL"
                  pending={changeUrl.isPending}
                  failed={changeUrl.isError}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CopyButton
                    value={bookmark.url}
                    aria-label="Copy URL"
                    className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  />
                </TooltipTrigger>
                <TooltipContent>Copy URL</TooltipContent>
              </Tooltip>
            </div>
          </PropertyRow>
          <PropertyRow label="Labels">
            <LabelsField bookmark={bookmark} />
          </PropertyRow>
          <PropertyRow label="Key">
            <span className="flex h-7 items-center px-1">
              <EntityKeyCopy entityKey={entity.key} />
            </span>
          </PropertyRow>
          <PropertyRow label="Added">
            <span className="flex h-7 items-center px-2 text-sm">
              {formatDateTime(entity.createdAt)}
            </span>
          </PropertyRow>
          <PropertyRow label="Preview">
            <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
              {bookmark.metadataFetchedAt
                ? `Fetched ${formatDateTime(bookmark.metadataFetchedAt)}`
                : "Not fetched yet"}
            </span>
          </PropertyRow>
        </section>

        <div className="-mx-2 flex flex-col gap-5">
          <RelationshipsPanel entity={entity} />
          <MentionedInPanel entity={entity} />
        </div>
      </div>

      <TrashEntityDialog
        entity={entity}
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onTrashed={() => {
          onClose();
          void queryClient.invalidateQueries({ queryKey: ["bookmarks", entity.spaceId] });
        }}
      />
      <ComparePreviewsDialog
        bookmark={bookmark}
        open={compareOpen}
        onOpenChange={setCompareOpen}
        onChoose={(preferredImage) => {
          setPreferred.mutate(preferredImage);
          setCompareOpen(false);
        }}
      />
    </>
  );
}

/// Side by side comparison of both fetched images, so a page whose scraped
/// `og:image` beats its own screenshot (or the other way around) isn't stuck
/// with whichever one the default heuristic (screenshot, then og:image) picked.
function ComparePreviewsDialog({
  bookmark,
  open,
  onOpenChange,
  onChoose,
}: {
  bookmark: Bookmark;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (preferredImage: "screenshot" | "preview") => void;
}) {
  const effective = bookmark.preferredImage === "preview" ? "preview" : "screenshot";
  const options: { key: "screenshot" | "preview"; label: string; src: string | null }[] = [
    {
      key: "screenshot",
      label: "Captured screenshot",
      src: bookmark.screenshotPath ? convertFileSrc(bookmark.screenshotPath) : null,
    },
    {
      key: "preview",
      label: "Site's preview image",
      src: bookmark.previewImageUrl,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compare Previews</DialogTitle>
          <DialogDescription>Pick which image shows on this bookmark's card.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={!option.src}
              onClick={() => option.src && onChoose(option.key)}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-lg border p-2 text-left disabled:cursor-not-allowed disabled:opacity-40",
                effective === option.key
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <div className="relative aspect-[1.91/1] w-full overflow-hidden rounded-md bg-muted/40">
                {option.src ? (
                  <img src={option.src} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    Not available
                  </div>
                )}
                {effective === option.key && (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <IconCheck size={12} />
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/// The title, edited in place like a page title: saved on blur or Enter,
/// Escape restores it. Emptying it keeps the old title.
function TitleField({
  value,
  onSave,
  pending,
  failed,
}: {
  value: string;
  onSave: (title: string) => void;
  pending: boolean;
  failed: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  function save() {
    const next = draft.trim();
    if (!next) setDraft(value);
    else if (next !== value) onSave(next);
  }

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            // Keeps the sheet open: Escape here only undoes the edit.
            e.stopPropagation();
            const input = e.currentTarget;
            setDraft(value);
            requestAnimationFrame(() => input.blur());
          }
        }}
        aria-label={failed ? "Couldn't rename, try again" : "Title"}
        aria-invalid={failed || undefined}
        className={cn(
          "h-6 min-w-0 flex-1 truncate rounded-sm bg-transparent pr-6 font-heading text-base font-medium outline-none focus-visible:bg-accent/50",
          failed && "text-destructive",
        )}
      />
      <span className="pointer-events-none absolute right-1">
        <StatusIcon status={pending ? "pending" : failed ? "error" : "idle"} idle={null} />
      </span>
    </div>
  );
}

function LabelsField({ bookmark }: { bookmark: Bookmark }) {
  const labels = useSpaceLabels(bookmark.entity.spaceId);
  const { toggle, create } = useBookmarkLabels(bookmark);
  const attached = bookmark.labelIds.flatMap((id) => labels.find((l) => l.id === id) ?? []);
  return (
    <LabelsPicker
      labels={labels}
      selected={bookmark.labelIds}
      onToggle={(labelId) => !toggle.isPending && toggle.mutate(labelId)}
      onCreate={(name) => create.mutate(name)}
      creating={create.isPending}
      pendingId={toggle.isPending ? toggle.variables : undefined}
      failedId={toggle.isError ? toggle.variables : undefined}
      align="end"
    >
      <button
        type="button"
        aria-label={create.isError ? "Couldn't create the label, try again" : "Change Labels"}
        className={cn(PROPERTY_VALUE, "h-auto min-h-7 flex-wrap py-1")}
      >
        {(create.isError || create.isPending) && (
          <PendingIcon pending={create.isPending} failed={create.isError} idle={null} />
        )}
        {attached.length > 0 ? (
          attached.map((label) => (
            <LabelChip key={label.id} label={label} className="rounded-full border-foreground/10" />
          ))
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            <IconTag size={14} />
            Add labels
          </span>
        )}
      </button>
    </LabelsPicker>
  );
}
