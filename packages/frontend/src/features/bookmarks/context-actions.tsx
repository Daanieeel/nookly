import { IconCopy, IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { registerEntityType } from "#/components/context-menu/registry.ts";
import { fetchBookmarkMetadata, listBookmarks } from "#/lib/api/bookmarks.ts";
import type { Bookmark, Entity } from "#/lib/api/types.ts";
import { copyText } from "#/lib/clipboard.ts";

function useBookmarkRecord(entity: Entity): Bookmark | undefined {
  const { data: bookmarks } = useQuery({
    queryKey: ["bookmarks", entity.spaceId],
    queryFn: () => listBookmarks(entity.spaceId),
  });
  return bookmarks?.find((b) => b.entity.id === entity.id);
}

registerEntityType<Bookmark>({
  types: ["bookmark"],
  useRecord: useBookmarkRecord,
  actions: [
    {
      id: "open-in-browser",
      group: "open",
      label: "Open in Browser",
      icon: IconExternalLink,
      disabled: ({ record }) => !record,
      run: ({ record }) => (record ? openUrl(record.url) : undefined),
    },
    {
      id: "refresh-metadata",
      group: "type",
      label: "Refresh Metadata",
      icon: IconRefresh,
      disabled: ({ record }) => !record,
      run: async ({ entity, record }, helpers) => {
        if (!record) return;
        await fetchBookmarkMetadata(entity.id, record.url);
        await helpers.refresh();
      },
    },
    {
      id: "copy-url",
      group: "share",
      label: "Copy URL",
      icon: IconCopy,
      successLabel: "URL copied",
      disabled: ({ record }) => !record,
      run: ({ record }) => (record ? copyText(record.url) : undefined),
    },
  ],
});
