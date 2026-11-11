import {
  flexRender,
  type Row,
  type RowData,
  type Table as TanstackTable,
} from "@tanstack/react-table";
import type * as React from "react";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useWindowedList } from "#/hooks/use-windowed-list.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nookly/ui/components/table";
import type { DataTableColumnMeta, DataTableFeatures } from "#/lib/table-features.ts";
import type { ContextTargetProps } from "#/components/context-menu/registry.ts";
import { cn } from "@nookly/ui/lib/utils";

/// Splits the (already sorted) rows into labelled sections, in this order. A row goes
/// to the first group it matches; empty groups are omitted entirely.
export interface DataTableGroup<TData> {
  id: string;
  label: React.ReactNode;
  match: (row: TData) => boolean;
}

/// Column layout travels as data attributes so the matching classes stay static.
function columnData(meta: DataTableColumnMeta | undefined) {
  return {
    "data-width": meta?.width,
    "data-hide-below": meta?.hideBelow,
    "data-align": meta?.align,
  };
}

/// Room for padding and a sort chevron next to the label, on top of its characters.
const COLUMN_PADDING = "3.5rem";

/// The narrowest a column may get: as wide as its label, so a narrow window scrolls the
/// table sideways instead of squeezing the columns until they cannot be read. Used as a
/// custom property so the class (`min-w-(--col-min)`) stays static.
function columnMinWidth(column: { id: string; columnDef: { meta?: DataTableColumnMeta } }): string {
  const label = column.columnDef.meta?.label ?? column.id;
  return `calc(${label.length}ch + ${COLUMN_PADDING})`;
}

/// What a row and a group heading measure before they are drawn, so a long list reserves
/// about the right room for the rows it leaves out.
const ROW_HEIGHT = 37;
const GROUP_HEADING_HEIGHT = 40;

const COLUMN_CLASSES =
  "min-w-(--col-min) data-[align=end]:text-right data-[hide-below=lg]:hidden data-[hide-below=md]:hidden data-[width=fill]:max-w-0 data-[width=fit]:w-px data-[width=third]:max-w-0 @lg:data-[hide-below=md]:table-cell @lg:data-[width=third]:w-1/3 @3xl:data-[hide-below=lg]:table-cell";

