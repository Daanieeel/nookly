import { z } from "zod";
import { type LocalDb, first, iso, num, rows, str, write } from "./db.ts";
import { ENTITY_COLUMNS, type EntityRecord, createEntityStatements, toEntity } from "./entities.ts";

/// Saved Views (`db/views.rs`): a named snapshot of the Tasks or Assignments page, its filters
/// and display, kept as JSON that the page that owns it reads back and checks.

/// The pages that can be saved as a View.
export const VIEW_MODULES = [
  "tasks",
  "assignments",
  "tasks-overview",
  "assignments-overview",
] as const;
export type ViewModule = (typeof VIEW_MODULES)[number];

export interface ViewRecord {
  entity: EntityRecord;
  module: string;
  config: string;
  position: number;
}

const VIEW_SELECT = `SELECT ${ENTITY_COLUMNS}, v.module, v.config, v.position
  FROM entities e JOIN views v ON v.entity_id = e.id`;

const toView = (r: Record<string, string | number | null>): ViewRecord => ({
  entity: toEntity(r),
  module: str(r.module),
  config: str(r.config),
  position: num(r.position),
});

/// A Space's Views in sidebar order, or with no Space every Space's (for the cross Space pages
/// whose Views live in whichever Space they were saved in).
export async function listViews(
  db: LocalDb,
  query: { spaceId?: string; module?: string } = {},
): Promise<ViewRecord[]> {
  const where = ["e.deleted_at IS NULL", "e.hidden_at IS NULL"];
  const params: string[] = [];
  if (query.spaceId) {
    where.push("e.space_id = ?");
    params.push(query.spaceId);
  }
  if (query.module) {
    where.push("v.module = ?");
    params.push(query.module);
  }
  return (
    await rows(
      db,
      `${VIEW_SELECT} WHERE ${where.join(" AND ")} ORDER BY v.position, e.created_at`,
      ...params,
    )
  ).map(toView);
}

export async function getView(db: LocalDb, id: string): Promise<ViewRecord | null> {
  const row = await first(db, `${VIEW_SELECT} WHERE e.id = ?`, id);
  return row ? toView(row) : null;
}

/// A View's settings as text: a JSON object, nothing else.
const configText = z
  .string()
  .transform((raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })
  .pipe(z.looseObject({}));

function checkConfig(config: string) {
  if (!configText.safeParse(config).success)
    throw new Error("A view's settings are a JSON object.");
}

/// `create_view`: at the end of its Space's Views of the module.
export async function createView(
  db: LocalDb,
  spaceId: string,
  input: { title: string; module: ViewModule; config: string; icon?: string | null },
): Promise<string> {
  if (!VIEW_MODULES.some((m) => m === input.module)) {
    throw new Error(`Views are not available for ${input.module}.`);
  }
  checkConfig(input.config);
  const { id, statements } = createEntityStatements(db, spaceId, "view", input.title.trim());
  await write(db, [
    ...statements,
    ...(input.icon
      ? [{ sql: "UPDATE entities SET icon = ? WHERE id = ?", params: [input.icon, id] }]
      : []),
    {
      sql: "INSERT INTO views (entity_id, module, config, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM views))",
      params: [id, input.module, input.config],
    },
  ]);
  return id;
}

export async function updateViewConfig(db: LocalDb, id: string, config: string): Promise<void> {
  checkConfig(config);
  if (!(await first(db, "SELECT 1 AS yes FROM views WHERE entity_id = ?", id))) {
    throw new Error("This view isn't here anymore.");
  }
  await write(db, [
    { sql: "UPDATE views SET config = ? WHERE entity_id = ?", params: [config, id] },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}
