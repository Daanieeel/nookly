import {
  flexRender,
  type Row,
  type RowData,
  type Table as TanstackTable,
} from "@tanstack/react-table";
import type * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DataTableColumnMeta, DataTableFeatures } from "@/lib/table-features";
import { cn } from "@/lib/utils";

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

export function DataTable<TData extends RowData>({
  table,
  onRowClick,
  onRowFocus,
  groups,
  className,
}: {
  table: TanstackTable<DataTableFeatures, TData>;
  /// Makes rows clickable and keyboard reachable (Enter opens).
  onRowClick?: (row: TData) => void;
  /// Fires on hover and keyboard focus, e.g. to prefetch what a click will open.
  onRowFocus?: (row: TData) => void;
  groups?: DataTableGroup<TData>[];
  className?: string;
}) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;
  const sections: { group: DataTableGroup<TData>; rows: Row<DataTableFeatures, TData>[] }[] = (
    groups ?? []
  ).map((group) => ({ group, rows: [] }));
  for (const row of groups ? rows : []) {
    sections.find((s) => s.group.match(row.original))?.rows.push(row);
  }

  const renderRow = (row: Row<DataTableFeatures, TData>) => (
    <TableRow
      key={row.id}
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
      onFocus={onRowFocus ? () => onRowFocus(row.original) : undefined}
      className={cn(
        onRowClick &&
          "cursor-pointer outline-none focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
    >
      {row.getAllCells().map((cell) => (
        <TableCell
          key={cell.id}
          {...columnData(cell.column.columnDef.meta)}
          className="data-[align=end]:text-right data-[hide-below=lg]:hidden data-[hide-below=md]:hidden data-[width=fill]:max-w-0 data-[width=fit]:w-px data-[width=third]:max-w-0 md:data-[hide-below=md]:table-cell md:data-[width=third]:w-1/3 lg:data-[hide-below=lg]:table-cell"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="hover:bg-transparent">
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                colSpan={header.colSpan}
                {...columnData(header.column.columnDef.meta)}
                className="data-[align=end]:text-right data-[hide-below=lg]:hidden data-[hide-below=md]:hidden data-[width=fill]:max-w-0 data-[width=fit]:w-px data-[width=third]:max-w-0 md:data-[hide-below=md]:table-cell md:data-[width=third]:w-1/3 lg:data-[hide-below=lg]:table-cell"
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      {groups ? (
        sections
          .filter((s) => s.rows.length > 0)
          .map((section) => (
            <TableBody key={section.group.id}>
              <TableRow className="border-b-0 hover:bg-transparent">
                <TableCell
                  colSpan={columnCount}
                  className="pt-4 pb-1 text-xs font-medium text-muted-foreground"
                >
                  {section.group.label}
                </TableCell>
              </TableRow>
              {section.rows.map(renderRow)}
            </TableBody>
          ))
      ) : (
        <TableBody>{rows.map(renderRow)}</TableBody>
      )}
    </Table>
  );
}
