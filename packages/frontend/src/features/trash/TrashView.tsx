import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCategory,
  IconFolder,
  IconSearch,
  IconTrash,
  IconTrashX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef, type SortingState, useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import {
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { DataTable } from "#/components/data-table/data-table.tsx";
import { DataTableColumnHeader } from "#/components/data-table/data-table-column-header.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityIcon, iconForType } from "#/components/entity-icon.tsx";
import { EntityKey } from "#/components/entity-key.tsx";
import { EntityMention } from "#/components/entity-mention.tsx";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "#/components/filter-menu.tsx";
import { SpaceGlyph } from "#/components/spotlight.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { emptyTrash, hardDeleteEntity, listEntities, restoreEntity } from "#/lib/api/entities.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity, Space } from "#/lib/api/types.ts";
import { formatDateTime } from "#/lib/datetime.ts";
import { matchesKey } from "#/lib/entity-key.ts";
import { displayTitle, labelForType } from "#/lib/entity-title.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import { typeGroupFor } from "#/lib/search-results.ts";
import { type DataTableFeatures, dataTableFeatures } from "#/lib/table-features.ts";

interface TrashRow {
  entity: Entity;
  title: string;
  type: { key: string; label: string };
  space: Space | undefined;
  /// Always set: only trashed entities become rows.
  deletedAt: string;
}

const TRASH_KEY = ["entities", "all", "trash"];

const columns: ColumnDef<DataTableFeatures, TrashRow>[] = [
  {
    id: "title",
    accessorFn: (row) => row.title,
    header: ({ column }) => <DataTableColumnHeader column={column} label="Title" />,
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-2">
        <EntityIcon
          entity={row.original.entity}
          size={16}
          className="shrink-0 text-muted-foreground"
        />
        <EntityKey entityKey={row.original.entity.key} />
        <span className="truncate font-medium">{row.original.title}</span>
      </div>
    ),
    sortFn: (a, b) =>
      a.original.title.localeCompare(b.original.title, undefined, { sensitivity: "base" }),
    meta: { label: "Title", width: "fill" },
  },
  {
    id: "type",
    accessorFn: (row) => row.type.label,
    header: ({ column }) => <DataTableColumnHeader column={column} label="Type" />,
    cell: ({ row }) => (
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        {row.original.type.label}
      </span>
    ),
    sortFn: (a, b) => a.original.type.label.localeCompare(b.original.type.label),
    meta: { label: "Type", width: "fit", hideBelow: "md" },
  },
  {
    id: "space",
    accessorFn: (row) => row.space?.name ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Space" />,
    cell: ({ row }) => {
      const space = row.original.space;
      return (
        <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
          {space ? <SpaceGlyph space={space} size={13} /> : <IconFolder size={13} />}
          {space?.name ?? "Unknown Space"}
        </span>
      );
    },
    sortFn: (a, b) => (a.original.space?.name ?? "").localeCompare(b.original.space?.name ?? ""),
    meta: { label: "Space", width: "fit", hideBelow: "lg" },
  },
  {
    id: "deleted",
    accessorFn: (row) => row.deletedAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Deleted" className="ml-auto" />
    ),
    cell: ({ row }) => (
      <time
        dateTime={row.original.deletedAt}
        title={formatDateTime(row.original.deletedAt)}
        className="block text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums"
      >
        {formatEditedAt(row.original.deletedAt)}
      </time>
    ),
    sortFn: (a, b) => a.original.deletedAt.localeCompare(b.original.deletedAt),
    sortDescFirst: true,
    meta: { label: "Deleted", width: "fit", align: "end" },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <RowActions entity={row.original.entity} title={row.original.title} />,
    enableSorting: false,
    meta: { width: "fit", align: "end" },
  },
];

