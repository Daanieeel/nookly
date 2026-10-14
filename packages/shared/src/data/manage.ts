import { MODULE_ENTITY_TYPES, isModuleKey, moduleCompanions, removalGroup } from "../modules.ts";
import type { SqlValue } from "../schema.ts";
import type { SqlStatement } from "../sync/sql.ts";
import { type LocalDb, first, iso, moduleKeys, rows, str, write } from "./db.ts";
import { createEntityStatements } from "./entities.ts";

/// Managing Spaces, their modules, where items live, labels and what is in Trash: each
/// function does what the desktop's of the same name does (`db/spaces.rs`,
/// `db/space_modules.rs`, `db/entities.rs`, `db/labels.rs`), on the same rows.

export interface SpacePatch {
  name?: string;
  icon?: string | null;
  color?: string;
}

/// `update_space`: only what is given changes.
export async function updateSpace(db: LocalDb, id: string, patch: SpacePatch): Promise<void> {
  const row = await first(db, "SELECT name, icon, color FROM spaces WHERE id = ?", id);
  if (!row) throw new Error("This Space isn't here anymore.");
  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) throw new Error("Give the Space a name.");
  await write(db, [
    {
      sql: "UPDATE spaces SET name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ?",
      params: [
        name ?? str(row.name),
        patch.icon === undefined ? (row.icon ?? null) : patch.icon,
        patch.color ?? str(row.color),
        iso(db),
        id,
      ],
    },
  ]);
}

/// `reorder_spaces`: every Space id in its new order.
export async function reorderSpaces(db: LocalDb, ids: string[]): Promise<void> {
  await write(
    db,
    ids.map((id, position) => ({
      sql: "UPDATE spaces SET position = ? WHERE id = ?",
      params: [position, id],
    })),
  );
}

/// Tables keyed by an `entity_id` that go when their entity does.
const BY_ENTITY = [
  "tasks",
  "courses",
  "semesters",
  "session_templates",
  "sessions",
  "calendar_entry_templates",
  "calendar_entries",
  "exams",
  "study_blocks",
  "assignments",
  "files",
  "bookmarks",
  "note_settings",
  "views",
  "recipes",
  "index_card_decks",
];

/// The statements that remove everything keyed by the entities `ids` selects (a SQL
/// subquery over `entities`), in the order the desktop sweeps them, but not the
/// entities themselves.
function sweepStatements(selector: string, params: SqlValue[]): SqlStatement[] {
  const repeat = (sql: string, times = 1): SqlStatement => ({
    sql,
    params: Array.from({ length: times }, () => params).flat(),
  });
  return [
    repeat(
      `DELETE FROM relationships WHERE from_entity_id IN (${selector}) OR to_entity_id IN (${selector})`,
      2,
    ),
    repeat(`DELETE FROM entity_labels WHERE entity_id IN (${selector})`),
    repeat(`DELETE FROM blocks WHERE entity_id IN (${selector})`),
    ...BY_ENTITY.filter((t) => !["recipes", "index_card_decks"].includes(t)).map((table) =>
      repeat(`DELETE FROM ${table} WHERE entity_id IN (${selector})`),
    ),
    repeat(`DELETE FROM series_slots WHERE template_id IN (${selector})`),
    ...["recipe_ingredients", "recipe_steps", "recipe_tag_links"].map((table) =>
      repeat(`DELETE FROM ${table} WHERE recipe_entity_id IN (${selector})`),
    ),
    repeat(`DELETE FROM recipes WHERE entity_id IN (${selector})`),
    repeat(
      `DELETE FROM index_card_reviews WHERE card_id IN (SELECT id FROM index_cards WHERE deck_entity_id IN (${selector}))`,
    ),
    repeat(`DELETE FROM index_cards WHERE deck_entity_id IN (${selector})`),
    repeat(`DELETE FROM index_card_decks WHERE entity_id IN (${selector})`),
  ];
}

/// `delete_space`: the Space and everything in it, for good. A Space has no Trash.
export async function deleteSpace(db: LocalDb, id: string): Promise<void> {
  if (!(await first(db, "SELECT id FROM spaces WHERE id = ?", id))) {
    throw new Error("This Space isn't here anymore.");
  }
  await write(db, [
    ...sweepStatements("SELECT id FROM entities WHERE space_id = ?", [id]),
    {
      sql: "DELETE FROM entity_labels WHERE label_id IN (SELECT id FROM labels WHERE space_id = ?)",
      params: [id],
    },
    { sql: "DELETE FROM entities WHERE space_id = ?", params: [id] },
    { sql: "DELETE FROM labels WHERE space_id = ?", params: [id] },
    { sql: "DELETE FROM space_modules WHERE space_id = ?", params: [id] },
    { sql: "DELETE FROM spaces WHERE id = ?", params: [id] },
  ]);
}

