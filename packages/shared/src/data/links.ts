import { labelColorFor } from "../colors.ts";
import { type LocalDb, first, iso, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, toEntity } from "./entities.ts";

/// Related items and labels, the two ways an item points past itself, written as the
/// desktop's `db::relationships` and `db::labels` write them.

export interface RelatedItem {
  relationshipId: string;
  entity: EntityRecord;
}

/// Items linked with `relates-to`, whichever way the link points (the desktop's
/// Related section). Items in Trash leave the list.
export async function relatedItems(db: LocalDb, entityId: string): Promise<RelatedItem[]> {
  return (
    await rows(
      db,
      `SELECT r.id AS relationship_id, ${ENTITY_COLUMNS} FROM relationships r
       JOIN entities e ON e.id = CASE WHEN r.from_entity_id = ? THEN r.to_entity_id ELSE r.from_entity_id END
       WHERE r.relationship_type = 'relates-to' AND (r.from_entity_id = ? OR r.to_entity_id = ?)
         AND e.deleted_at IS NULL AND e.hidden_at IS NULL
       ORDER BY e.title`,
      entityId,
      entityId,
      entityId,
    )
  ).map((r) => ({ relationshipId: str(r.relationship_id), entity: toEntity(r) }));
}

/// Links two items. The same link, either way round, is stored once.
export async function relate(db: LocalDb, fromId: string, toId: string): Promise<void> {
  if (fromId === toId) return;
  const existing = await first(
    db,
    `SELECT id FROM relationships WHERE relationship_type = 'relates-to'
     AND ((from_entity_id = ? AND to_entity_id = ?) OR (from_entity_id = ? AND to_entity_id = ?))`,
    fromId,
    toId,
    toId,
    fromId,
  );
  if (existing) return;
  await write(db, [
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'relates-to', ?)",
      params: [db.newId(), fromId, toId, iso(db)],
    },
  ]);
}

export async function unrelate(db: LocalDb, relationshipId: string): Promise<void> {
  await write(db, [{ sql: "DELETE FROM relationships WHERE id = ?", params: [relationshipId] }]);
}

export interface LabelRecord {
  id: string;
  spaceId: string;
  name: string;
  color: string;
}

const toLabel = (r: Record<string, string | number | null>): LabelRecord => ({
  id: str(r.id),
  spaceId: str(r.space_id),
  name: str(r.name),
  color: str(r.color),
});

/// A Space's labels, by name. Labels never cross Spaces.
export async function listLabels(db: LocalDb, spaceId: string): Promise<LabelRecord[]> {
  return (
    await rows(
      db,
      "SELECT id, space_id, name, color FROM labels WHERE space_id = ? ORDER BY name COLLATE NOCASE",
      spaceId,
    )
  ).map(toLabel);
}

export async function entityLabels(db: LocalDb, entityId: string): Promise<LabelRecord[]> {
  return (
    await rows(
      db,
      `SELECT l.id, l.space_id, l.name, l.color FROM labels l
       JOIN entity_labels el ON el.label_id = l.id WHERE el.entity_id = ? ORDER BY l.name COLLATE NOCASE`,
      entityId,
    )
  ).map(toLabel);
}

/// `create_label`: names are unique per Space, ignoring case. Asking for a name that
/// exists gives that label back, so typing it again just picks it.
export async function createLabel(db: LocalDb, spaceId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the label a name.");
  const existing = await first(
    db,
    "SELECT id FROM labels WHERE space_id = ? AND name = ? COLLATE NOCASE",
    spaceId,
    trimmed,
  );
  if (existing) return str(existing.id);
  const id = db.newId();
  await write(db, [
    {
      sql: "INSERT INTO labels (id, space_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [id, spaceId, trimmed, labelColorFor(trimmed), iso(db)],
    },
  ]);
  return id;
}

export async function attachLabel(db: LocalDb, entityId: string, labelId: string): Promise<void> {
  await write(db, [
    {
      // Labels are siloed per Space: one from another Space is never attached.
      sql: "INSERT OR IGNORE INTO entity_labels (entity_id, label_id) SELECT e.id, l.id FROM entities e JOIN labels l ON l.space_id = e.space_id WHERE e.id = ? AND l.id = ?",
      params: [entityId, labelId],
    },
  ]);
}

export async function detachLabel(db: LocalDb, entityId: string, labelId: string): Promise<void> {
  await write(db, [
    {
      sql: "DELETE FROM entity_labels WHERE entity_id = ? AND label_id = ?",
      params: [entityId, labelId],
    },
  ]);
}
