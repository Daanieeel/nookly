import { type LocalDb, iso, optStr, rows, str, write } from "./db.ts";
import { createEntityStatements, type EntityRecord, toEntity } from "./entities.ts";

export interface BookmarkRecord {
  entity: EntityRecord;
  url: string;
  description: string | null;
  faviconUrl: string | null;
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
         b.url, b.description, b.favicon_url
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
