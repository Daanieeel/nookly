import { IconClock, IconSearch, IconTag } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState, Table as TanstackTable } from "@tanstack/react-table";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { DataTable, type DataTableGroup } from "#/components/data-table/data-table.tsx";
import { DataTableColumnHeader } from "#/components/data-table/data-table-column-header.tsx";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  matchesFilters,
} from "#/components/filter-menu.tsx";
import { LabelChip, LabelDot } from "#/components/label-chip.tsx";
import { QuickFilterBar } from "#/components/quick-filter-bar.tsx";
import {
  AddConditionButton,
  type ConditionFieldInfo,
  ConditionChips,
} from "#/features/views/engine/ConditionBar.tsx";
import type { ViewCondition } from "#/features/views/engine/types.ts";
import { Input } from "@nookly/ui/components/input";
import type { Label, PageSummary } from "#/lib/api/types.ts";
import { matchesKey } from "#/lib/entity-key.ts";
import { formatDateTime } from "#/lib/datetime.ts";
import { preferences } from "#/lib/preferences.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import type { DataTableFeatures } from "#/lib/table-features.ts";
import { prefetchBlocks } from "./blocks-query";
import { includesFolded } from "#/lib/text-search.ts";

/// Pieces shared by the Notes and Jots list tables.

const SORTABLE_COLUMNS = new Set(["key", "title", "edited"]);
export const DEFAULT_SORTING: SortingState = [{ id: "edited", desc: true }];
const MAX_ROW_LABELS = 3;

const DAY = 24 * 60 * 60 * 1000;

const EDITED_WINDOWS = new Map([
  ["today", DAY],
  ["week", 7 * DAY],
  ["month", 30 * DAY],
]);

/// Last edited as rolling windows from `now`, the same on Notes and Jots.
export const EDITED_FILTER_FIELD: FilterField = {
  id: "edited",
  label: "Last edited",
  icon: IconClock,
  options: [
    { value: "today", label: "Past day" },
    { value: "week", label: "Past 7 days" },
    { value: "month", label: "Past 30 days" },
  ],
};

/// The "Last edited" windows a page falls in: edited an hour ago is in all three.
export function editedWindows(summary: PageSummary, now: number): string[] {
  const age = now - Date.parse(summary.lastEditedAt);
  return [...EDITED_WINDOWS].flatMap(([value, window]) => (age < window ? [value] : []));
}

/// "is" keeps rows having any chosen value, "is not" keeps rows having none.
/// `valueOf` gives the value or values a row has under a field.
export function passesValueFilters<T>(
  row: T,
  filters: ActiveFilter[],
  valueOf: (row: T, fieldId: string) => string | string[],
): boolean {
  return matchesFilters(filters, (f) => {
    const value = valueOf(row, f.fieldId);
    const hit = f.values.some((v) => (Array.isArray(value) ? value.includes(v) : value === v));
    return f.operator === "is" ? hit : !hit;
  });
}

/// Stored as `"<column>:<asc|desc>"`, e.g. `"edited:desc"`.
export function readStoredSorting(storageKey: string): SortingState {
  const [id, dir] = (preferences.get(storageKey) ?? "").split(":");
  if (SORTABLE_COLUMNS.has(id) && (dir === "asc" || dir === "desc")) {
    return [{ id, desc: dir === "desc" }];
  }
  return DEFAULT_SORTING;
}

export function writeStoredSorting(storageKey: string, sorting: SortingState) {
  const [first] = sorting;
  if (first) {
    preferences.set(storageKey, `${first.id}:${first.desc ? "desc" : "asc"}`);
  } else {
    preferences.remove(storageKey);
  }
}

/// The text filter: title, preview or key. `needle` is the trimmed, lowercased query.
export function matchesQuery(
  row: { title: string; preview: string; summary: PageSummary },
  needle: string,
  query: string,
): boolean {
  return (
    !needle ||
    includesFolded(row.title, needle) ||
    includesFolded(row.preview, needle) ||
    matchesKey(row.summary.entity.key, query)
  );
}

export function titleColumn<T extends { title: string }>(
  TitleCell: (props: { row: T }) => React.ReactNode,
): ColumnDef<DataTableFeatures, T> {
  return {
    id: "title",
    accessorFn: (row) => row.title,
    header: ({ column }) => <DataTableColumnHeader column={column} label="Title" />,
    cell: ({ row }) => <TitleCell row={row.original} />,
    sortFn: (a, b) =>
      a.original.title.localeCompare(b.original.title, undefined, { sensitivity: "base" }),
    meta: { label: "Title", width: "third" },
  };
}

