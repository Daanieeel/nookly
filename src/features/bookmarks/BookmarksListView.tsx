import { IconBookmark } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBookmark, fetchBookmarkMetadata, listBookmarks } from "@/lib/api/bookmarks";
import { displayTitle } from "@/lib/entity-title";

/// Paste-a-URL-first creation (§3.3 New Bookmark): the entity is created the moment
/// a URL is submitted, and a placeholder card appears immediately at the top of the
/// grid — the creation moment itself is the confirmation, not a silent list refresh.
export function BookmarksListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const { data: bookmarks = [] } = useQuery({
    queryKey: ["bookmarks", spaceId],
    queryFn: () => listBookmarks(spaceId),
  });

  const add = useMutation({
    mutationFn: async (u: string) => {
      const bookmark = await createBookmark(spaceId, u);
      // Best-effort, opportunistic fetch (§5.10) — offline failures are swallowed,
      // the placeholder just stays until the user is online and re-opens this view.
      fetchBookmarkMetadata(bookmark.entity.id, u)
        .then(() => queryClient.invalidateQueries({ queryKey: ["bookmarks", spaceId] }))
        .catch(() => {});
      return bookmark;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks", spaceId] });
      setUrl("");
      setPendingUrl(null);
    },
    onError: () => setPendingUrl(null),
  });

  function submit(u: string) {
    if (!u.trim()) return;
    setPendingUrl(u.trim());
    add.mutate(u.trim());
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Bookmarks</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(url);
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="Paste a URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={!url.trim() || add.isPending}>
          Save
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pendingUrl && (
          <Card className="overflow-hidden py-0">
            <CardContent className="flex flex-col gap-1.5 p-3">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <p className="truncate text-xs text-muted-foreground">{pendingUrl}</p>
            </CardContent>
          </Card>
        )}
        {bookmarks.map((b) => (
          <Card key={b.entity.id} className="overflow-hidden py-0">
            {b.previewImageUrl && (
              <img src={b.previewImageUrl} alt="" className="h-28 w-full object-cover" />
            )}
            <CardContent className="flex flex-col gap-1 p-3">
              <div className="flex items-center gap-1.5">
                {b.faviconUrl && <img src={b.faviconUrl} alt="" className="size-4" />}
                <span className="truncate text-sm font-medium">
                  {b.fetchedTitle || displayTitle(b.entity)}
                </span>
              </div>
              {b.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
              )}
              {!b.metadataFetchedAt && (
                <p className="text-xs text-muted-foreground">
                  Added {b.entity.createdAt.slice(0, 10)} — metadata pending
                </p>
              )}
            </CardContent>
          </Card>
        ))}
        {bookmarks.length === 0 && !pendingUrl && (
          <EmptyState
            icon={IconBookmark}
            title="No bookmarks yet"
            description="Paste a URL above to save your first link."
            className="col-span-full"
          />
        )}
      </div>
    </div>
  );
}
