import { useQuery } from "@tanstack/react-query";
import type { RowData } from "@tanstack/react-table";
import { type ReactNode, useMemo, useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { listRelationships } from "#/lib/api/relationships.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { parseViewConfig } from "../view-config.ts";
import { runView } from "./evaluate.ts";
import { VIEW_SOURCES, type ViewSourceType } from "./sources.ts";
import { DEFAULT_TABLE, normalizeTableDisplay } from "./table-display.ts";
import type { TableDisplay, ViewCondition, ViewScope, ViewSource } from "./types.ts";
import { ViewTable, shownFields } from "./ViewTable.tsx";

/// One view of any registered entity type, ready to sit inside a page: a Course's
/// Assignments sorted by due date, its Exams as a table. It loads its own items, keeps
/// those linked to `anchorId` through `scope`, and lays them out as a list or a table.
/// Module pages with a board (Tasks, Assignments) run the same engine with their own
/// layouts instead.

type EntityViewLayout = "list" | "table";

interface EntityViewDisplay {
  layout: EntityViewLayout;
  table: TableDisplay;
}

export interface EntityViewConfig {
  filters: ActiveFilter[];
  conditions: ViewCondition[];
  display: EntityViewDisplay;
}

export const DEFAULT_ENTITY_VIEW: EntityViewConfig = {
  filters: [],
  conditions: [],
  display: { layout: "table", table: DEFAULT_TABLE },
};

function normalizeEntityViewDisplay(stored: Partial<EntityViewDisplay>): EntityViewDisplay {
  return {
    layout: stored.layout === "list" ? "list" : "table",
    table: normalizeTableDisplay(stored.table),
  };
}

/// A stored View config (a saved View's JSON) as an `EntityView` config. Unreadable parts
/// fall back to the defaults, like on a module page.
export function parseEntityViewConfig(raw: string): EntityViewConfig {
  return parseViewConfig(raw, normalizeEntityViewDisplay);
}

interface EntityViewProps {
  /// The Space whose items show, or `null` for every Space's.
  spaceId: string | null;
  config: EntityViewConfig;
  /// Saves a sort or column change. Without it, changes last while the view is shown.
  onConfigChange?: (config: EntityViewConfig) => void;
  scope?: ViewScope | null;
  /// The page the view sits in, which `scope` is read against.
  anchorId?: string;
  /// Shown when nothing matches.
  empty?: ReactNode;
}

function SourceView<T extends RowData, C>({
  source,
  spaceId,
  config,
  onConfigChange,
  scope,
  anchorId,
  empty,
}: EntityViewProps & { source: ViewSource<T, C> }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { items, ctx, isPending } = source.useData(spaceId);
  const scoped = !!scope && !!anchorId;
  const { data: edges = [], isPending: edgesPending } = useQuery({
    queryKey: qk.relationships.of(anchorId),
    queryFn: () => listRelationships(anchorId ?? ""),
    enabled: scoped,
  });
  const [localTable, setLocalTable] = useState<TableDisplay | null>(null);
  const table = onConfigChange ? config.display.table : (localTable ?? config.display.table);
  const setTable = (next: TableDisplay) =>
    onConfigChange
      ? onConfigChange({ ...config, display: { ...config.display, table: next } })
      : setLocalTable(next);

  const shown = useMemo(
    () =>
      runView(source, items, ctx, {
        filters: config.filters,
        conditions: config.conditions,
        // The table sorts on its own, so its header always shows the sort it runs.
        sort: [],
        scope,
        anchorId,
        edges,
      }),
    [source, items, ctx, config.filters, config.conditions, scope, anchorId, edges],
  );
  // A Space's own view has no use for a Space column.
  const hiddenFields = spaceId ? ["space"] : [];
  const open = (item: T) => {
    const entity = source.entityOf(item);
    openEntity(entity.id, entity.spaceId);
  };
  const emptyState = empty ?? (
    <p className="py-6 text-center text-sm text-muted-foreground">
      No {source.itemLabel}s here yet.
    </p>
  );

  if (isPending || (scoped && edgesPending)) return null;
  if (config.display.layout === "table") {
    return (
      <ViewTable
        source={source}
        items={shown}
        ctx={ctx}
        table={table}
        onTableChange={setTable}
        onOpen={open}
        rowContextTarget={(item) => entityTarget(source.entityOf(item))}
        hiddenFields={hiddenFields}
        empty={emptyState}
      />
    );
  }
  if (shown.length === 0) return <>{emptyState}</>;
  const fields = shownFields(source, table, hiddenFields).filter((f) => f.field.id !== "title");
  const title = source.fields.find((f) => f.id === "title");
  return (
    <ul className="flex flex-col">
      {shown.map((item) => {
        const entity = source.entityOf(item);
        return (
          <li key={entity.id}>
            <button
              type="button"
              onClick={() => open(item)}
              {...entityTarget(entity)}
              className="flex h-9 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1 truncate">{title?.cell?.(item, ctx)}</span>
              {fields.map(({ field }) => (
                <span key={field.id} className="flex shrink-0 items-center text-xs">
                  {field.cell ? field.cell(item, ctx) : field.text?.(item, ctx)}
                </span>
              ))}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/// Each registered type with its own item type, so no cast is needed to pick one.
const SOURCE_VIEWS = {
  task: (props) => <SourceView source={VIEW_SOURCES.task} {...props} />,
  assignment: (props) => <SourceView source={VIEW_SOURCES.assignment} {...props} />,
  exam: (props) => <SourceView source={VIEW_SOURCES.exam} {...props} />,
  note: (props) => <SourceView source={VIEW_SOURCES.note} {...props} />,
  jot: (props) => <SourceView source={VIEW_SOURCES.jot} {...props} />,
} satisfies { [K in ViewSourceType]: (props: EntityViewProps) => ReactNode };

export function EntityView({ source, ...props }: EntityViewProps & { source: ViewSourceType }) {
  return SOURCE_VIEWS[source](props);
}
