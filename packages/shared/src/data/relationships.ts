import { type LocalDb, first, iso, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, toEntity } from "./entities.ts";

/// Relationships between items (`db/relationships.rs`): every type the desktop has, read in
/// both directions, and the ones a person makes by hand created with the same checks.

export interface RelationshipType {
  name: string;
  /// Read from the item the link starts at: "Blocks".
  label: string;
  /// Read from the other end: "blocked by".
  inverseLabel: string;
  fromType: string | null;
  toType: string | null;
  /// Made by hand; the rest come with what they tie together (a session to its course).
  creatable: boolean;
}

const type = (
  name: string,
  label: string,
  inverseLabel: string,
  fromType: string | null,
  toType: string | null,
  creatable = false,
): RelationshipType => ({ name, label, inverseLabel, fromType, toType, creatable });

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  type("relates-to", "Related to", "related from", null, null, true),
  type("blocks", "Blocks", "blocked by", null, null, true),
  type("attached-file", "Attached file", "attached to", null, null, true),
  type("sequel-of", "Sequel of", "prequel of", "course", "course", true),
  type("sub-task-of", "Sub-task of", "has sub-task", "sub_task", "task"),
  type("session-course", "Session of course", "has session", "session", "course"),
  type("session-jot", "Jot for session", "jot for session", "session", "jot"),
  type("session-note", "Note for session", "note for session", "session", "note"),
  type("course-semester", "Course in semester", "has course", "course", "semester"),
  type("course-note", "Notes page of course", "notes page for course", "course", "course_notes"),
  type("course-notes", "Notes for course", "notes for course", "course", "note"),
  type("course-jots", "Jots for course", "jots for course", "course", "jot"),
  type("semester-notes", "Notes for semester", "notes for semester", "semester", "note"),
  type("exam-course", "Exam for course", "has exam", "exam", "course"),
  type("assignment-course", "Assignment for course", "has assignment", "assignment", "course"),
  type(
    "assignment-due-session",
    "Due before session",
    "is the due session of",
    "assignment",
    "session",
  ),
  type("study-block-exam", "Study block for exam", "has study block", "study_block", "exam"),
  type("deck-exam", "Deck for exam", "has deck", "index_card_deck", "exam"),
];

export interface LinkedItem {
  relationshipId: string;
  type: RelationshipType;
  /// How it reads from this item: "Blocks", or "blocked by" when the link points here.
  label: string;
  outgoing: boolean;
  entity: EntityRecord;
}

/// Every link of an item to another that is still there, grouped by how it reads, the
/// hand made ones first.
export async function linkedItems(db: LocalDb, id: string): Promise<LinkedItem[]> {
  const found = await rows(
    db,
    `SELECT r.id AS relationship_id, r.relationship_type, r.from_entity_id, ${ENTITY_COLUMNS}
     FROM relationships r
     JOIN entities e ON e.id = CASE WHEN r.from_entity_id = ? THEN r.to_entity_id ELSE r.from_entity_id END
     WHERE (r.from_entity_id = ? OR r.to_entity_id = ?) AND e.deleted_at IS NULL AND e.hidden_at IS NULL
       AND e.type != 'course_notes'
     ORDER BY e.title COLLATE NOCASE`,
    id,
    id,
    id,
  );
  const items = found.flatMap((r) => {
    const known = RELATIONSHIP_TYPES.find((t) => t.name === str(r.relationship_type));
    if (!known) return [];
    const outgoing = str(r.from_entity_id) === id;
    return [
      {
        relationshipId: str(r.relationship_id),
        type: known,
        label: outgoing ? known.label : known.inverseLabel,
        outgoing,
        entity: toEntity(r),
      },
    ];
  });
  const rank = (item: LinkedItem) => RELATIONSHIP_TYPES.indexOf(item.type);
  return items.toSorted((a, b) => rank(a) - rank(b));
}

/// What `type` accepts at an end, as the desktop's `end_accepts`: a note-like end takes any
/// page type of that family.
function accepts(required: string | null, actual: string): boolean {
  return required === null || required === actual;
}

/// `create_relationship` for the types a person makes: the same two items are linked once per
/// type, never to themselves, and each end must be of the type the relationship names.
export async function createRelationship(
  db: LocalDb,
  fromId: string,
  toId: string,
  typeName: string,
): Promise<void> {
  const def = RELATIONSHIP_TYPES.find((t) => t.name === typeName && t.creatable);
  if (!def) throw new Error("This kind of link can't be made by hand.");
  if (fromId === toId) throw new Error("An item can't link to itself.");
  const from = await first(
    db,
    "SELECT type FROM entities WHERE id = ? AND deleted_at IS NULL",
    fromId,
  );
  const to = await first(db, "SELECT type FROM entities WHERE id = ? AND deleted_at IS NULL", toId);
  if (!from || !to) throw new Error("One of the items isn't here anymore.");
  if (!accepts(def.fromType, str(from.type)) || !accepts(def.toType, str(to.type))) {
    throw new Error(`${def.label} links a ${def.fromType} to a ${def.toType}.`);
  }
  const existing = await first(
    db,
    `SELECT id FROM relationships WHERE relationship_type = ? AND
       ((from_entity_id = ? AND to_entity_id = ?)${typeName === "relates-to" ? " OR (from_entity_id = ? AND to_entity_id = ?)" : ""})`,
    typeName,
    fromId,
    toId,
    ...(typeName === "relates-to" ? [toId, fromId] : []),
  );
  if (existing) return;
  await write(db, [
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [db.newId(), fromId, toId, typeName, iso(db)],
    },
  ]);
}

/// Items mentioned in a page's text, as `[Title](mention:<id>)` (optionally `#p3` for a page of a file).
const MENTION = /\(mention:([0-9a-fA-F-]{36})(?:#[^)]*)?\)/g;

/// The items a page mentions, in the order they first appear, those still here.
export async function mentionsOf(db: LocalDb, id: string): Promise<EntityRecord[]> {
  const found = new Set<string>();
  for (const block of await rows(
    db,
    "SELECT content FROM blocks WHERE entity_id = ? ORDER BY position",
    id,
  )) {
    for (const match of str(block.content).matchAll(MENTION)) {
      if (match[1] !== id) found.add(match[1]);
    }
  }
  const items: EntityRecord[] = [];
  for (const mentioned of found) {
    const row = await first(
      db,
      `SELECT ${ENTITY_COLUMNS} FROM entities e WHERE e.id = ? AND e.deleted_at IS NULL AND e.hidden_at IS NULL AND e.type != 'course_notes'`,
      mentioned,
    );
    if (row) items.push(toEntity(row));
  }
  return items;
}

/// The pages that mention an item.
export async function mentionedIn(db: LocalDb, id: string): Promise<EntityRecord[]> {
  return (
    await rows(
      db,
      `SELECT DISTINCT ${ENTITY_COLUMNS} FROM entities e JOIN blocks b ON b.entity_id = e.id
       WHERE b.content LIKE ? AND e.id != ? AND e.deleted_at IS NULL AND e.hidden_at IS NULL
       ORDER BY e.title COLLATE NOCASE`,
      `%(mention:${id}%`,
      id,
    )
  ).map(toEntity);
}
