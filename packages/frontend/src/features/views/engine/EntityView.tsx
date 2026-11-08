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
import type {
  TableDisplay,
  ViewCondition,
  ViewField,
  ViewScope,
  ViewSource,
} from "./types.ts";
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
  /// Also shows the items of other Spaces the scope reaches, each flagged with its Space.
  /// Links may cross Spaces, so a page's own items are not always in its Space.
  includeOtherSpaces?: boolean;
  /// Shown when nothing matches.
  empty?: ReactNode;
  /// Draws what is around the view, like a section's header with its count. `count` is
  /// `null` while loading, and `body` is the view itself.
  frame?: (view: { count: number | null; body: ReactNode }) => ReactNode;
}

interface SourceData<T, C> {
  items: T[];
  ctx: C;
  isPending: boolean;
}

type SourceViewProps<T, C> = EntityViewProps & { source: ViewSource<T, C> };

/// The title, followed by the Space of an item from another Space than `homeSpaceId`.
function flagOtherSpaces<T, C>(source: ViewSource<T, C>, homeSpaceId: string): ViewSource<T, C> {
  const space = source.fields.find((f) => f.id === "space");
  if (!space) return source;
  const fields = source.fields.map((field): ViewField<T, C> => {
    if (field.id !== "title") return field;
    return {
      ...field,
      cell: (item, ctx) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">
            {field.cell ? field.cell(item, ctx) : field.text?.(item, ctx)}
          </span>
          {source.entityOf(item).spaceId !== homeSpaceId && space.cell?.(item, ctx)}
        </span>
      ),
    };
  });
  return { ...source, fields };
}

function SourceView<T extends RowData, C>(props: SourceViewProps<T, C>) {
  return props.includeOtherSpaces && props.spaceId ? (
    <WithOtherSpaces {...props} homeSpaceId={props.spaceId} />
  ) : (
    <SourceBody {...props} data={props.source.useData(props.spaceId)} />
  );
}

/// A Space's items and the other Spaces' ones, read with the home Space's context, so its
/// labels and Courses still show.
function WithOtherSpaces<T extends RowData, C>(
  props: SourceViewProps<T, C> & { homeSpaceId: string },
) {
  const { source, homeSpaceId } = props;
  const home = source.useData(homeSpaceId);
  const all = source.useData(null);
  const data = useMemo(
    () => ({
      ctx: home.ctx,
      isPending: home.isPending || all.isPending,
      items: [
        ...home.items,
        ...all.items.filter((item) => source.entityOf(item).spaceId !== homeSpaceId),
      ],
    }),
    [source, homeSpaceId, home.ctx, home.isPending, home.items, all.isPending, all.items],
  );
  const flagged = useMemo(() => flagOtherSpaces(source, homeSpaceId), [source, homeSpaceId]);
  return <SourceBody {...props} source={flagged} data={data} />;
}

function SourceBody<T extends RowData, C>({
  source,
  data,
  spaceId,
  config,
  onConfigChange,
  scope,
  anchorId,
  empty,
  frame = ({ body }) => body,
}: SourceViewProps<T, C> & { data: SourceData<T, C> }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { items, ctx, isPending } = data;
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
  // A Space's own view has no use for a Space column, and a scoped one none for the field
  // the scope reads, which would only ever name the page the view sits in.
  const hiddenFields = [
    ...(spaceId ? ["space"] : []),
    ...(scoped
      ? source.fields.filter((f) => f.relationship === scope.relationship).map((f) => f.id)
      : []),
  ];
  const open = (item: T) => {
    const entity = source.entityOf(item);
    openEntity(entity.id, entity.spaceId);
  };
  const emptyState = empty ?? (
    <p className="py-6 text-center text-sm text-muted-foreground">
      No {source.itemLabel}s here yet.
    </p>
  );

  if (isPending || (scoped && edgesPending)) return frame({ count: null, body: null });
  if (config.display.layout === "table") {
    return frame({
      count: shown.length,
      body: (
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
      ),
    });
  }
  if (shown.length === 0) return frame({ count: 0, body: emptyState });
  const fields = shownFields(source, table, hiddenFields).filter((f) => f.field.id !== "title");
  const title = source.fields.find((f) => f.id === "title");
  return frame({
    count: shown.length,
    body: (
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
    ),
  });
}

/// Each registered type with its own item type, so no cast is needed to pick one.
const SOURCE_VIEWS = {
  task: (props) => <SourceView source={VIEW_SOURCES.task} {...props} />,
  assignment: (props) => <SourceView source={VIEW_SOURCES.assignment} {...props} />,
  exam: (props) => <SourceView source={VIEW_SOURCES.exam} {...props} />,
  note: (props) => <SourceView source={VIEW_SOURCES.note} {...props} />,
} satisfies { [K in ViewSourceType]: (props: EntityViewProps) => ReactNode };

export function EntityView({ source, ...props }: EntityViewProps & { source: ViewSourceType }) {
  return SOURCE_VIEWS[source](props);
}