/// `hard_delete_entity`: "Delete Forever" on one trashed item. Anything else, or an item
/// hidden with its module, is refused.
export async function deleteForever(db: LocalDb, id: string): Promise<void> {
  const row = await first(
    db,
    "SELECT id FROM entities WHERE id = ? AND deleted_at IS NOT NULL AND hidden_at IS NULL",
    id,
  );
  if (!row) throw new Error("Only an item in Trash can be deleted forever.");
  await write(db, [
    ...sweepStatements("SELECT ?", [id]),
    {
      sql: "DELETE FROM entities WHERE id = ? AND deleted_at IS NOT NULL AND hidden_at IS NULL",
      params: [id],
    },
  ]);
}

/// `empty_trash`: every trashed item, series occurrences before their templates; a
/// template a live occurrence still points at stays. Returns how many went.
export async function emptyTrash(db: LocalDb): Promise<number> {
  const trashed = (
    await rows(db, "SELECT id FROM entities WHERE deleted_at IS NOT NULL AND hidden_at IS NULL")
  ).map((r) => str(r.id));
  const isTemplate = async (id: string) =>
    Boolean(
      await first(
        db,
        "SELECT 1 AS yes FROM session_templates WHERE entity_id = ? UNION SELECT 1 FROM calendar_entry_templates WHERE entity_id = ?",
        id,
        id,
      ),
    );
  const templates: string[] = [];
  const others: string[] = [];
  for (const id of trashed) ((await isTemplate(id)) ? templates : others).push(id);
  let removed = 0;
  for (const id of others) {
    await deleteForever(db, id);
    removed += 1;
  }
  for (const id of templates) {
    const used = await first(
      db,
      "SELECT 1 AS yes FROM sessions WHERE template_id = ? UNION SELECT 1 FROM calendar_entries WHERE template_id = ?",
      id,
      id,
    );
    if (used) continue;
    await deleteForever(db, id);
    removed += 1;
  }
  return removed;
}

export async function setEntityIcon(db: LocalDb, id: string, icon: string | null): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE entities SET icon = ?, updated_at = ? WHERE id = ?",
      params: [icon, iso(db), id],
    },
  ]);
}

/// What owns what when an item moves (`MovesWith` on the desktop): a sub-task follows
/// its task, a course's sessions follow the course, a session's note follows the session.
const OWNERSHIP = new Map<string, "from-follows-to" | "to-follows-from">([
  ["sub-task-of", "from-follows-to"],
  ["session-course", "from-follows-to"],
  ["session-jot", "to-follows-from"],
  ["session-note", "to-follows-from"],
  ["course-note", "to-follows-from"],
  ["semester-notes", "to-follows-from"],
  ["study-block-exam", "from-follows-to"],
  ["deck-exam", "from-follows-to"],
  ["exam-course", "from-follows-to"],
  ["assignment-course", "from-follows-to"],
]);

/// `update_entity` with a new Space: the item and everything it owns move; labels of
/// the old Space come off; the new Space gets the modules the items need. An item that
/// is owned by another moves with its owner, so it is refused on its own.
export async function moveEntity(db: LocalDb, id: string, spaceId: string): Promise<void> {
  if (!(await first(db, "SELECT id FROM spaces WHERE id = ?", spaceId))) {
    throw new Error("That Space isn't here anymore.");
  }
  const links = async (entity: string) =>
    rows(
      db,
      "SELECT from_entity_id, to_entity_id, relationship_type FROM relationships WHERE from_entity_id = ? OR to_entity_id = ?",
      entity,
      entity,
    );
  const ownerOf = (link: Record<string, SqlValue>, current: string) => {
    const kind = OWNERSHIP.get(str(link.relationship_type));
    if (kind === "from-follows-to" && str(link.from_entity_id) === current) {
      return str(link.to_entity_id);
    }
    if (kind === "to-follows-from" && str(link.to_entity_id) === current) {
      return str(link.from_entity_id);
    }
    return null;
  };
  for (const link of await links(id)) {
    const owner = ownerOf(link, id);
    if (owner)
      throw new Error(
        "This belongs to another item and moves together with it. Move that one instead.",
      );
  }
  const moving = new Set<string>();
  const queue = [id];
  for (let current = queue.pop(); current !== undefined; current = queue.pop()) {
    if (moving.has(current)) continue;
    moving.add(current);
    for (const link of await links(current)) {
      const other =
        str(link.from_entity_id) === current ? str(link.to_entity_id) : str(link.from_entity_id);
      if (ownerOf(link, other) === current) queue.push(other);
    }
  }
  const now = iso(db);
  const statements: SqlStatement[] = [];
  for (const moved of moving) {
    const entity = await first(db, "SELECT type FROM entities WHERE id = ?", moved);
    statements.push(
      {
        sql: "UPDATE entities SET space_id = ?, updated_at = ? WHERE id = ?",
        params: [spaceId, now, moved],
      },
      {
        sql: "DELETE FROM entity_labels WHERE entity_id = ? AND label_id IN (SELECT id FROM labels WHERE space_id != ?)",
        params: [moved, spaceId],
      },
    );
    for (const key of moduleKeys(str(entity?.type)))
      statements.push(...ensureModule(spaceId, key, now));
  }
  await write(db, statements);
}