export function labelsColumn<T extends { labels: Label[] }>(): ColumnDef<DataTableFeatures, T> {
  return {
    id: "labels",
    header: "Labels",
    cell: ({ row }) => <LabelsCell labels={row.original.labels} />,
    enableSorting: false,
    meta: { label: "Labels", width: "fit", hideBelow: "lg" },
  };
}

export function editedColumn<T extends { summary: PageSummary }>(): ColumnDef<
  DataTableFeatures,
  T
> {
  return {
    id: "edited",
    accessorFn: (row) => row.summary.lastEditedAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Last edited" className="ml-auto" />
    ),
    cell: ({ row }) => (
      <time
        dateTime={row.original.summary.lastEditedAt}
        title={formatDateTime(row.original.summary.lastEditedAt)}
        className="block text-right text-xs text-muted-foreground tabular-nums"
      >
        {formatEditedAt(row.original.summary.lastEditedAt)}
      </time>
    ),
    sortFn: (a, b) =>
      a.original.summary.lastEditedAt.localeCompare(b.original.summary.lastEditedAt),
    sortDescFirst: true,
    meta: { label: "Last edited", width: "fit", align: "end" },
  };
}

function LabelsCell({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, MAX_ROW_LABELS);
  const extra = labels.length - shown.length;
  return (
    <div className="flex items-center gap-1">
      {shown.map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {extra > 0 && <span className="text-xs text-muted-foreground">+{extra}</span>}
    </div>
  );
}

function ListSearchInput({
  query,
  onQueryChange,
  placeholder,
  ariaLabel,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative w-64 max-w-full">
      <IconSearch
        size={14}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onQueryChange("")}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-8"
      />
    </div>
  );
}

/// The Notes and Jots table: a row opens its page, focusing it warms the page's blocks,
/// and it carries the page's context menu.
export function PageSummaryTable<T extends { summary: PageSummary }>({
  table,
  spaceId,
  groups,
  scrollX,
}: {
  table: TanstackTable<DataTableFeatures, T>;
  spaceId: string;
  groups?: DataTableGroup<T>[];
  /// Scrolls sideways when the columns cannot fit, which is the default (see `DataTable`).
  scrollX?: boolean;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  return (
    <DataTable
      table={table}
      groups={groups}
      scrollX={scrollX}
      onRowClick={(row) => openEntity(row.summary.entity.id, spaceId)}
      onRowFocus={(row) => prefetchBlocks(queryClient, row.summary.entity.id)}
      rowContextTarget={(row) => entityTarget(row.summary.entity)}
    />
  );
}

/// The Labels filter, offered only when some row carries a Label of the Space.
export function labelFilterField(
  spaceLabels: Label[],
  rows: { labels: Label[] }[],
): FilterField | null {
  const usedLabels = spaceLabels.filter((l) => rows.some((r) => r.labels.includes(l)));
  if (usedLabels.length === 0) return null;
  return {
    id: "labels",
    label: "Labels",
    icon: IconTag,
    options: usedLabels.map((l) => ({
      value: l.id,
      label: l.name,
      icon: <LabelDot label={l} />,
    })),
  };
}

/// The search field, the filter button with its quick filters, and the active filter chips
/// above a list.
export function ListFilterToolbar({
  query,
  onQueryChange,
  placeholder,
  ariaLabel,
  fields,
  filters,
  onFiltersChange,
  quick,
  conditionBar,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  ariaLabel: string;
  fields: FilterField[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  quick: { favorites: string[]; toggle: (fieldId: string) => void };
  /// The richer filters (contains, date ranges, empty), which a saved View offers.
  conditionBar?: {
    fields: ConditionFieldInfo[];
    conditions: ViewCondition[];
    onChange: (conditions: ViewCondition[]) => void;
  };
}) {
  const filterMenuProps = {
    fields,
    filters,
    onFiltersChange,
    quickFilters: { favorites: quick.favorites, onToggle: quick.toggle },
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ListSearchInput
          query={query}
          onQueryChange={onQueryChange}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
        />
        <div className="ml-auto flex items-center gap-1">
          <FilterMenu
            {...filterMenuProps}
            part="button"
            beforeButton={
              <QuickFilterBar
                fields={fields}
                filters={filters}
                onFiltersChange={onFiltersChange}
                favorites={quick.favorites}
                onRemove={quick.toggle}
              />
            }
          />
          {conditionBar && (
            <AddConditionButton
              fields={conditionBar.fields}
              onAdd={(condition) => conditionBar.onChange([...conditionBar.conditions, condition])}
            />
          )}
        </div>
      </div>
      <FilterMenu {...filterMenuProps} part="chips" />
      {conditionBar && <ConditionChips {...conditionBar} />}
    </>
  );
}
