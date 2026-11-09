import {
  IconChevronDown,
  IconChevronUp,
  IconEyeOff,
  IconSelector,
  IconX,
} from "@tabler/icons-react";
import { type ColumnDef, type RowData, useTable } from "@tanstack/react-table";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ContextTargetProps } from "#/components/context-menu/registry.ts";
import { DataTable, type DataTableGroup } from "#/components/data-table/data-table.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { cn } from "@nookly/ui/lib/utils";
import { type DataTableFeatures, dataTableFeatures } from "#/lib/table-features.ts";
import { sortItems } from "./evaluate.ts";
import { clampWidth } from "./table-display.ts";
import type { ColumnSetting, SortDirection, TableDisplay, ViewField, ViewSource } from "./types.ts";

/// The table layout of the view engine: one column per field, sortable from its header and
/// resizable by dragging (or with the arrow keys on) its right edge. What the user changes
/// goes to `onTableChange`, so a page saves it with the rest of its display.

/// The fields shown, in order: the stored columns, or the source's defaults.
export function shownFields<T, C>(
  source: Pick<ViewSource<T, C>, "fields" | "defaultColumns">,
  table: TableDisplay,
  hidden: string[] = [],
): { field: ViewField<T, C>; width?: number }[] {
  const columns: ColumnSetting[] =
    table.columns.length > 0 ? table.columns : source.defaultColumns.map((field) => ({ field }));
  return columns.flatMap(({ field: id, width }) => {
    const field = source.fields.find((f) => f.id === id);
    return field && !hidden.includes(id) ? [{ field, width }] : [];
  });
}

const RESIZE_STEP = 16;

interface HeaderProps {
  label: string;
  sorted: SortDirection | null;
  width: number | undefined;
  onSort: (direction: SortDirection | null) => void;
  onHide: (() => void) | undefined;
  /// `commit` is false while dragging, true once the width is final.
  onResize: (width: number, commit: boolean) => void;
}

/// What each column's header and cells draw, by field id. The table renders a column's
/// `header` and `cell` as components, so they must stay the same functions from render to
/// render (a new one would remount the header, closing its menu and dropping its focus);
/// they read what changes from here instead.
const TableParts = createContext<{
  headerProps: Map<string, HeaderProps>;
  cells: Map<string, (item: RowData) => ReactNode>;
}>({ headerProps: new Map(), cells: new Map() });

function HeaderCell({ column }: { column: { id: string } }) {
  const props = useContext(TableParts).headerProps.get(column.id);
  return props ? <ColumnHeader {...props} /> : null;
}

function BodyCell({ column, row }: { column: { id: string }; row: { original: RowData } }) {
  const draw = useContext(TableParts).cells.get(column.id);
  return <div className="min-w-0 truncate">{draw?.(row.original)}</div>;
}

function cellContent<T, C>(field: ViewField<T, C>, item: T, ctx: C): ReactNode {
  if (field.cell) return field.cell(item, ctx);
  if (field.text) return field.text(item, ctx);
  return String(field.value(item, ctx) ?? "");
}

function ColumnHeader({ label, sorted, width, onSort, onHide, onResize }: HeaderProps) {
  const [drag, setDrag] = useState<{ x: number; width: number } | null>(null);
  const startWidth = (handle: HTMLElement) =>
    width ?? handle.closest("th")?.getBoundingClientRect().width ?? 160;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, width: startWidth(e.currentTarget) });
  };
  const widthAt = (e: PointerEvent) => clampWidth((drag?.width ?? 0) + e.clientX - (drag?.x ?? 0));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP;
    onResize(clampWidth(startWidth(e.currentTarget) + step), true);
  };

  return (
    <div className="relative flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Sort by ${label}`}
            className="-ml-2 flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent"
          >
            <span className="truncate">{label}</span>
            {sorted === "desc" ? (
              <IconChevronDown size={14} className="shrink-0" />
            ) : sorted === "asc" ? (
              <IconChevronUp size={14} className="shrink-0" />
            ) : (
              <IconSelector size={14} className="shrink-0 text-muted-foreground/60" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuCheckboxItem checked={sorted === "asc"} onClick={() => onSort("asc")}>
            Ascending
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={sorted === "desc"} onClick={() => onSort("desc")}>
            Descending
          </DropdownMenuCheckboxItem>
          {sorted && (
            <DropdownMenuItem onClick={() => onSort(null)}>
              <IconX size={14} className="text-muted-foreground" />
              Reset
            </DropdownMenuItem>
          )}
          {onHide && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onHide}>
                <IconEyeOff size={14} className="text-muted-foreground" />
                Hide column
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a focusable separator is the ARIA pattern for a resize handle. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        aria-valuenow={width ?? 0}
        aria-valuemin={0}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => drag && onResize(widthAt(e), false)}
        onPointerUp={(e) => {
          if (!drag) return;
          onResize(widthAt(e), true);
          setDrag(null);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute -right-2 top-1/2 h-5 w-1.5 -translate-y-1/2 cursor-col-resize rounded-full outline-none hover:bg-foreground/20 focus-visible:bg-ring",
          drag && "bg-foreground/30",
        )}
      />
    </div>
  );
}

