import { type LocalDb, first, iso, optStr, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, createEntityStatements, type EntityRecord, toEntity } from "./entities.ts";

export interface BookmarkRecord {
  entity: EntityRecord;
  url: string;
  description: string | null;
  faviconUrl: string | null;
  /// The site's own picture for it, once its page was read.
  previewImageUrl: string | null;
}

/// A bookmark's title starts as its address without the scheme, as on the desktop
/// before its page is fetched.
export function titleFromUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function listBookmarks(db: LocalDb, spaceId?: string): Promise<BookmarkRecord[]> {
  return (
    await rows(
      db,
      `SELECT e.id, e.space_id, e.type, e.title, e.icon, e.pinned, e.created_at, e.updated_at, e.deleted_at, e.key_prefix, e.key_number, e.last_opened_at,
         b.url, b.description, b.favicon_url, b.preview_image_url
       FROM entities e JOIN bookmarks b ON b.entity_id = e.id
       WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL ${spaceId ? "AND e.space_id = ?" : ""}
       ORDER BY e.created_at DESC`,
      ...(spaceId ? [spaceId] : []),
    )
  ).map((r) => ({
    entity: toEntity(r),
    url: str(r.url),
    description: optStr(r.description),
    faviconUrl: optStr(r.favicon_url),
    previewImageUrl: optStr(r.preview_image_url),
  }));
}

export async function createBookmark(
  db: LocalDb,
  spaceId: string,
  url: string,
  title?: string,
): Promise<string> {
  const { id, statements } = createEntityStatements(
    db,
    spaceId,
    "bookmark",
    title?.trim() || titleFromUrl(url),
  );
  await write(db, [
    ...statements,
    { sql: "INSERT INTO bookmarks (entity_id, url) VALUES (?, ?)", params: [id, url] },
  ]);
  return id;
}

export async function updateBookmark(
  db: LocalDb,
  id: string,
  url: string,
  description: string | null,
): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE bookmarks SET url = ?, description = ? WHERE entity_id = ?",
      params: [url, description, id],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

/// What a fetched page said, put on the bookmark (`update_metadata`): the title only
/// replaces one nobody has typed yet (the address it started as, or nothing), and the page's
/// description only fills an empty note, so text someone wrote is never overwritten.
export async function setBookmarkMetadata(
  db: LocalDb,
  id: string,
  meta: {
    title: string | null;
    description: string | null;
    faviconUrl: string | null;
    previewImageUrl: string | null;
  },
): Promise<void> {
  const now = iso(db);
  const current = await first(
    db,
    "SELECT e.title, b.url, b.description FROM entities e JOIN bookmarks b ON b.entity_id = e.id WHERE e.id = ?",
    id,
  );
  if (!current) throw new Error("This bookmark isn't here anymore.");
  const given = str(current.title);
  const untouched =
    !given.trim() || given === str(current.url) || given === titleFromUrl(str(current.url));
  await write(db, [
    {
      sql: "UPDATE bookmarks SET fetched_title = ?, favicon_url = ?, preview_image_url = ?, description = COALESCE(NULLIF(description, ''), ?), metadata_fetched_at = ? WHERE entity_id = ?",
      params: [meta.title, meta.faviconUrl, meta.previewImageUrl, meta.description, now, id],
    },
    ...(meta.title && untouched
      ? [
          {
            sql: "UPDATE entities SET title = ?, updated_at = ? WHERE id = ?",
            params: [meta.title, now, id],
          },
        ]
      : []),
  ]);
}

export interface BookmarkDetails extends BookmarkRecord {
  fetchedAt: string | null;
}

export async function getBookmarkDetails(db: LocalDb, id: string): Promise<BookmarkDetails | null> {
  const r = await first(
    db,
    `SELECT ${ENTITY_COLUMNS}, b.url, b.description, b.favicon_url, b.preview_image_url, b.metadata_fetched_at
     FROM entities e JOIN bookmarks b ON b.entity_id = e.id WHERE e.id = ?`,
    id,
  );
  return r
    ? {
        entity: toEntity(r),
        url: str(r.url),
        description: optStr(r.description),
        faviconUrl: optStr(r.favicon_url),
        previewImageUrl: optStr(r.preview_image_url),
        fetchedAt: optStr(r.metadata_fetched_at),
      }
    : null;
}
