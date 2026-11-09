import type { ReactNode } from "react";
import type { Entity } from "#/lib/api/types.ts";
import { VIEW_SOURCES, type ViewSourceType } from "./sources.ts";
import type { ViewSource } from "./types.ts";

/// The few details a compact row shows after an item's title, like a related Task's status
/// and due date in the right sidebar, read through the item's view source so they say the
/// same as its columns elsewhere. Types without a status or a date show nothing.

/// The field a row shows as the item's date: its due date, or an Exam's day.
const DATE_FIELDS = ["due", "date"];

function SourceDetails<T, C>({ source, entity }: { source: ViewSource<T, C>; entity: Entity }) {
  const { items, ctx } = source.useData(entity.spaceId);
  const item = items.find((i) => source.entityOf(i).id === entity.id);
  if (!item) return null;
  const status = source.fields.find((f) => f.id === "status");
  const name = status?.text?.(item, ctx);
  const date = source.fields.find((f) => DATE_FIELDS.includes(f.id));
  return (
    <>
      {date?.cell && (
        <span className="flex shrink-0 text-xs tabular-nums">{date.cell(item, ctx)}</span>
      )}
      {status && name && (
        // Only the glyph: the sidebar has no room for the name, which the label still says.
        <span
          role="img"
          aria-label={`Status: ${name}`}
          className="flex shrink-0 [&_.truncate]:hidden"
        >
          {status.cell?.(item, ctx)}
        </span>
      )}
    </>
  );
}

const DETAILS = {
  task: (entity) => <SourceDetails source={VIEW_SOURCES.task} entity={entity} />,
  assignment: (entity) => <SourceDetails source={VIEW_SOURCES.assignment} entity={entity} />,
  exam: (entity) => <SourceDetails source={VIEW_SOURCES.exam} entity={entity} />,
  // A Note or Jot has neither a status nor a date worth a row's room.
  note: () => null,
  jot: () => null,
} satisfies { [K in ViewSourceType]: (entity: Entity) => ReactNode };

const isSourceType = (type: string): type is ViewSourceType => type in DETAILS;

export function EntityDetails({ entity }: { entity: Entity }) {
  return isSourceType(entity.type) ? DETAILS[entity.type](entity) : null;
}