/// A `space_modules` row if it isn't there, and its companions'.
function ensureModule(spaceId: string, key: string, now: string): SqlStatement[] {
  return [key, ...moduleCompanions(key)].map((k) => ({
    sql: "INSERT OR IGNORE INTO space_modules (space_id, module_key, added_at, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM space_modules WHERE space_id = ?))",
    params: [spaceId, k, now, spaceId],
  }));
}

/// The entities of one module in a Space: its types, or a saved view of that module.
function moduleFilter(key: string): string {
  // Only a known module key is ever put into the SQL.
  const types: readonly string[] = isModuleKey(key) ? MODULE_ENTITY_TYPES[key] : [];
  const byType = types.length > 0 ? `type IN (${types.map((t) => `'${t}'`).join(", ")})` : "0";
  return `space_id = ? AND (${byType} OR (type = 'view' AND id IN (SELECT entity_id FROM views WHERE module = '${key}')))`;
}

/// `add_space_module`: the module joins the end of the list, once. A module that was
/// removed comes back, with every item hidden when it was removed (not the ones that
/// were deleted then).
export async function addSpaceModule(db: LocalDb, spaceId: string, key: string): Promise<void> {
  const now = iso(db);
  const hidden = await first(
    db,
    "SELECT 1 AS yes FROM space_modules WHERE space_id = ? AND module_key = ? AND hidden_at IS NOT NULL",
    spaceId,
    key,
  );
  await write(db, [
    ...ensureModule(spaceId, key, now),
    {
      sql: "UPDATE space_modules SET hidden_at = NULL WHERE space_id = ? AND module_key = ? AND hidden_at IS NOT NULL",
      params: [spaceId, key],
    },
    ...(hidden
      ? [
          {
            sql: `UPDATE entities SET deleted_at = NULL, hidden_at = NULL WHERE hidden_at IS NOT NULL AND ${moduleFilter(key)}`,
            params: [spaceId],
          },
        ]
      : []),
  ]);
}

/// `remove_space_module`: hides the module's items (kept, back when it is added again),
/// or with `deleteContent` moves them to Trash. Items already in Trash stay there.
export async function removeSpaceModule(
  db: LocalDb,
  spaceId: string,
  key: string,
  deleteContent: boolean,
): Promise<void> {
  const group = removalGroup(key);
  if (group.length === 0) throw new Error("This module can't be removed on its own.");
  const now = iso(db);
  const statements: SqlStatement[] = [];
  for (const member of group) {
    statements.push(
      ...ensureModule(spaceId, member, now),
      {
        sql: "UPDATE space_modules SET hidden_at = ? WHERE space_id = ? AND module_key = ? AND hidden_at IS NULL",
        params: [now, spaceId, member],
      },
      {
        sql: `UPDATE entities SET deleted_at = ?, hidden_at = ${deleteContent ? "NULL" : "?"}, updated_at = ? WHERE deleted_at IS NULL AND ${moduleFilter(member)}`,
        params: deleteContent ? [now, now, spaceId] : [now, now, now, spaceId],
      },
    );
  }
  await write(db, statements);
}

/// `reorder_space_modules`: every module key of the Space in its new order.
export async function reorderSpaceModules(
  db: LocalDb,
  spaceId: string,
  keys: string[],
): Promise<void> {
  await write(
    db,
    keys.map((key, position) => ({
      sql: "UPDATE space_modules SET position = ? WHERE space_id = ? AND module_key = ?",
      params: [position, spaceId, key],
    })),
  );
}

