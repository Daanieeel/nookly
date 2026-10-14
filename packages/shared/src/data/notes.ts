import { type LocalDb, iso, num, optStr, rows, str, write } from "./db.ts";
import { createEntityStatements } from "./entities.ts";

/// A block of a page, as the desktop stores it: markdown text per block.
export interface BlockRecord {
  id: string;
  entityId: string;
  position: number;
  blockType: string;
  content: string;
  language: string | null;
}

/// The block types a phone edits as text. Others (tables, math, custom blocks) show
/// their content as is and stay as they are.
export const TEXT_BLOCK_TYPES = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "quote",
  "bulleted_list",
  "numbered_list",
  "code",
];

export async function listBlocks(db: LocalDb, entityId: string): Promise<BlockRecord[]> {
  return (
    await rows(
      db,
      "SELECT id, entity_id, position, block_type, content, language FROM blocks WHERE entity_id = ? ORDER BY position, id",
      entityId,
    )
  ).map((r) => ({
    id: str(r.id),
    entityId: str(r.entity_id),
    position: num(r.position),
    blockType: str(r.block_type),
    content: str(r.content),
    language: optStr(r.language),
  }));
}

/// A new page (note) or jot, empty but for one paragraph.
export async function createPage(
  db: LocalDb,
  spaceId: string,
  type: "note" | "jot",
  title: string,
): Promise<string> {
  const { id, statements } = createEntityStatements(db, spaceId, type, title);
  const now = iso(db);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES (?, ?, 0, 'paragraph', '', ?, ?)",
      params: [db.newId(), id, now, now],
    },
  ]);
  return id;
}

/// Adds a block after `afterPosition` (or at the end), moving the ones below down.
export async function addBlock(
  db: LocalDb,
  entityId: string,
  blockType: string,
  content: string,
  afterPosition?: number,
): Promise<string> {
  const id = db.newId();
  const now = iso(db);
  const position = afterPosition === undefined ? null : afterPosition + 1;
  await write(db, [
    ...(position === null
      ? []
      : [
          {
            sql: "UPDATE blocks SET position = position + 1 WHERE entity_id = ? AND position >= ?",
            params: [entityId, position],
          },
        ]),
    {
      sql: "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES (?, ?, COALESCE(?, (SELECT COALESCE(MAX(position), -1) + 1 FROM blocks WHERE entity_id = ?)), ?, ?, ?, ?)",
      params: [id, entityId, position, entityId, blockType, content, now, now],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [now, entityId] },
  ]);
  return id;
}

export async function updateBlock(
  db: LocalDb,
  id: string,
  content: string,
  blockType?: string,
): Promise<void> {
  const now = iso(db);
  await write(db, [
    {
      sql: "UPDATE blocks SET content = ?, block_type = COALESCE(?, block_type), updated_at = ? WHERE id = ?",
      params: [content, blockType ?? null, now, id],
    },
    {
      sql: "UPDATE entities SET updated_at = ? WHERE id = (SELECT entity_id FROM blocks WHERE id = ?)",
      params: [now, id],
    },
  ]);
}

/// Removes a block, as the desktop's editor does; the sync carries it as a tombstone.
export async function deleteBlock(db: LocalDb, id: string): Promise<void> {
  await write(db, [{ sql: "DELETE FROM blocks WHERE id = ?", params: [id] }]);
}

/// The page's text, for previews: the first block that says something.
export async function pagePreview(db: LocalDb, entityId: string): Promise<string> {
  const row = (
    await rows(
      db,
      "SELECT content FROM blocks WHERE entity_id = ? AND content <> '' ORDER BY position LIMIT 1",
      entityId,
    )
  )[0];
  return row ? str(row.content) : "";
}
