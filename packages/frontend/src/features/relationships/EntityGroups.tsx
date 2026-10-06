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

function groupByType<T>(items: T[], typeOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = labelForType(typeOf(item));
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups];
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
export function TypeGroups<T extends { key: string; entityId: string }>({
  items,
  renderRow,
}: {
  items: T[];
  renderRow: (item: T) => ReactNode;
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
      {groupByType(loaded, (item) => types.get(item.entityId) ?? "").map(([label, group]) => (
        <RowGroup key={label} label={label}>
          {group.map((item) => (
            <div key={item.key}>{renderRow(item)}</div>
          ))}
        </RowGroup>
      ))}
      {pending.map((item) => (
        <div key={item.key}>{renderRow(item)}</div>
      ))}
    </>
  );
}
