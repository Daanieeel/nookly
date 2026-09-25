import { IconChevronDown, IconChevronUp, IconSelector, IconX } from "@tabler/icons-react";
import type { Column, RowData } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import type { DataTableFeatures } from "#/lib/table-features.ts";
import { cn } from "@nookly/ui/lib/utils";

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  label,
  className,
}: {
  column: Column<DataTableFeatures, TData, TValue>;
  label: string;
  className?: string;
}) {
  if (!column.getCanSort()) return <div className={className}>{label}</div>;

  const sorted = column.getIsSorted();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Sort by ${label}`}
          className={cn(
            "-ml-2 flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent",
            className,
          )}
        >
          {label}
          {sorted === "desc" ? (
            <IconChevronDown size={14} />
          ) : sorted === "asc" ? (
            <IconChevronUp size={14} />
          ) : (
            <IconSelector size={14} className="text-muted-foreground/60" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-32">
        <DropdownMenuCheckboxItem
          checked={sorted === "asc"}
          onClick={() => column.toggleSorting(false)}
        >
          Ascending
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={sorted === "desc"}
          onClick={() => column.toggleSorting(true)}
        >
          Descending
        </DropdownMenuCheckboxItem>
        {sorted && (
          <DropdownMenuItem onClick={() => column.clearSorting()}>
            <IconX size={14} className="text-muted-foreground" />
            Reset
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
