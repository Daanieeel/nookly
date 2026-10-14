import { type SqlValue, decodePk, syncedTable } from "../schema.ts";
import type { Conflict } from "../sync/engine.ts";
import { type LocalDb, first, optStr } from "./db.ts";
import { getEntity } from "./entities.ts";

/// A change that lost to a newer one, said in words: the item it belongs to, which of
/// its fields, and the value that lost.
export interface ConflictItem {
  conflict: Conflict;
  /// The item the change belongs to, when it is still here.
  entityId: string | null;
  title: string;
  /// "Due date", or "The whole item" when a removed or undone row lost.
  field: string;
  value: string | null;
}

/// `due_date` as "Due date", `status_id` as "Status".
export function fieldLabel(column: string | null): string {
  if (!column) return "The whole item";
  const words = column.replace(/_id$/, "").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/// The entity a synced row belongs to: its own id for an entity, else the entity its
/// scope column names.
async function entityOf(db: LocalDb, conflict: Conflict): Promise<string | null> {
  const table = syncedTable(conflict.table);
  if (!table) return null;
  const key = decodePk(table, conflict.pk);
  if (table.name === "entities") return optStr(key.id);
  if (table.scope.kind !== "column") return null;
  const column = table.scope.column;
  if (column in key) return optStr(key[column]);
  const where = table.pk.map((c) => `"${c}" = ?`).join(" AND ");
  const params: SqlValue[] = table.pk.map((c) => key[c] ?? null);
  const row = await first(
    db,
    `SELECT "${column}" AS scope FROM "${table.name}" WHERE ${where}`,
    ...params,
  );
  return optStr(row?.scope);
}

export async function describeConflicts(
  db: LocalDb,
  conflicts: Conflict[],
): Promise<ConflictItem[]> {
  return Promise.all(
    conflicts.map(async (conflict) => {
      const entityId = await entityOf(db, conflict);
      const entity = entityId ? await getEntity(db, entityId) : null;
      return {
        conflict,
        entityId: entity ? entity.id : null,
        title: entity ? entity.title || "Untitled" : "An item no longer here",
        field: fieldLabel(conflict.field),
        value:
          conflict.field === null || conflict.losingValue === null
            ? null
            : String(conflict.losingValue),
      };
    }),
  );
}
