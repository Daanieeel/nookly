import type { SqlStatement } from "../sync/sql.ts";
import {
  type LocalDb,
  first,
  iso,
  keyPrefix,
  moduleKeys,
  num,
  optStr,
  rows,
  str,
  write,
} from "./db.ts";

export interface Space {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  position: number;
}

export interface EntityRecord {
  id: string;
  spaceId: string;
  type: string;
  title: string;
  icon: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  key: string;
  lastOpenedAt: string | null;
}

/// Every column an `EntityRecord` reads, for `SELECT ${ENTITY_COLUMNS} FROM entities e`.
export const ENTITY_COLUMNS =
  "e.id, e.space_id, e.type, e.title, e.icon, e.pinned, e.created_at, e.updated_at, e.deleted_at, e.key_prefix, e.key_number, e.last_opened_at";

export function toEntity(row: Record<string, string | number | null>): EntityRecord {
  return {
    id: str(row.id),
    spaceId: str(row.space_id),
    type: str(row.type),
    title: str(row.title),
    icon: optStr(row.icon),
    pinned: num(row.pinned) !== 0,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    deletedAt: optStr(row.deleted_at),
    key: `${str(row.key_prefix)}-${num(row.key_number)}`,
    lastOpenedAt: optStr(row.last_opened_at),
  };
}

export async function listSpaces(db: LocalDb): Promise<Space[]> {
  return (
    await rows(db, "SELECT id, name, icon, color, position FROM spaces ORDER BY position, name")
  ).map((r) => ({
    id: str(r.id),
    name: str(r.name),
    icon: optStr(r.icon),
    color: str(r.color),
    position: num(r.position),
  }));
}

export async function createSpace(
  db: LocalDb,
  name: string,
  color: string,
  icon: string | null = null,
): Promise<string> {
  const id = db.newId();
  const now = iso(db);
  await write(db, [
    {
      sql: "INSERT INTO spaces (id, name, icon, color, created_at, updated_at, position) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM spaces))",
      params: [id, name, icon, color, now, now],
    },
  ]);
  return id;
}

/// The modules a Space shows, in its order.
export async function spaceModules(db: LocalDb, spaceId: string): Promise<string[]> {
  return (
    await rows(
      db,
      "SELECT module_key FROM space_modules WHERE space_id = ? AND hidden_at IS NULL ORDER BY position",
      spaceId,
    )
  ).map((r) => str(r.module_key));
}

/// `add_space_module`: the module joins the end of the Space's list, once.
function addModule(spaceId: string, module: string, now: string): SqlStatement[] {
  const companions = module === "exams" || module === "assignments" ? ["grades"] : [];
  return [module, ...companions].map((key) => ({
    sql: "INSERT OR IGNORE INTO space_modules (space_id, module_key, added_at, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM space_modules WHERE space_id = ?))",
    params: [spaceId, key, now, spaceId],
  }));
}

/// A new row's id with the statements that create it, to run in one transaction.
export interface PlannedCreate {
  id: string;
  statements: SqlStatement[];
}

/// `create_entity`: the next key number of its prefix (never reused), and its
/// modules added to the Space.
export function createEntityStatements(
  db: LocalDb,
  spaceId: string,
  type: string,
  title: string,
): PlannedCreate {
  const id = db.newId();
  const now = iso(db);
  const prefix = keyPrefix(type);
  return {
    id,
    statements: [
      {
        sql: "INSERT INTO entities (id, space_id, type, title, icon, pinned, created_at, updated_at, key_prefix, key_number) VALUES (?, ?, ?, ?, NULL, 0, ?, ?, ?, (SELECT COALESCE(MAX(key_number), 0) + 1 FROM entities WHERE key_prefix = ?))",
        params: [id, spaceId, type, title, now, now, prefix, prefix],
      },
      ...moduleKeys(type).flatMap((m) => addModule(spaceId, m, now)),
    ],
  };
}

export async function getEntity(db: LocalDb, id: string): Promise<EntityRecord | null> {
  const row = await first(db, `SELECT ${ENTITY_COLUMNS} FROM entities e WHERE e.id = ?`, id);
  return row ? toEntity(row) : null;
}

export interface EntityQuery {
  spaceId?: string;
  types?: string[];
  /// Only what is in Trash, else only what isn't.
  trash?: boolean;
}