/// Trash as a data table (docs/skills/data-tables.md, client mode): every trashed
/// item from every Space is in memory, so search, filters and sorting run locally.
export function TrashView() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "deleted", desc: true }]);

  const { data: entities = [], isPending } = useQuery({
    queryKey: TRASH_KEY,
    queryFn: () => listEntities(null, true),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  const rows = useMemo<TrashRow[]>(() => {
    const spaceById = new Map(spaces.map((s) => [s.id, s]));
    return entities.flatMap((entity) =>
      entity.deletedAt
        ? [
            {
              entity,
              title: displayTitle(entity),
              type: { key: typeGroupFor(entity.type).key, label: labelForType(entity.type) },
              space: spaceById.get(entity.spaceId),
              deletedAt: entity.deletedAt,
            },
          ]
        : [],
    );
  }, [entities, spaces]);

  // Only Spaces and types something in the Trash belongs to are worth offering.
  const filterFields = useMemo<FilterField[]>(() => {
    const types = new Map(rows.map((r) => [r.type.key, r]));
    const inSpaces = new Map(rows.flatMap((r) => (r.space ? [[r.space.id, r.space]] : [])));
    const fields: FilterField[] = [];
    if (types.size > 1) {
      fields.push({
        id: "type",
        label: "Type",
        icon: IconCategory,
        options: [...types.values()].map((r) => {
          const Icon = iconForType(r.entity.type);
          return {
            value: r.type.key,
            label: typeGroupFor(r.entity.type).label,
            icon: <Icon size={14} />,
          };
        }),
      });
    }
    if (inSpaces.size > 1) {
      fields.push({
        id: "space",
        label: "Space",
        icon: IconFolder,
        options: [...inSpaces.values()].map((s) => ({
          value: s.id,
          label: s.name,
          icon: <SpaceGlyph space={s} size={14} />,
        })),
      });
    }
    return fields;
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const data = useMemo(
    () =>
      applyFilters(
        rows.filter(
          (r) =>
            !needle || r.title.toLowerCase().includes(needle) || matchesKey(r.entity.key, query),
        ),
        filters,
        (row, fieldId) => (fieldId === "space" ? row.entity.spaceId : row.type.key),
      ),
    [rows, needle, query, filters],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (row) => row.entity.id,
    state: { sorting },
    onSortingChange: setSorting,
    enableMultiSort: false,
  });

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="flex items-baseline gap-2 text-lg font-semibold">
            Trash
            {rows.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                {rows.length}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            Deleted items from every Space stay here until you restore them. Nothing is purged
            automatically.
          </p>
        </div>
        {rows.length > 0 && <EmptyTrashButton rows={rows} />}
      </div>

      {!isPending && rows.length === 0 ? (
        <EmptyState
          icon={IconTrash}
          title="Trash is empty"
          description="Deleted items from any Space will show up here."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64 max-w-full">
              <IconSearch
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder="Filter Trash"
                aria-label="Filter Trash"
                className="pl-8"
              />
            </div>
            {filterFields.length > 0 && (
              <div className="flex-1">
                <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
              </div>
            )}
          </div>

          {data.length > 0 ? (
            <DataTable table={table} rowContextTarget={(row) => entityTarget(row.entity)} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm text-muted-foreground">Nothing in the Trash matches.</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilters([]);
                }}
              >
                Clear filter
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/// Deletes everything in the Trash for good, after a confirmation that shows how
/// much goes and from how many Spaces.
function EmptyTrashButton({ rows }: { rows: TrashRow[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const empty = useMutation({ mutationFn: emptyTrash });
  // Refreshing only once the dialog closes keeps its pending state visible.
  useCloseAfterSuccess(empty, () => {
    setOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["entities"] });
  });
  const status = statusOf(empty);
  const spaceCount = new Set(rows.map((r) => r.entity.spaceId)).size;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !empty.isSuccess) empty.reset();
      }}
    >
      <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <IconTrashX />
        Empty Trash
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-1.5">
            <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
            Empty the Trash?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Everything in the Trash is erased for good, with its content and its links to other
            items. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <TrashStat value={rows.length} label={rows.length === 1 ? "Item" : "Items"} />
          <TrashStat value={spaceCount} label={spaceCount === 1 ? "Space" : "Spaces"} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              if (status === "idle" || status === "error") empty.mutate();
            }}
          >
            <StatusButtonContent
              status={status}
              label={`Delete ${rows.length} Forever`}
              errorLabel="Couldn't empty, try again"
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TrashStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/// Restore and delete forever, as quiet icon buttons that surface on hover.
function RowActions({ entity, title }: { entity: Entity; title: string }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: TRASH_KEY }),
      queryClient.invalidateQueries({ queryKey: ["entities", entity.spaceId] }),
    ]);

  const restore = useMutation({ mutationFn: () => restoreEntity(entity.id), onSuccess: refresh });
  // Refreshing only after the dialog closes keeps the row (and its dialog) mounted
  // long enough to show the pending state.
  const deleteForever = useMutation({ mutationFn: () => hardDeleteEntity(entity.id) });
  useCloseAfterSuccess(deleteForever, () => {
    setConfirmOpen(false);
    void refresh();
  });
  const restoreStatus = statusOf(restore);
  const deleteStatus = statusOf(deleteForever);

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={
              restoreStatus === "error" ? "Couldn't restore, try again" : `Restore ${title}`
            }
            onClick={() => !restore.isPending && restore.mutate()}
          >
            <StatusIcon status={restoreStatus} idle={<IconArrowBackUp />} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Restore</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={`Delete ${title} forever`}
            onClick={() => setConfirmOpen(true)}
          >
            <IconTrashX />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete Forever</TooltipContent>
      </Tooltip>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open && !deleteForever.isSuccess) deleteForever.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex flex-wrap items-center gap-1.5">
              <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
              Delete
              <EntityMention icon={<EntityIcon entity={entity} size={13} />} label={title} />
              forever?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases it and everything attached to it (content, links to other
              items). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (deleteStatus === "idle" || deleteStatus === "error") deleteForever.mutate();
              }}
            >
              <StatusButtonContent
                status={deleteStatus}
                label="Delete Forever"
                errorLabel="Couldn't delete, try again"
              />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
