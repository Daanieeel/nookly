import { type LocalDb, first, iso, num, optStr, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";

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
  type: "note" | "jot" | "course_notes",
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

/// A live Note related to a jot through any relationship, in either direction: the jot has
/// been refined into it (`LINKED_NOTE` on the desktop).
const LINKED_NOTE = `SELECT 1 FROM relationships r JOIN entities t
  ON t.id = CASE WHEN r.from_entity_id = e.id THEN r.to_entity_id ELSE r.from_entity_id END
  WHERE (r.from_entity_id = e.id OR r.to_entity_id = e.id) AND t.type = 'note' AND t.deleted_at IS NULL`;

export interface JotSummary {
  entity: EntityRecord;
  preview: string;
}

/// Jots not yet refined into a note, oldest first (the most overdue), with the start of
/// their text: the Dashboard's refine queue.
export async function listUnrefinedJots(
  db: LocalDb,
  query: { spaceId?: string; limit?: number } = {},
): Promise<JotSummary[]> {
  const found = await rows(
    db,
    `SELECT ${ENTITY_COLUMNS} FROM entities e
     WHERE e.type = 'jot' AND e.deleted_at IS NULL AND e.hidden_at IS NULL${query.spaceId ? " AND e.space_id = ?" : ""}
       AND NOT EXISTS (${LINKED_NOTE})
     ORDER BY e.created_at, e.id LIMIT ?`,
    ...(query.spaceId ? [query.spaceId] : []),
    query.limit ?? 50,
  );
  const summaries: JotSummary[] = [];
  for (const row of found) {
    const entity = toEntity(row);
    const blocks = await rows(
      db,
      `SELECT content FROM blocks WHERE entity_id = ? AND TRIM(content) != ''
         AND block_type IN ('paragraph','heading1','heading2','heading3','heading4','heading5','heading6','quote','callout','bulleted_list','numbered_list')
       ORDER BY position`,
      entity.id,
    );
    const preview = blocks
      .map((b) => str(b.content))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    summaries.push({ entity, preview });
  }
  return summaries;
}

/// `refine_jot`: a new note in the jot's Space, titled like the jot unless a title is
/// given, empty, linked to it with `relates-to`. The jot stays as it is. A jot written for a
/// session hands the note to that session too, unless it has one.
export async function refineJot(db: LocalDb, jotId: string, title?: string): Promise<string> {
  const jot = await first(
    db,
    "SELECT space_id, title FROM entities WHERE id = ? AND type = 'jot' AND deleted_at IS NULL",
    jotId,
  );
  if (!jot) throw new Error("Only a jot that is still here can be refined.");
  const note = await createPage(db, str(jot.space_id), "note", title?.trim() || str(jot.title));
  const now = iso(db);
  const statements = [
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'relates-to', ?)",
      params: [db.newId(), jotId, note, now],
    },
  ];
  const session = await first(
    db,
    "SELECT from_entity_id FROM relationships WHERE to_entity_id = ? AND relationship_type = 'session-jot'",
    jotId,
  );
  if (session) {
    const has = await first(
      db,
      `SELECT 1 AS yes FROM relationships r JOIN entities t ON t.id = r.to_entity_id
       WHERE r.from_entity_id = ? AND r.relationship_type = 'session-note' AND t.deleted_at IS NULL`,
      str(session.from_entity_id),
    );
    if (!has) {
      statements.push(
        {
          sql: "DELETE FROM relationships WHERE from_entity_id = ? AND relationship_type = 'session-note'",
          params: [str(session.from_entity_id)],
        },
        {
          sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'session-note', ?)",
          params: [db.newId(), str(session.from_entity_id), note, now],
        },
      );
    }
  }
  await write(db, statements);
  return note;
}

/// Quick Jot: a jot made from a line or two of text, instantly. The first line is its
/// title (up to 80 characters); the whole text is its first paragraph.
export async function createJotFromText(
  db: LocalDb,
  spaceId: string,
  text: string,
): Promise<string> {
  const body = text.trim();
  if (!body) throw new Error("Write something first.");
  const title = (body.split("\n")[0] ?? "").trim().slice(0, 80);
  const { id, statements } = createEntityStatements(db, spaceId, "jot", title);
  const now = iso(db);
  await write(db, [
    ...statements,
    {
      sql: "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES (?, ?, 0, 'paragraph', ?, ?, ?)",
      params: [db.newId(), id, body, now, now],
    },
  ]);
  return id;
}

export interface PageSummary {
  entity: EntityRecord;
  /// The start of the page's text.
  preview: string;
  labels: { id: string; name: string; color: string }[];
  /// For a jot: the note it was refined into, if any.
  refinedInto: { id: string; title: string } | null;
}

/// A Space's notes or jots (or every Space's), most recently edited first, with what a list
/// shows of each: the start of its text, its labels and, for a jot, its note.
export async function listPageSummaries(
  db: LocalDb,
  query: { spaceId?: string; type: "note" | "jot" },
): Promise<PageSummary[]> {
  const found = await rows(
    db,
    `SELECT ${ENTITY_COLUMNS} FROM entities e
     WHERE e.type = ? AND e.deleted_at IS NULL AND e.hidden_at IS NULL${query.spaceId ? " AND e.space_id = ?" : ""}
     ORDER BY e.updated_at DESC, e.id`,
    query.type,
    ...(query.spaceId ? [query.spaceId] : []),
  );
  const summaries: PageSummary[] = [];
  for (const row of found) {
    const entity = toEntity(row);
    const blocks = await rows(
      db,
      `SELECT content FROM blocks WHERE entity_id = ? AND TRIM(content) != ''
         AND block_type IN ('paragraph','heading1','heading2','heading3','heading4','heading5','heading6','quote','callout','bulleted_list','numbered_list')
       ORDER BY position LIMIT 4`,
      entity.id,
    );
    const labels = await rows(
      db,
      "SELECT l.id, l.name, l.color FROM labels l JOIN entity_labels el ON el.label_id = l.id WHERE el.entity_id = ? ORDER BY l.name",
      entity.id,
    );
    const linked =
      query.type === "jot"
        ? await first(
            db,
            `SELECT t.id, t.title FROM relationships r JOIN entities t
               ON t.id = CASE WHEN r.from_entity_id = ? THEN r.to_entity_id ELSE r.from_entity_id END
             WHERE (r.from_entity_id = ? OR r.to_entity_id = ?) AND t.type = 'note' AND t.deleted_at IS NULL
             ORDER BY r.created_at DESC LIMIT 1`,
            entity.id,
            entity.id,
            entity.id,
          )
        : undefined;
    summaries.push({
      entity,
      preview: blocks
        .map((b) => str(b.content))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160),
      labels: labels.map((l) => ({ id: str(l.id), name: str(l.name), color: str(l.color) })),
      refinedInto: linked ? { id: str(linked.id), title: str(linked.title) } : null,
    });
  }
  return summaries;
}