export async function listEntities(db: LocalDb, query: EntityQuery = {}): Promise<EntityRecord[]> {
  const where = [
    "e.hidden_at IS NULL",
    query.trash ? "e.deleted_at IS NOT NULL" : "e.deleted_at IS NULL",
  ];
  const params: (string | number)[] = [];
  if (query.spaceId) {
    where.push("e.space_id = ?");
    params.push(query.spaceId);
  }
  if (query.types?.length) {
    where.push(`e.type IN (${query.types.map(() => "?").join(", ")})`);
    params.push(...query.types);
  }
  return (
    await rows(
      db,
      `SELECT ${ENTITY_COLUMNS} FROM entities e WHERE ${where.join(" AND ")} ORDER BY e.updated_at DESC`,
      ...params,
    )
  ).map(toEntity);
}

export async function renameEntity(db: LocalDb, id: string, title: string): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE entities SET title = ?, updated_at = ? WHERE id = ?",
      params: [title, iso(db), id],
    },
  ]);
}

export async function setPinned(db: LocalDb, id: string, pinned: boolean): Promise<void> {
  await write(db, [
    { sql: "UPDATE entities SET pinned = ? WHERE id = ?", params: [pinned ? 1 : 0, id] },
  ]);
}

/// `soft_delete_entity`: to Trash, with its Sub-tasks. Never removed.
export async function trashEntity(db: LocalDb, id: string): Promise<void> {
  const now = iso(db);
  await write(db, [
    {
      sql: "UPDATE entities SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
      params: [now, now, id],
    },
    {
      sql: "UPDATE entities SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND id IN (SELECT from_entity_id FROM relationships WHERE to_entity_id = ? AND relationship_type = 'sub-task-of')",
      params: [now, now, id],
    },
  ]);
}

/// `restore_entity`: back from Trash, with the Sub-tasks that went with it.
export async function restoreEntity(db: LocalDb, id: string): Promise<void> {
  const trashed = await first(
    db,
    "SELECT deleted_at FROM entities WHERE id = ? AND deleted_at IS NOT NULL AND hidden_at IS NULL",
    id,
  );
  if (!trashed) return;
  const now = iso(db);
  await write(db, [
    {
      sql: "UPDATE entities SET deleted_at = NULL, updated_at = ? WHERE id = ?",
      params: [now, id],
    },
    {
      sql: "UPDATE entities SET deleted_at = NULL, updated_at = ? WHERE deleted_at = ? AND hidden_at IS NULL AND id IN (SELECT from_entity_id FROM relationships WHERE to_entity_id = ? AND relationship_type = 'sub-task-of')",
      params: [now, trashed.deleted_at ?? null, id],
    },
  ]);
}

/// Opening an entity, for Recents. When it was opened is this device's own.
export async function markOpened(db: LocalDb, id: string): Promise<void> {
  await write(db, [
    { sql: "UPDATE entities SET last_opened_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

/// The last few entities opened here, of any type and Space.
export async function recents(db: LocalDb, limit = 8): Promise<EntityRecord[]> {
  return (
    await rows(
      db,
      `SELECT ${ENTITY_COLUMNS} FROM entities e WHERE e.last_opened_at IS NOT NULL AND e.deleted_at IS NULL AND e.hidden_at IS NULL ORDER BY e.last_opened_at DESC LIMIT ?`,
      limit,
    )
  ).map(toEntity);
}

export async function pinned(db: LocalDb): Promise<EntityRecord[]> {
  return (
    await rows(
      db,
      `SELECT ${ENTITY_COLUMNS} FROM entities e WHERE e.pinned = 1 AND e.deleted_at IS NULL AND e.hidden_at IS NULL ORDER BY e.title`,
    )
  ).map(toEntity);
}

/// Search across every Space: titles, keys like TSK-14, and page text.
export async function search(db: LocalDb, query: string, limit = 50): Promise<EntityRecord[]> {
  const text = query.trim();
  if (!text) return [];
  const like = `%${text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return (
    await rows(
      db,
      `SELECT ${ENTITY_COLUMNS} FROM entities e
       WHERE e.deleted_at IS NULL AND e.hidden_at IS NULL AND e.type NOT IN ('course_notes', 'semester_notes', 'view')
         AND (e.title LIKE ? ESCAPE '\\' OR (e.key_prefix || '-' || e.key_number) = UPPER(?)
           OR EXISTS (SELECT 1 FROM blocks b WHERE b.entity_id = e.id AND b.content LIKE ? ESCAPE '\\'))
       ORDER BY (e.title LIKE ? ESCAPE '\\') DESC, e.updated_at DESC LIMIT ?`,
      like,
      text,
      like,
      `${text.replaceAll("%", "")}%`,
      limit,
    )
  ).map(toEntity);
}