export function ViewTable<T extends RowData, C>({
  source,
  items,
  ctx,
  table,
  onTableChange,
  onOpen,
  groups,
  rowContextTarget,
  hiddenFields,
  empty,
}: {
  source: ViewSource<T, C>;
  /// Already filtered, in the order to show them in without a sort.
  items: T[];
  ctx: C;
  table: TableDisplay;
  onTableChange: (table: TableDisplay) => void;
  onOpen: (item: T) => void;
  groups?: DataTableGroup<T>[];
  rowContextTarget?: (item: T) => ContextTargetProps;
  /// Fields that make no sense where the table is shown, like the Space on a Space's page.
  hiddenFields?: string[];
  /// Shown instead of the table when there are no items.
  empty?: ReactNode;
}) {
  // A width being dragged, shown before it is saved.
  const [live, setLive] = useState<{ field: string; width: number } | null>(null);
  const shown = shownFields(source, table, hiddenFields);
  const sorted = useMemo(
    () => sortItems(items, table.sort, source.fields, ctx),
    [items, table.sort, source.fields, ctx],
  );

  const setColumns = (next: { field: string; width?: number }[]) =>
    onTableChange({ ...table, columns: next });
  const current = shown.map(({ field, width }) => ({ field: field.id, width }));

  const headerProps = new Map<string, HeaderProps>();
  const cells = new Map<string, (item: RowData) => ReactNode>();
  const columns: ColumnDef<DataTableFeatures, T>[] = shown.map(({ field, width }, index) => {
    const size = live?.field === field.id ? live.width : width;
    headerProps.set(field.id, {
      label: field.label,
      sorted: table.sort.find((s) => s.field === field.id)?.direction ?? null,
      width: size,
      onSort: (next) =>
        onTableChange({ ...table, sort: next ? [{ field: field.id, direction: next }] : [] }),
      // The title always stays, so a row can be told apart.
      onHide:
        field.id === "title"
          ? undefined
          : () => setColumns(current.filter((c) => c.field !== field.id)),
      onResize: (next, commit) => {
        if (!commit) return setLive({ field: field.id, width: next });
        setLive(null);
        setColumns(current.map((c) => (c.field === field.id ? { ...c, width: next } : c)));
      },
    });
    // SAFETY: the table only ever hands back the items it was given, which are `T`s.
    cells.set(field.id, (item) => cellContent(field, item as T, ctx));
    return {
      id: field.id,
      header: HeaderCell,
      cell: BodyCell,
      meta: {
        label: field.label,
        width: field.fit ? "fit" : field.id === "title" ? "third" : "fill",
        size,
        // A narrow window drops the later columns instead of scrolling sideways.
        hideBelow: field.id === "title" || index < 3 ? undefined : index < 5 ? "md" : "lg",
      },
    };
  });

  const tanstack = useTable({
    features: dataTableFeatures,
    columns,
    data: sorted,
    getRowId: (item) => source.entityOf(item).id,
  });

  if (items.length === 0 && empty) return <>{empty}</>;
  return (
    <TableParts.Provider value={{ headerProps, cells }}>
      <DataTable
        table={tanstack}
        scrollX={false}
        onRowClick={onOpen}
        rowContextTarget={rowContextTarget}
        groups={groups}
      />
    </TableParts.Provider>
  );
}

/// A module page's groups as table sections, or none without a grouping. A row in several
/// groups (a task with two labels) shows in the first.
export function groupsForTable<T>(
  groups: { id: string; name: string; icon?: ReactNode; items: T[] }[],
  grouping: string,
): DataTableGroup<T>[] | undefined {
  if (grouping === "none") return undefined;
  return groups.map((group) => {
    const members = new Set(group.items);
    return {
      id: group.id,
      label: (
        <span className="flex items-center gap-1.5">
          {group.icon}
          {group.name}
        </span>
      ),
      match: (item: T) => members.has(item),
    };
  });
}
