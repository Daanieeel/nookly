# How To: Data Tables

> **Origin:** this guide was written while building the data tables for a separate admin panel project, not Nookly. File paths such as `src/routes/_layout/users/index.tsx`, the `/admin` base path, and the Users, Pages, Groups, Locales, and Translations tables all refer to that project. Nookly does not ship this table stack yet. Treat the steps and gotchas as reusable, and adapt the paths, routing, and backend contract to Nookly when you apply them.

This document collects everything learned building those data tables, including the non-obvious bugs, so another coding assistant can reproduce the same setup in a different React + Vite + Tailwind v4 + shadcn/ui project.

It assumes React 19, Vite, Tailwind v4, `@tanstack/react-query`, and a shadcn/ui based component library already in the project (`components/ui/*`). Server mode tables also assume `@tanstack/react-router` for routing.

## What this gives you

A single `<DataTable>` component + a family of toolbar pieces (sort popover, command-menu filters, column visibility, pagination, row-selection action bar) that every table in the app reuses. Two modes:

- **Server mode** (`users`, `pages` in this app): pagination/sorting/filtering happen on the backend. Table state (page, sort, filters) lives in the URL via `nuqs`, so it's shareable/bookmarkable and survives refresh.
- **Client mode** (`groups`, `locales`, `translations/$namespace` in this app): the full dataset is already in memory (small, bounded lists); TanStack Table does pagination/sorting/filtering locally. No URL state, no server round-trips.

Both modes render through the exact same `<DataTable>` component — only how you construct the `table` object differs.

## 1. Install the base components (diceui / shadcn registry)

The table primitives come from the **diceui** shadcn registry (`https://diceui.com`), not hand-written. Register it and install:

```jsonc
// components.json
{
  // ...
  "registries": {
    "@diceui": "https://diceui.com/r/{name}.json",
  },
}
```

```bash
bunx shadcn@latest add "@diceui/data-table" "@diceui/data-table-sort-list" "@diceui/data-table-filter-menu" "@diceui/action-bar"
```

If the CLI asks to overwrite existing `components/ui/*` files you've already customized (badge, button, select, etc.), **decline** — pipe `n` or run non-interactively:

```bash
yes n | bunx shadcn@latest add "@diceui/data-table" "@diceui/data-table-sort-list" "@diceui/data-table-filter-menu" "@diceui/action-bar"
```

This installs (paths relative to `src/`):

```
components/data-table/data-table.tsx
components/data-table/data-table-column-header.tsx
components/data-table/data-table-pagination.tsx
components/data-table/data-table-view-options.tsx
components/data-table/data-table-toolbar.tsx            (chip-list toolbar — see note below)
components/data-table/data-table-advanced-toolbar.tsx    (command-menu toolbar)
components/data-table/data-table-faceted-filter.tsx      (chip-list only)
components/data-table/data-table-slider-filter.tsx       (chip-list only)
components/data-table/data-table-date-filter.tsx         (chip-list only)
components/data-table/data-table-range-filter.tsx
components/data-table/data-table-skeleton.tsx
components/data-table/data-table-sort-list.tsx
components/data-table/data-table-filter-menu.tsx
components/ui/action-bar.tsx
components/ui/sortable.tsx
components/ui/slider.tsx
components/ui/calendar.tsx
hooks/use-data-table.ts
hooks/use-callback-ref.ts, use-debounced-callback.ts, use-as-ref.ts, use-isomorphic-layout-effect.ts
lib/data-table.ts
lib/parsers.ts
lib/format.ts
lib/id.ts
config/data-table.ts
types/data-table.ts
```

