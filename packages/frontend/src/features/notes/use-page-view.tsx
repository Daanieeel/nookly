import { functionalUpdate, type SortingState, type Updater } from "@tanstack/react-table";
import { useState } from "react";
import { entityTarget } from "#/components/context-menu/registry.ts";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { EditableViewTitle } from "#/features/views/EditableViewTitle.tsx";
import { ViewSaveBar } from "#/features/views/ViewActions.tsx";
import { ViewIconButton } from "#/features/views/ViewIconButton.tsx";
import { passesConditions } from "#/features/views/engine/conditions.ts";
import type { PageContext } from "#/features/views/engine/sources/pages.tsx";
import { DEFAULT_TABLE, normalizeTableDisplay } from "#/features/views/engine/table-display.ts";
import type { TableDisplay, ViewField } from "#/features/views/engine/types.ts";
import { useViewPage } from "#/features/views/use-view-page.ts";
import type { SavedView } from "#/lib/api/views.ts";
import { DEFAULT_SORTING, readStoredSorting, writeStoredSorting } from "./list-table-shared";

/// What a saved View of the Notes or Jots page keeps besides its filters: the table's
/// sort, and the columns the view engine shows it with elsewhere.
interface PageDisplay {
  table: TableDisplay;
}

const readDisplay = (): PageDisplay => ({ table: DEFAULT_TABLE });
const normalizeDisplay = (stored: Partial<PageDisplay>): PageDisplay => ({
  table: normalizeTableDisplay(stored.table),
});
const remember = () => {};

const toSorting = (table: TableDisplay): SortingState =>
  table.sort.length > 0
    ? table.sort.map((rule) => ({ id: rule.field, desc: rule.direction === "desc" }))
    : DEFAULT_SORTING;

/// The filters, conditions and sort of the Notes or Jots page, on its own or opened on a
/// saved View. Off a View the page works as it always has: its filters last for the visit
/// (starting from `initialFilters`) and its sort is kept per device under `sortKey`. On a
/// View all three start as saved, and edits are a draft until saved into the View.
export function usePageView<R>({
  spaceId,
  module,
  viewId,
  sortKey,
  initialFilters,
  fields,
  ctx,
}: {
  spaceId: string;
  module: "notes" | "jots";
  viewId: string | undefined;
  sortKey: string;
  initialFilters: () => ActiveFilter[];
  /// What conditions compare: the view engine's fields of the page's rows.
  fields: ViewField<R, PageContext>[];
  ctx: PageContext;
}) {
  // A View brings its own filters, so a link's requested ones are left for the plain page.
  const [defaultFilters] = useState(() => (viewId ? [] : initialFilters()));
  const page = useViewPage<PageDisplay>({
    spaceId,
    module,
    viewId,
    readDisplay,
    normalizeDisplay,
    remember,
    defaultFilters,
  });
  const [plainSorting, setPlainSorting] = useState<SortingState>(() => readStoredSorting(sortKey));
  const onView = !!viewId;
  const sorting = onView ? toSorting(page.display.table) : plainSorting;

  const onSortingChange = (updater: Updater<SortingState>) => {
    const next = functionalUpdate(updater, sorting);
    if (onView) {
      const sort = next.map((s) => ({
        field: s.id,
        direction: s.desc ? ("desc" as const) : ("asc" as const),
      }));
      page.setDisplay({ ...page.display, table: { ...page.display.table, sort } });
    } else {
      setPlainSorting(next);
      writeStoredSorting(sortKey, next);
    }
  };

  // Conditions come with a View; the plain page has none.
  const conditionFields = fields.filter((f) => f.id !== "space");
  const passes = (row: R) => passesConditions(row, page.conditions, conditionFields, ctx);

  return {
    view: page.view,
    filters: page.filters,
    setFilters: page.setFilters,
    sorting,
    onSortingChange,
    passes,
    conditionBar: page.view
      ? { fields: conditionFields, conditions: page.conditions, onChange: page.setConditions }
      : undefined,
    saveBar: page.view && (
      <ViewSaveBar
        view={page.view}
        dirty={page.dirty}
        save={page.save}
        onDiscard={page.discard}
        spaceId={spaceId}
        module={module}
        filters={page.filters}
        conditions={page.conditions}
        display={page.display}
      />
    ),
  };
}

/// The page's title, or on a saved View its icon and name, edited in place.
export function PageViewTitle({
  view,
  title,
  count,
}: {
  view: SavedView | undefined;
  title: string;
  count: number;
}) {
  return (
    <h1
      className="mr-auto flex items-center gap-2 text-lg font-semibold"
      {...(view && entityTarget(view.entity))}
    >
      {view ? (
        <>
          <ViewIconButton entity={view.entity} />
          <EditableViewTitle entity={view.entity} />
        </>
      ) : (
        title
      )}
      <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
    </h1>
  );
}
