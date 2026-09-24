import { IconExternalLink, IconRefresh, IconTag } from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StatusButtonContent, useActionStatus } from "@/components/action-feedback";
import { EntityActions } from "@/components/entity-actions";
import { EntityKeyCopy } from "@/components/entity-key";
import { LabelChip } from "@/components/label-chip";
import { TextProperty } from "@/components/property-fields";
import { PROPERTY_VALUE, PropertyRow } from "@/components/property-row";
import { TrashEntityDialog } from "@/components/trash-entity-dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusIcon } from "@/components/action-feedback";
import { LabelsPicker, PendingIcon } from "@/features/tasks/task-properties";
import { MentionedInPanel } from "@/features/relationships/MentionedInPanel";
import { RelationshipsPanel } from "@/features/relationships/RelationshipsPanel";
import { fetchBookmarkMetadata, getBookmark, updateBookmarkUrl } from "@/lib/api/bookmarks";
import { updateEntity } from "@/lib/api/entities";
import type { Bookmark } from "@/lib/api/types";
import { formatDateTime } from "@/lib/datetime";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
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
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => refreshStatus !== "pending" && refresh.mutate()}
          >
            <StatusButtonContent
              status={refreshStatus}
              icon={<IconRefresh />}
              label="Refresh Preview"
              successLabel="Refreshed"
              errorLabel="Couldn't refresh, try again"
            />
          </Button>
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
    </>
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