/// `update_label`: names are unique per Space, ignoring case.
export async function updateLabel(
  db: LocalDb,
  id: string,
  patch: { name?: string; color?: string },
): Promise<void> {
  const label = await first(db, "SELECT space_id, name, color FROM labels WHERE id = ?", id);
  if (!label) throw new Error("This label isn't here anymore.");
  const name = patch.name?.trim();
  if (patch.name !== undefined) {
    if (!name) throw new Error("Give the label a name.");
    const taken = await first(
      db,
      "SELECT id FROM labels WHERE space_id = ? AND name = ? COLLATE NOCASE AND id != ?",
      str(label.space_id),
      name,
      id,
    );
    if (taken) throw new Error("A label with this name already exists.");
  }
  await write(db, [
    {
      sql: "UPDATE labels SET name = ?, color = ? WHERE id = ?",
      params: [name ?? str(label.name), patch.color ?? str(label.color), id],
    },
  ]);
}

/// `delete_label`: off every item, then gone.
export async function deleteLabel(db: LocalDb, id: string): Promise<void> {
  await write(db, [
    { sql: "DELETE FROM entity_labels WHERE label_id = ?", params: [id] },
    { sql: "DELETE FROM labels WHERE id = ?", params: [id] },
  ]);
}

/// Types the phone can copy (`duplicate` on the desktop works from each type's own
/// schema; here the types whose rows are all known).
export const DUPLICATE_TYPES = ["task", "sub_task", "note", "jot", "bookmark"];

/// `duplicate_entity`: a copy in the same Space titled "<title> (copy)", with its icon,
/// labels, its own fields and its blocks. A sub-task stays under the same task.
export async function duplicateEntity(db: LocalDb, id: string): Promise<string> {
  const entity = await first(
    db,
    "SELECT space_id, type, title, icon FROM entities WHERE id = ? AND deleted_at IS NULL",
    id,
  );
  if (!entity) throw new Error("This item isn't here anymore.");
  const type = str(entity.type);
  if (!DUPLICATE_TYPES.includes(type))
    throw new Error("This kind of item can't be copied on the phone.");
  const title = str(entity.title).trim() ? `${str(entity.title)} (copy)` : "";
  const created = createEntityStatements(db, str(entity.space_id), type, title);
  const copy = created.id;
  const now = iso(db);
  const statements: SqlStatement[] = [
    ...created.statements,
    { sql: "UPDATE entities SET icon = ? WHERE id = ?", params: [entity.icon ?? null, copy] },
    {
      sql: "INSERT OR IGNORE INTO entity_labels (entity_id, label_id) SELECT ?, label_id FROM entity_labels WHERE entity_id = ?",
      params: [copy, id],
    },
  ];
  if (type === "task" || type === "sub_task") {
    statements.push({
      sql: "INSERT INTO tasks (entity_id, status_id, start_date, due_date, completed_at, effort, repeat_rule) SELECT ?, status_id, start_date, due_date, completed_at, effort, repeat_rule FROM tasks WHERE entity_id = ?",
      params: [copy, id],
    });
    for (const link of await rows(
      db,
      "SELECT to_entity_id FROM relationships WHERE from_entity_id = ? AND relationship_type = 'sub-task-of'",
      id,
    )) {
      statements.push({
        sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'sub-task-of', ?)",
        params: [db.newId(), copy, str(link.to_entity_id), now],
      });
    }
  }
  if (type === "bookmark") {
    statements.push({
      sql: "INSERT INTO bookmarks (entity_id, url, description) SELECT ?, url, description FROM bookmarks WHERE entity_id = ?",
      params: [copy, id],
    });
  }
  if (type === "note" || type === "jot") {
    for (const block of await rows(
      db,
      "SELECT block_type, content, language, filename, attrs, position FROM blocks WHERE entity_id = ? ORDER BY position, id",
      id,
    )) {
      statements.push({
        sql: "INSERT INTO blocks (id, entity_id, position, block_type, content, language, filename, attrs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          db.newId(),
          copy,
          block.position ?? 0,
          block.block_type ?? "paragraph",
          block.content ?? "",
          block.language ?? null,
          block.filename ?? null,
          block.attrs ?? null,
          now,
          now,
        ],
      });
    }
  }
  await write(db, statements);
  return copy;
}
