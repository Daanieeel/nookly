import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createBookmark, fetchBookmarkMetadata, listBookmarks } from "@/lib/api/bookmarks";

export function BookmarksListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");

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
    },
  });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Bookmarks</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) add.mutate(url.trim());
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-9"
        />
        <Button type="submit" size="sm">
          Save
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        {bookmarks.map((b) => (
          <Card key={b.entity.id} className="overflow-hidden py-0">
            {b.previewImageUrl && (
              <img src={b.previewImageUrl} alt="" className="h-28 w-full object-cover" />
            )}
            <CardContent className="flex flex-col gap-1 p-3">
              <div className="flex items-center gap-1.5">
                {b.faviconUrl && <img src={b.faviconUrl} alt="" className="size-4" />}
                <span className="truncate text-sm font-medium">
                  {b.fetchedTitle ?? b.entity.title}
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
        {bookmarks.length === 0 && (
          <p className="col-span-2 py-6 text-center text-sm text-muted-foreground">
            No bookmarks yet.
          </p>
        )}
      </div>
    </div>
  );
}