**Decision point — two filter UIs are installed, pick one.** diceui ships both a classic per-column chip toolbar (`data-table-toolbar.tsx` + `data-table-faceted-filter.tsx`/`-slider-filter.tsx`/`-date-filter.tsx`, used with `<DataTableToolbar>`) and a command-palette filter (`data-table-filter-menu.tsx`, used with `<DataTableAdvancedToolbar>` — this is the [tablecn.com](https://tablecn.com) look: a `⌘⇧F` command menu instead of a filter-per-column row). **If you only want the command-menu style** (recommended — cleaner, scales to many columns), delete the four chip-only files (`data-table-toolbar.tsx`, `data-table-faceted-filter.tsx`, `data-table-slider-filter.tsx`, `data-table-date-filter.tsx`) after confirming nothing else imports them. Keep `data-table-range-filter.tsx` — `data-table-filter-menu.tsx` uses it internally for numeric/date range operators.

## 2. Fix the vendor's known broken imports

The registry's own docs page (fetched as part of this install) admits: _"The shadcn CLI doesn't handle custom component paths properly — you'll need to update these imports manually."_ Concretely, every file below imports from `@/components/data-table/data-table` for things that actually live in `@/lib/data-table`, `@/config/data-table`, or `@/types/data-table`. Left unfixed, this is a **self-referencing import** in `data-table.tsx` that crashes the Vite build (`"getColumnPinningStyle" is not exported by ... imported by ... data-table.tsx`).

Fix every occurrence of `from "@/components/data-table/data-table"` per this mapping:

| Symbol                                                                                                                       | Correct source        |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `getColumnPinningStyle`, `getFilterOperators`, `getDefaultFilterOperator`, `getValidFilters`                                 | `@/lib/data-table`    |
| `dataTableConfig`, `DataTableConfig` (type)                                                                                  | `@/config/data-table` |
| `ExtendedColumnFilter`, `ExtendedColumnSort`, `FilterOperator`, `FilterVariant`, `QueryKeys`, `Option`, `DataTableRowAction` | `@/types/data-table`  |

Files that need this (grep `from "@/components/data-table/data-table"` and fix every hit that isn't literally importing the `DataTable` component itself):
`components/data-table/data-table.tsx`, `data-table-filter-menu.tsx`, `data-table-range-filter.tsx`, `data-table-sort-list.tsx`, `hooks/use-data-table.ts`, `lib/data-table.ts`, `lib/parsers.ts`, `types/data-table.ts`.

## 3. Fix missing/wrong dependencies

The shadcn CLI resolves `@tanstack/react-table` to whatever `latest` currently is on npm. As of this writing that's a **v9 prerelease line** which renamed `useReactTable` and breaks the vendored code (which is written for the stable v8 API: `useReactTable`, `getCoreRowModel()`, `flexRender`, etc.). **Pin it:**

```json
"@tanstack/react-table": "^8.21.3"
```

Then `bun install`. If the build still fails on missing modules, install these too (the registry's own dependency declarations don't chain fully through the CLI):

```bash
bun add @dnd-kit/modifiers zod
```

(`@dnd-kit/modifiers` is needed by `components/ui/sortable.tsx` for the drag-and-drop sort-list reordering; `zod` is needed by `lib/parsers.ts` for filter/sort URL-state validation.)

## 4. Icon library — swap if your project doesn't use lucide-react

The vendored files import icons from `lucide-react`. If your project standardizes on a different icon set (this app uses `@tabler/icons-react`), swap them — check first whether your shadcn CLI's icon-library auto-transform already did this for you (`components.json`'s `iconLibrary` field controls it, but it did **not** fire for these files here, so verify with `grep -rl "lucide-react" src/components/data-table`). Mapping used in this project (tabler equivalents — adjust for your icon set):

| lucide-react                                 | tabler                                               | Used for                                 |
| -------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `ChevronDown`/`ChevronUp`                    | `IconChevronDown`/`IconChevronUp`                    | column header sort direction             |
| `ChevronsUpDown`                             | `IconSelector`                                       | unsorted column header                   |
| `EyeOff`                                     | `IconEyeOff`                                         | hide-column menu item                    |
| `X`                                          | `IconX`                                              | remove chip/filter                       |
| `CalendarIcon`                               | `IconCalendar`                                       | date filter                              |
| `XCircle`                                    | `IconCircleX`                                        | clear                                    |
| `Check`                                      | `IconCheck`                                          | selected option                          |
| `PlusCircle`                                 | `IconCirclePlus`                                     | add filter                               |
| `BadgeCheck`                                 | `IconRosetteDiscountCheck`                           | closest visual match — a badge/checkmark |
| `ListFilter`                                 | `IconFilter`                                         | filter trigger                           |
| `Text`                                       | `IconLetterCase`                                     | generic text-field icon                  |
| `ChevronLeft`/`Right`/`ChevronsLeft`/`Right` | `IconChevronLeft`/`Right`/`IconChevronsLeft`/`Right` | pagination                               |
| `ArrowDownUp`                                | `IconArrowsSort`                                     | sort trigger                             |
| `GripVertical`                               | `IconGripVertical`                                   | drag handle                              |
| `Trash2`                                     | `IconTrash`                                          | remove sort/filter                       |
| `Settings2`                                  | `IconAdjustmentsHorizontal`                          | view-options trigger                     |

Also delete any now-dead lucide-only files if you dropped the chip-toolbar variant (step 1).

## 5. Wire up `nuqs` for URL-persisted table state (server mode only)

`nuqs` (`bun add nuqs` — the registry install already added it) is what lets sort/filter/page state live in the URL. `useDataTable` (the hook installed at `hooks/use-data-table.ts`) is **hardwired to this** — it always sets `manualPagination: true, manualSorting: true, manualFiltering: true` and reads/writes `page`/`perPage`/`sort`/`filters` through `nuqs`. There is no "auto" mode switch in this hook — for client-mode tables, don't use it at all (see §8).

### 5a. Pick the right adapter — do NOT default to the router-specific one

nuqs needs an adapter matching your router so it knows how to read/write the URL. It's tempting to reach for a router-specific adapter (e.g. `nuqs/adapters/tanstack-router`, `nuqs/adapters/next/app`) assuming "more specific = more correct." **In this project the TanStack Router adapter was actively broken**: its `navigate()` call is hardcoded `from: "/"`, which conflicts with an app mounted under a non-root base path (`/admin` here) — every URL write got silently reverted a render or two after landing. Symptom: clicking "Add sort" visibly worked for one frame then reverted to "No sorting applied", and the sort field never seemed to persist. This is exactly what the library's own docs mean by "TanStack Router support is experimental."

**Use the generic adapter unless you've specifically verified the router-specific one works:**

```tsx
// main.tsx (or your app root, NOT inside the router tree)
import { NuqsAdapter } from "nuqs/adapters/react";

createRoot(rootElement).render(
  <StrictMode>
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </NuqsAdapter>
  </StrictMode>,
);
```

The generic `nuqs/adapters/react` adapter doesn't need router context, so it wraps everything, including `QueryClientProvider`/`RouterProvider`. (A router-context-dependent adapter, if you do need one, must instead go _inside_ the router tree — e.g. in TanStack Router's case, inside the root route's component wrapping `<Outlet/>`, not around `<RouterProvider>` — because it calls `useRouter()`/`useRouterState()` internally. The official docs' example for such adapters is written for Next.js's App Router, where wrapping the whole app works because Next's router doesn't need explicit context — don't copy that pattern verbatim for a different router.)

### 5b. Vite dev-server gotcha: "Multiple adapter contexts detected"

If you see this nuqs warning in the console — followed by `Invalid hook call` / `Cannot read properties of null (reading 'useId')` crashing the table — it's Vite's dependency pre-bundler splitting `nuqs` (bare import) and `nuqs/adapters/...` (subpath import) into two separate optimized chunks, each with its own copy of nuqs's internal React context. Fix in `vite.config.ts`:

```ts
export default defineConfig({
  // ...
  optimizeDeps: {
    exclude: ["nuqs"],
  },
});
```

After changing this, you must clear Vite's cache and restart (`rm -rf node_modules/.vite`) — a hot-reload won't pick it up.

### 5c. Critical: memoize every parser/default you pass to `useQueryState`

This is the single most important gotcha in this whole setup, and it's present **in the vendor's own `use-data-table.ts`**, not just custom code layered on top.

`nuqs`'s `useQueryState(key, parser)` expects the `parser` object to be referentially stable across renders. If you build it inline — e.g. `getSortingStateParser(columnIds).withOptions(opts).withDefault(initialState?.sorting ?? [])` — directly inside a hook body, you create a **new parser instance every single render** (the `?? []` alone allocates a new array reference each time). This makes nuqs treat every render as a new/different subscription. The observable symptom: a value you just wrote via the setter appears to apply for a couple of renders, then silently reverts to the default — with no further call to your `onChange` handler. It looks exactly like a race condition or an adapter bug, but it isn't: it's an unmemoized default.

Fix — memoize with `useMemo` (empty deps, since this is meant to be an _initial_ value that shouldn't be re-derived):

```ts
// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally an init-only value
const defaultSorting = React.useMemo(() => initialState?.sorting ?? [], []);

const [sorting, setSorting] = useQueryState(
  sortKey,
  getSortingStateParser<TData>(columnIds)
    .withOptions(queryStateOptions)
    .withDefault(defaultSorting),
);
```

Apply this fix inside the vendored `hooks/use-data-table.ts` itself (its `sorting` state is the one affected there), **and** in any custom hook you write that independently reads the same nuqs keys (see §7 below) — every `.withDefault([])` / `.withDefault({})` call needs a stable reference behind it.

## 6. Table anatomy

```
<DataTable table={table} onRowClick={...} actionBar={<SelectionActionBar table={table} />}>
  <DataTableAdvancedToolbar table={table}>
    <DataTableFilterMenu table={table} />
    <DataTableSortList table={table} />
  </DataTableAdvancedToolbar>
</DataTable>
```

- `<DataTable>` renders the actual `<table>`, its header/body from `table.getHeaderGroups()`/`getRowModel()`, and `<DataTablePagination>` at the bottom. It's dumb — it just needs a `Table<TData>` instance.
- `<DataTableAdvancedToolbar>` is the row above the table: your custom children (filter menu, sort list) on the left, `<DataTableViewOptions>` (column visibility) auto-injected on the right.
- `<DataTableFilterMenu>` and `<DataTableSortList>` are self-contained popovers — you don't wire their internals, just pass `table`.
- `onRowClick` is **not** part of the stock component — it was added in this project (a small patch to `data-table.tsx`) to support "click a row to open a detail dialog" (used on the Users table). If you need this, add it yourself:

  ```tsx
  interface DataTableProps<TData> extends React.ComponentProps<"div"> {
    table: TanstackTable<TData>;
    actionBar?: React.ReactNode;
    onRowClick?: (row: TData) => void;
  }
  // in the row map:
  <TableRow
    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
    className={onRowClick ? "cursor-pointer" : undefined}
    ...
  >
  ```

  Remember to `e.stopPropagation()` on any interactive element inside a clickable row (action buttons, dropdown triggers, checkboxes) or the row click will fire too.

## 7. Server-mode table — full recipe

This is the pattern used by `routes/_layout/pages/index.tsx` and `routes/_layout/users/index.tsx`.

### 7a. Backend contract

Your API needs a paginated list endpoint that accepts:

```ts
interface ListParams {
  page: number; // 1-indexed
  pageSize: number;
  sort?: { id: string; desc: boolean }[]; // multi-column
  // + whatever per-table filter fields you support, e.g.:
  status?: "draft" | "published";
  locale?: string;
}
interface PaginatedResult<T> {
  items: T[];
  total: number;
}
```

Serialize `sort` as JSON in the query string (`?sort=[{"id":"slug","desc":false}]`); parse it server-side with a small helper that validates shape and drops anything malformed rather than erroring. Don't try to match nuqs's own URL-encoding format to your API's query string — they're independent concerns. Your frontend API client reads the _parsed_ JS values from the table/hooks and re-serializes them however your backend expects; it does not need to inspect the raw URL.

### 7b. The `useTableQueryState` bridge hook

`useDataTable` manages `page`/`perPage`/`sort`/`filters` internally via nuqs, but it only exposes a `table` object back to you — not the raw values. Your `useQuery` call needs those raw values _before_ you can construct `table` (chicken-and-egg: the query needs `page`/`sort`/filters to fetch; the table needs the fetched `data` + a `pageCount`). Solve this by reading the **same nuqs keys, with the same parsers**, in a second hook at the top of your page component:

```ts
// hooks/use-table-query-state.ts
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";
import { getFiltersStateParser, getSortingStateParser } from "@/lib/parsers";

export function useTableQueryState<TData>(opts: {
  filterableColumnIds: string[];
  defaultPageSize?: number;
}) {
  const { filterableColumnIds, defaultPageSize = 10 } = opts;
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState("perPage", parseAsInteger.withDefault(defaultPageSize));

  // Stable across renders - see the memoization gotcha in §5c.
  const sortingParser = useMemo(() => getSortingStateParser<TData>().withDefault([]), []);
  const [sorting] = useQueryState("sort", sortingParser);

  // biome-ignore lint/correctness/useExhaustiveDependencies: filterableColumnIds is a stable module-level constant per table
  const filtersParser = useMemo(
    () => getFiltersStateParser<TData>(filterableColumnIds).withDefault([]),
    [],
  );
  const [filters] = useQueryState("filters", filtersParser);

  return { page, perPage, sorting, filters };
}

export function filterValue(filters: { id: string; value: string | string[] }[], id: string) {
  const match = filters.find((f) => f.id === id);
  if (!match) return undefined;
  return Array.isArray(match.value) ? match.value[0] : match.value;
}
```

The key names (`"page"`, `"perPage"`, `"sort"`, `"filters"`) must match `use-data-table.ts`'s defaults exactly (`PAGE_KEY`/`PER_PAGE_KEY`/`SORT_KEY`/`FILTERS_KEY` constants in that file) unless you pass custom `queryKeys` to `useDataTable` — in which case pass the same custom keys here too. Because nuqs subscriptions to the same URL key stay in sync across components, this second hook and `useDataTable`'s internal one will always agree, with no prop drilling.

### 7c. The page component

```tsx
const FILTERABLE_COLUMN_IDS = ["status", "locale"]; // must match columns' `id`s below

function PagesPage() {
  const { page, perPage, sorting, filters } = useTableQueryState<PageSummary>({
    filterableColumnIds: FILTERABLE_COLUMN_IDS,
  });
  const status = filterValue(filters, "status") as PageSummary["status"] | undefined;
  const locale = filterValue(filters, "locale");

  const { data, isLoading } = useQuery({
    queryKey: ["pages", page, perPage, sorting, status, locale],
    queryFn: () => api.pages.list({ page, pageSize: perPage, sort: sorting, status, locale }),
    placeholderData: keepPreviousData, // avoid flicker/empty state while paginating
  });

  const columns = useMemo<ColumnDef<PageSummary>[]>(
    () => [
      // select column, data columns, actions column - see §9
    ],
    [/* deps used inside cell renderers */],
  );

  const { table } = useDataTable({
    data: data?.items ?? [],
    columns,
    pageCount: data ? Math.max(1, Math.ceil(data.total / perPage)) : -1,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } }, // both fields required
    getRowId: (row) => row.id,
  });

  return isLoading && !data ? (
    <DataTableSkeleton columnCount={columns.length} filterCount={2} />
  ) : (
    <DataTable table={table} actionBar={<SelectionActionBar table={table} />}>
      <DataTableAdvancedToolbar table={table}>
        <DataTableFilterMenu table={table} />
        <DataTableSortList table={table} />
      </DataTableAdvancedToolbar>
    </DataTable>
  );
}
```

Notes:

- `pageCount: -1` while `data` is still `undefined` tells TanStack Table "unknown" — fine for the initial load.
- `initialState.pagination` needs **both** `pageIndex` and `pageSize` — passing only `{ pageSize: 10 }` is a type error (`PaginationState` requires both).
- `placeholderData: keepPreviousData` (from `@tanstack/react-query`) is what stops the table flashing empty during a page/sort/filter change.

## 8. Client-mode table — full recipe

For a small, fully-in-memory dataset (a settings list, a config table — anything you'd never realistically paginate server-side), skip `useDataTable` and `useTableQueryState` entirely. Use plain `useReactTable`:

```tsx
const columns = useMemo<ColumnDef<Group>[]>(() => [/* ... */], [deps]);

const table = useReactTable({
  data: data ?? [],
  columns,
  getCoreRowModel: getCoreRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  // add getSortedRowModel()/getFilteredRowModel() too if those columns need it
});

return isLoading ? (
  <DataTableSkeleton columnCount={columns.length} withViewOptions={false} rowCount={3} />
) : (
  <DataTable table={table} />
);
```

No `<DataTableAdvancedToolbar>`/filter menu/sort list needed unless you specifically want them — `<DataTable>` renders fine with no children (just the table + pagination controls). If a client-mode table needs simple text search (e.g. filtering rows by a key/name field), use TanStack Table's built-in `globalFilter`:

```tsx
const [search, setSearch] = useState("");
const table = useReactTable({
  data,
  columns,
  state: { globalFilter: search },
  onGlobalFilterChange: setSearch,
  globalFilterFn: (row, _columnId, value) =>
    row.original.key.toLowerCase().includes(String(value).toLowerCase()),
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
});
// render your own <Input value={search} onChange={...} /> next to the table
```

Don't reach for `DataTableFilterMenu` for this — it's built for the manual/server-filtering pipeline and manages its own nuqs-backed state independent of TanStack Table's `columnFilters`.

## 9. Column definitions: filters, sorting, icons

```tsx
{
  id: "status",                       // used as the nuqs filter key AND the sort id
  accessorKey: "status",
  header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
  cell: ({ row }) => <StatusBadge status={row.original.status} />,
  enableColumnFilter: true,           // opt-in - default column config disables this
  meta: {
    label: "Status",                  // shown in filter-menu field list & column header
    variant: "select",                // "text" | "number" | "range" | "date" | "dateRange" | "boolean" | "select" | "multiSelect"
    icon: IconFlag,                   // shown in filter-menu field list AND (after the fix below) the sort field list
    options: [
      { label: "Draft", value: "draft" },
      { label: "Published", value: "published" },
    ],
  },
},
```

- `enableColumnFilter: true` is required per-column — `useDataTable`'s `defaultColumn` sets it `false` globally.
- `enableSorting` defaults to `true` unless you set it `false` — set it explicitly `false` on non-sortable columns (a `select` checkbox column, an `actions` column, anything computed/derived that the backend can't `ORDER BY`).
- **Set `meta.icon` on every column that's filterable or sortable**, not just the obviously "iconable" ones (a locale globe, a status flag) — also give plain sortable fields like a timestamp (`IconClock`) or a slug/URL field (`IconLink`) an icon. The filter-menu's field list renders `meta.icon` out of the box; the sort popover's field list does **not** by default (vendor gap) — patch it in `data-table-sort-list.tsx`:

  ```tsx
  // in the columns useMemo, carry the icon through:
  availableColumns.push({ id: column.id, label, icon: column.columnDef.meta?.icon });
  // in the field CommandItem:
  <CommandItem key={column.id} value={column.id} onSelect={...}>
    {column.icon && <column.icon />}
    <span className="truncate">{column.label}</span>
  </CommandItem>
  ```

## 10. Row selection + real batch actions

The stock `<ActionBar>` primitive (from `@diceui/action-bar`) is just a floating bar shell — it doesn't come with a "N selected" bubble or actions wired up. Build a small shared wrapper:

```tsx
// components/shared/SelectionActionBar.tsx
export function SelectionActionBar<TData>({
  table,
  actions,
}: {
  table: Table<TData>;
  actions?: (selectedRows: Row<TData>[]) => ReactNode;
}) {
  const rows = table.getFilteredSelectedRowModel().rows;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) table.toggleAllRowsSelected(false);
    },
    [table],
  );
  return (
    <ActionBar open={rows.length > 0} onOpenChange={onOpenChange}>
      <ActionBarSelection>{rows.length} selected</ActionBarSelection>
      {actions && (
        <>
          <ActionBarSeparator />
          <ActionBarGroup>{actions(rows)}</ActionBarGroup>
        </>
      )}
    </ActionBar>
  );
}
```

Add a checkbox column (standard TanStack Table pattern — not vendor-provided):

```tsx
{
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
      onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      aria-label="Select all"
    />
  ),
  cell: ({ row }) => (
    <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Select row" />
  ),
  enableSorting: false,
  enableHiding: false,
  size: 32,
},
```

Then pass real actions, not a placeholder — figure out what bulk operation your existing mutations already support (don't invent new backend capability just for this):

```tsx
actionBar={
  <SelectionActionBar
    table={table}
    actions={(rows) => {
      const draftIds = rows.map((r) => r.original).filter((p) => p.status === "draft").map((p) => p.id);
      if (draftIds.length === 0) return null;
      return (
        <Button size="sm" onClick={() => { publishSelected.mutate(draftIds); table.toggleAllRowsSelected(false); }}>
          <IconRocket className="size-3.5" /> Publish {draftIds.length}
        </Button>
      );
    }}
  />
}
```

## 11. Styling gotchas checklist

Run through this after installing — every one of these was a real, reported bug in this project, not theoretical:

1. **`CommandList` renders at a fixed height regardless of content** (`h-72` in `components/ui/command.tsx`). Every popover built on `<Command>` (filter menu, sort field picker, view options) inherits this — a 2-item list gets 288px of empty space below it. Fix once, globally: change `h-72` → `max-h-72` in `CommandList`'s className.
2. **Height mismatches between toolbar buttons.** The vendored files inconsistently add `h-8` overrides — some buttons/selects get it, some don't, so they render at different heights (this project's own `Button` size scale is smaller than default shadcn: `size="default"` is `h-7`, not the `h-9`/`h-10` you may be used to). Audit every `<Button>`/`<SelectTrigger>` in `data-table-sort-list.tsx`, `data-table-filter-menu.tsx`, `data-table-pagination.tsx` and make sure they all explicitly match (`h-8` in this project).
3. **`SelectTrigger` height overrides that silently do nothing.** If your `SelectTrigger` component controls height via a `size` prop mapped to an attribute variant (e.g. `data-[size=default]:h-7`, `data-[size=sm]:h-6` — check your own `components/ui/select.tsx`), a plain `className="h-8"` passed from a consumer may or may not win depending on Tailwind's compiled rule order — it's not guaranteed the way a same-specificity `cn()`/tailwind-merge override normally is. Use the `!` important-modifier to force it: `className="h-8!"`. (A literal `data-size:h-8` — copied from some other project's convention — is a no-op if your component actually uses `data-[size=default]:` semantics; check your actual base component before trusting a copied override class.)
4. **Wrong corner radius on interactive elements.** Vendored `data-table-sort-list.tsx` and `data-table-range-filter.tsx` hardcode a bare `rounded` (sharp, `0.25rem`) on several buttons/selects/inputs, overriding your theme's `rounded-md`. Grep for `\brounded\b` (not `rounded-*`) across the installed files and delete these overrides so they inherit the component defaults.
5. **Clickable column headers need `cursor-pointer` explicitly.** Tailwind's preflight resets `button { cursor: default }`; a `<DropdownMenuTrigger>`-based sortable header (not a `<Button>`, which already carries `cursor-pointer` in its base classes) needs it added by hand in `data-table-column-header.tsx`.
6. **The sort field list does not show column icons by default.** The filter menu does, so the two popovers look inconsistent. See the patch in §9.
7. **The add filter field list must hide fields that already have a filter.** Picking an already filtered field does nothing useful, since that filter is edited through its own chip. Only list fields without an active filter, and hide the Filter button once every field is filtered. In Nookly this lives in `src/components/filter-menu.tsx`:

   ```tsx
   const available = fields.filter((f) => !filters.some((a) => a.fieldId === f.id));
   // render available.map(...) in the field list, and the Popover only when available.length > 0
   ```

## 12. Verifying it actually works

Typecheck and a production build catch almost none of the bugs above — every one of them (the nuqs revert bug, the multiple-adapter-contexts crash, the height mismatches, the popover height) only shows up at runtime in a real browser against real data. If you don't have interactive browser access:

```bash
bun add -D playwright-core   # or use bunx playwright for the full CLI+browser install
bunx playwright install chromium
```

Then drive it with a short script (`chromium.launch()` → `page.goto()` → fill the login form → click through Sort/Filter popovers → screenshot + read `page.on("console", ...)` for errors). Specifically check:

- Console is clean of `[nuqs]` warnings and `Invalid hook call` errors.
- Clicking "Add sort" twice adds two independent sort entries that both persist (not one that reverts).
- Toolbar button heights are uniform (`getBoundingClientRect().height` on each `<button>` in the toolbar).
- A field-picker popover with 2 items isn't 300px tall.