export function DataTable<TData extends RowData>({
  table,
  onRowClick,
  onRowFocus,
  rowContextTarget,
  groups,
  className,
  scrollX = true,
}: {
  table: TanstackTable<DataTableFeatures, TData>;
  /// Makes rows clickable and keyboard reachable (Enter opens).
  onRowClick?: (row: TData) => void;
  /// Fires on hover and keyboard focus, e.g. to prefetch what a click will open.
  onRowFocus?: (row: TData) => void;
  /// What a right-click on the row opens, from `contextTarget`/`entityTarget`.
  rowContextTarget?: (row: TData) => ContextTargetProps;
  groups?: DataTableGroup<TData>[];
  className?: string;
  /// Scrolls sideways when the columns cannot fit (the default). Off, the table keeps to the
  /// width it has and the columns that are marked to hide when narrow do so.
  scrollX?: boolean;
}) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;
  const sections: { group: DataTableGroup<TData>; rows: Row<DataTableFeatures, TData>[] }[] = (
    groups ?? []
  ).map((group) => ({ group, rows: [] }));
  for (const row of groups ? rows : []) {
    sections.find((s) => s.group.match(row.original))?.rows.push(row);
  }

  type Item =
    | { kind: "heading"; section: (typeof sections)[number] }
    | { kind: "row"; row: Row<DataTableFeatures, TData> };
  const items: Item[] = groups
    ? sections
        .filter((s) => s.rows.length > 0)
        .flatMap((section) => [
          { kind: "heading" as const, section },
          ...section.rows.map((row) => ({ kind: "row" as const, row })),
        ])
    : rows.map((row) => ({ kind: "row" as const, row }));

  // A long table draws only the rows around the screen (see `use-windowed-list.ts`).
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const list = useWindowedList({
    count: items.length,
    estimateSize: (index) => (items[index]?.kind === "heading" ? GROUP_HEADING_HEIGHT : ROW_HEIGHT),
    keepIndex: focusedIndex,
  });

  // Columns sized to their content would change width as other rows are drawn. While
  // windowed, a column keeps the widest it has been, so scrolling never shifts the table.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const headers = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    if (!list.windowed) {
      if (Object.keys(widths).length > 0) setWidths({});
      return;
    }
    const grown: Record<string, number> = {};
    for (const [id, element] of headers.current) {
      const width = Math.ceil(element.offsetWidth);
      if (width > (widths[id] ?? 0)) grown[id] = width;
    }
    if (Object.keys(grown).length > 0) setWidths({ ...widths, ...grown });
  });
  const minWidthOf = (column: { id: string; columnDef: { meta?: DataTableColumnMeta } }) => {
    const floor = column.columnDef.meta?.width === "fit" ? widths[column.id] : undefined;
    const label = columnMinWidth(column);
    return floor ? `max(${label}, ${floor}px)` : label;
  };

  const renderRow = (row: Row<DataTableFeatures, TData>, index?: number) => (
    <TableRow
      key={row.id}
      data-index={index}
      aria-rowindex={index === undefined ? undefined : index + 2}
      ref={index === undefined ? undefined : list.measureElement}
      tabIndex={onRowClick ? 0 : undefined}
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row.original);
            }
          : undefined
      }
      onMouseEnter={onRowFocus ? () => onRowFocus(row.original) : undefined}
      onFocus={() => {
        onRowFocus?.(row.original);
        if (index !== undefined) setFocusedIndex(index);
      }}
      onBlur={index === undefined ? undefined : () => setFocusedIndex(null)}
      {...rowContextTarget?.(row.original)}
      className={cn(
        onRowClick &&
          "cursor-pointer outline-none focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
    >
      {row.getAllCells().map((cell) => (
        <TableCell
          key={cell.id}
          {...columnData(cell.column.columnDef.meta)}
          // SAFETY: only a custom property, which `CSSProperties` can't name.
          style={{ "--col-min": minWidthOf(cell.column) } as CSSProperties}
          className={COLUMN_CLASSES}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );

  const renderHeading = (section: (typeof sections)[number], index?: number) => (
    <TableRow
      key={`heading-${section.group.id}`}
      data-index={index}
      aria-rowindex={index === undefined ? undefined : index + 2}
      ref={index === undefined ? undefined : list.measureElement}
      className="border-b-0 hover:bg-transparent"
    >
      <TableCell
        colSpan={columnCount}
        className="pt-4 pb-1 text-xs font-medium text-muted-foreground"
      >
        {section.group.label}
      </TableCell>
    </TableRow>
  );

  return (
    // Scrolls sideways when the columns cannot fit, rather than squeezing them.
    <div className={scrollX ? "overflow-x-auto" : "overflow-x-hidden"}>
      <Table
        className={cn("w-full", scrollX && "min-w-max", className)}
        aria-rowcount={list.windowed ? items.length + 1 : undefined}
      >
        <TableHeader ref={list.windowed ? undefined : list.startRef}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  ref={(element) => {
                    if (element) headers.current.set(header.column.id, element);
                    else headers.current.delete(header.column.id);
                  }}
                  colSpan={header.colSpan}
                  {...columnData(header.column.columnDef.meta)}
                  // SAFETY: only a custom property, which `CSSProperties` can't name.
                  style={{ "--col-min": minWidthOf(header.column) } as CSSProperties}
                  className={COLUMN_CLASSES}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        {list.windowed ? (
          <TableBody ref={list.startRef}>
            {list.before > 0 && (
              <TableRow
                aria-hidden
                className="h-(--room) border-0" // SAFETY: only a custom property, which `CSSProperties` can't name.
                style={{ "--room": `${list.before}px` } as CSSProperties}
              />
            )}
            {list.items.map((virtual) => {
              const item = items[virtual.index];
              if (!item) return null;
              return item.kind === "heading"
                ? renderHeading(item.section, virtual.index)
                : renderRow(item.row, virtual.index);
            })}
            {list.after > 0 && (
              <TableRow
                aria-hidden
                className="h-(--room) border-0" // SAFETY: only a custom property, which `CSSProperties` can't name.
                style={{ "--room": `${list.after}px` } as CSSProperties}
              />
            )}
          </TableBody>
        ) : groups ? (
          sections
            .filter((s) => s.rows.length > 0)
            .map((section) => (
              <TableBody key={section.group.id}>
                {renderHeading(section)}
                {section.rows.map((row) => renderRow(row))}
              </TableBody>
            ))
        ) : (
          <TableBody>{rows.map((row) => renderRow(row))}</TableBody>
        )}
      </Table>
    </div>
  );
}
