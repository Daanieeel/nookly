import { invoke } from "@tauri-apps/api/core";
import type { Bookmark } from "./types";

export function createBookmark(spaceId: string, url: string): Promise<Bookmark> {
  return invoke("create_bookmark", { spaceId, url });
}

export function getBookmark(entityId: string): Promise<Bookmark> {
  return invoke("get_bookmark", { entityId });
}

export function listBookmarks(spaceId: string): Promise<Bookmark[]> {
  return invoke("list_bookmarks", { spaceId });
}

export function fetchBookmarkMetadata(entityId: string, url: string): Promise<Bookmark> {
  return invoke("fetch_bookmark_metadata", { entityId, url });
}

/// Clears the old page's metadata; fetch again for the new one.
export function updateBookmarkUrl(entityId: string, url: string): Promise<Bookmark> {
  return invoke("update_bookmark_url", { entityId, url });
}
