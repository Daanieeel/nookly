import { useQueries } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getEntity } from "#/lib/api/entities.ts";
import type { Entity } from "#/lib/api/types.ts";
import { labelForType } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { EntityRow } from "./EntityRow";

/// A very small headline over one group of sidebar rows, which it also names for screen readers.
export function RowGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-0.5">
      <p className="px-2 pt-1 text-xs text-muted-foreground/70">{label}</p>
      {children}
    </div>
  );
}

/// The order the Relationships section lists its groups in: how often people reach
/// for each type. Types that are not listed follow the last one, in the order they
/// first appear.
const RELATIONSHIP_TYPE_ORDER = [
  "bookmark",
  "assignment",
  "task",
  "sub_task",
  "note",
  "jot",
  "file",
  "course",
  "exam",
  "calendar_entry",
  "calendar_entry_template",
  "course_notes",
  "index_card_deck",
  "recipe",
  "study_block",
  "semester",
  "view",
  "session",
  "session_template",
];

/// Where a type sits in `RELATIONSHIP_TYPE_ORDER`; unlisted types come after it.
function relationshipTypeRank(type: string): number {
  const index = RELATIONSHIP_TYPE_ORDER.indexOf(type);
  return index === -1 ? RELATIONSHIP_TYPE_ORDER.length : index;
}

function groupByType<T>(items: T[], typeOf: (item: T) => string, ranked = false): [string, T[]][] {
  const groups = new Map<string, { items: T[]; rank: number }>();
  for (const item of items) {
    const type = typeOf(item);
    const label = labelForType(type);
    const group = groups.get(label) ?? { items: [], rank: Infinity };
    group.items.push(item);
    group.rank = Math.min(group.rank, relationshipTypeRank(type));
    groups.set(label, group);
  }
  const entries = [...groups];
  // `sort` is stable, so groups of the same rank keep the order they first appeared in.
  if (ranked) entries.sort(([, a], [, b]) => a.rank - b.rank);
  return entries.map(([label, group]) => [label, group.items]);
}

/// Rows grouped by entity type, in the order each type first appears.
export function EntityGroups({
  entities,
  currentSpaceId,
}: {
  entities: Entity[];
  currentSpaceId: string;
}) {
  return groupByType(entities, (e) => e.type).map(([label, items]) => (
    <RowGroup key={label} label={label}>
      {items.map((e) => (
        <EntityRow key={e.id} entityId={e.id} currentSpaceId={currentSpaceId} />
      ))}
    </RowGroup>
  ));
}

/// `EntityGroups` for rows known only by entity id: groups what has loaded by type,
/// and holds the rest as placeholder rows until its type is known.
/// With `ranked`, the groups follow the fixed relationship order instead.
export function TypeGroups<T extends { key: string; entityId: string }>({
  items,
  renderRow,
  ranked = false,
}: {
  items: T[];
  renderRow: (item: T) => ReactNode;
  ranked?: boolean;
}) {
  const results = useQueries({
    queries: items.map((item) => ({
      queryKey: qk.entity.byId(item.entityId),
      queryFn: () => getEntity(item.entityId),
    })),
  });
  const types = new Map(
    results.flatMap((r) => (r.data ? [[r.data.id, r.data.type] as const] : [])),
  );
  const loaded = items.filter((item) => types.has(item.entityId));
  const pending = items.filter((item) => !types.has(item.entityId));
  return (
    <>
      {groupByType(loaded, (item) => types.get(item.entityId) ?? "", ranked).map(
        ([label, group]) => (
          <RowGroup key={label} label={label}>
            {group.map((item) => (
              <div key={item.key}>{renderRow(item)}</div>
            ))}
          </RowGroup>
        ),
      )}
      {pending.map((item) => (
        <div key={item.key}>{renderRow(item)}</div>
      ))}
    </>
  );
}
