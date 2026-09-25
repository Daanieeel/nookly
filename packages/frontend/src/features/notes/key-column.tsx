import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "#/components/data-table/data-table-column-header.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import type { PageSummary } from "#/lib/api/types.ts";
import type { DataTableFeatures } from "#/lib/table-features.ts";

function keyNumber(key: string): number {
  return Number(key.split("-")[1] ?? 0);
}

/// Leading `NOT-12` style ID column for page tables, sorted by number.
export function keyColumn<TRow extends { summary: PageSummary }>(): ColumnDef<
  DataTableFeatures,
  TRow
> {
  return {
    id: "key",
    accessorFn: (row) => row.summary.entity.key,
    header: ({ column }) => <DataTableColumnHeader column={column} label="ID" />,
    cell: ({ row }) => <EntityKey entityKey={row.original.summary.entity.key} />,
    sortFn: (a, b) =>
      keyNumber(a.original.summary.entity.key) - keyNumber(b.original.summary.entity.key),
    meta: { label: "ID", width: "fit" },
  };
}
