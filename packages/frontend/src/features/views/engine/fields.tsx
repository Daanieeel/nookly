import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { SpaceChip } from "#/components/space-chip.tsx";
import { TaskStatusIcon } from "#/features/tasks/task-properties.tsx";
import type { StatusKind } from "#/features/tasks/task-model.ts";
import type { Entity, Label, Space, TaskStatus } from "#/lib/api/types.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import type { ViewField } from "./types.ts";

/// Fields every source shares, built from how a source reaches an item's entity. A source
/// lists them next to its own, so a column means the same on every type.

/// What every source's context carries.
export interface BaseContext {
  spaces: Map<string, Space>;
}

const Muted = ({ children }: { children: string }) => (
  <span className="truncate text-muted-foreground">{children}</span>
);

/// A day or timestamp, short like the rest of the app (`Sep 24`).
function dayCell(value: string | null) {
  return value ? <Muted>{formatShortDate(value)}</Muted> : null;
}

export function keyField<T, C>(entityOf: (item: T) => Entity): ViewField<T, C> {
  return {
    id: "key",
    label: "ID",
    kind: "text",
    fit: true,
    value: (item) => entityOf(item).key,
    // `TSK-9` before `TSK-10`.
    sortValue: (item) => {
      const [prefix = "", n = "0"] = entityOf(item).key.split("-");
      return `${prefix}-${n.padStart(8, "0")}`;
    },
    cell: (item) => <EntityKey entityKey={entityOf(item).key} />,
  };
}

export function titleField<T, C>(entityOf: (item: T) => Entity): ViewField<T, C> {
  return {
    id: "title",
    label: "Title",
    kind: "text",
    value: (item) => displayTitle(entityOf(item)),
    cell: (item) => {
      const entity = entityOf(item);
      return (
        <span className="flex min-w-0 items-center gap-2">
          <EntityIcon entity={entity} size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{displayTitle(entity)}</span>
        </span>
      );
    },
  };
}

/// When the entity was made or last changed.
export function timestampField<T, C>(
  id: "created" | "updated",
  entityOf: (item: T) => Entity,
): ViewField<T, C> {
  const read = (item: T) =>
    id === "created" ? entityOf(item).createdAt : entityOf(item).updatedAt;
  return {
    id,
    label: id === "created" ? "Created" : "Updated",
    kind: "date",
    fit: true,
    value: read,
    cell: (item) => dayCell(read(item)),
  };
}

export function spaceField<T, C extends BaseContext>(
  entityOf: (item: T) => Entity,
): ViewField<T, C> {
  const spaceOf = (item: T, ctx: C) => ctx.spaces.get(entityOf(item).spaceId);
  return {
    id: "space",
    label: "Space",
    kind: "enum",
    fit: true,
    value: (item) => entityOf(item).spaceId,
    text: (item, ctx) => spaceOf(item, ctx)?.name ?? "",
    cell: (item, ctx) => {
      const space = spaceOf(item, ctx);
      return space ? <SpaceChip space={space} /> : null;
    },
  };
}

/// A plain day field, like a due date.
export function dayField<T, C>(
  id: string,
  label: string,
  read: (item: T) => string | null,
): ViewField<T, C> {
  return { id, label, kind: "date", fit: true, value: read, cell: (item) => dayCell(read(item)) };
}

export function numberField<T, C>(
  id: string,
  label: string,
  read: (item: T) => number | null,
  format: (n: number) => string = String,
): ViewField<T, C> {
  return {
    id,
    label,
    kind: "number",
    fit: true,
    value: read,
    text: (item) => {
      const n = read(item);
      return n === null ? "" : format(n);
    },
  };
}

/// A fixed set of statuses, drawn with the Linear style glyphs, sorted by their position.
export function statusField<T, C>(
  read: (item: T, ctx: C) => { status: TaskStatus; kind: StatusKind } | undefined,
  id: (item: T) => string,
): ViewField<T, C> {
  return {
    id: "status",
    label: "Status",
    kind: "enum",
    fit: true,
    value: (item) => id(item),
    text: (item, ctx) => read(item, ctx)?.status.name ?? "",
    sortValue: (item, ctx) => read(item, ctx)?.status.position ?? null,
    cell: (item, ctx) => {
      const found = read(item, ctx);
      if (!found) return null;
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <TaskStatusIcon status={found.status} kind={found.kind} />
          <span className="truncate">{found.status.name}</span>
        </span>
      );
    },
  };
}

/// A field read from a relationship, like an Assignment's Course through
/// `assignment-course`. `lookup` gives the entities an item is linked to.
export function relatedField<T, C>({
  id,
  label,
  relationship,
  lookup,
}: {
  id: string;
  label: string;
  relationship: string;
  lookup: (item: T, ctx: C) => Entity[];
}): ViewField<T, C> {
  return {
    id,
    label,
    kind: "entity",
    relationship,
    value: (item, ctx) => lookup(item, ctx).map((e) => e.id),
    text: (item, ctx) =>
      lookup(item, ctx)
        .map((e) => displayTitle(e))
        .join(", "),
    cell: (item, ctx) => {
      const related = lookup(item, ctx);
      if (related.length === 0) return null;
      return (
        <span className="flex min-w-0 items-center gap-1">
          {related.map((entity) => (
            <span
              key={entity.id}
              className="inline-flex h-6 max-w-40 min-w-0 shrink-0 items-center gap-1.5 rounded-md border border-foreground/10 px-1.5 text-xs text-muted-foreground"
            >
              <EntityIcon entity={entity} size={12} className="shrink-0" />
              <span className="truncate">{displayTitle(entity)}</span>
            </span>
          ))}
        </span>
      );
    },
  };
}

/// The Labels an item carries. `ids` are the stored ids, `labels` the ones the Space
/// still has, which the cell and text show.
export function labelsField<T, C>(
  ids: (item: T) => string[],
  labels: (item: T, ctx: C) => Label[],
): ViewField<T, C> {
  return {
    id: "labels",
    label: "Labels",
    kind: "entity",
    value: (item) => ids(item),
    text: (item, ctx) =>
      labels(item, ctx)
        .map((l) => l.name)
        .join(", "),
    cell: (item, ctx) => (
      <span className="flex min-w-0 items-center gap-1">
        {labels(item, ctx).map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
      </span>
    ),
  };
}
