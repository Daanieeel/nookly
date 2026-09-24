import { IconNotes, IconPin, IconPlus, IconSearch, IconTag } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ColumnDef,
  functionalUpdate,
  type SortingState,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { StatusButtonContent, statusOf } from "@/components/action-feedback";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { DataTable, type DataTableGroup } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { type ActiveFilter, type FilterField, FilterMenu } from "@/components/filter-menu";
import { LabelChip, LabelDot } from "@/components/label-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLabels } from "@/lib/api/labels";
import { createNote, listNoteSummaries } from "@/lib/api/notes";
import type { Label, PageSummary } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { formatEditedAt } from "@/lib/relative-time";
import { matchesKey } from "@/lib/entity-key";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useNavStore } from "@/lib/store/nav";
import { type DataTableFeatures, dataTableFeatures } from "@/lib/table-features";
import { prefetchBlocks } from "./blocks-query";
import { keyColumn } from "./key-column";
import { notePreviewText } from "./note-preview";
import { formatDateTime } from "@/lib/datetime";
import { preferences } from "@/lib/preferences";

interface NoteRow {
  summary: PageSummary;
  title: string;
  preview: string;
  labels: Label[];
}

const SORTABLE_COLUMNS = new Set(["key", "title", "edited"]);
const DEFAULT_SORTING: SortingState = [{ id: "edited", desc: true }];
const MAX_ROW_LABELS = 3;

/// Stored as `"<column>:<asc|desc>"`, e.g. `"edited:desc"`.
function readStoredSorting(): SortingState {
  const [id, dir] = (preferences.get(STORAGE_KEYS.notesSort) ?? "").split(":");
  if (SORTABLE_COLUMNS.has(id) && (dir === "asc" || dir === "desc")) {
    return [{ id, desc: dir === "desc" }];
  }
  return DEFAULT_SORTING;
}

function writeStoredSorting(sorting: SortingState) {
  const [first] = sorting;
  if (first) {
    preferences.set(STORAGE_KEYS.notesSort, `${first.id}:${first.desc ? "desc" : "asc"}`);
  } else {
    preferences.remove(STORAGE_KEYS.notesSort);
  }
}

/// A Note passes the label filter when "is" matches any chosen label and "is not"
/// matches none of them.
function passesLabelFilters(row: NoteRow, filters: ActiveFilter[]): boolean {
  return filters.every((f) => {
    const hit = row.labels.some((l) => f.values.includes(l.id));
    return f.operator === "is" ? hit : !hit;
  });
}

const columns: ColumnDef<DataTableFeatures, NoteRow>[] = [
  keyColumn<NoteRow>(),
  {
    id: "title",
    accessorFn: (row) => row.title,
    header: ({ column }) => <DataTableColumnHeader column={column} label="Title" />,
    cell: ({ row }) => <TitleCell row={row.original} />,
    sortFn: (a, b) =>
      a.original.title.localeCompare(b.original.title, undefined, { sensitivity: "base" }),
    meta: { label: "Title", width: "third" },
  },
  {
    id: "preview",
    accessorFn: (row) => row.preview,
    header: "Preview",
    cell: ({ row }) =>
      row.original.preview ? (
        <span className="block truncate text-muted-foreground">{row.original.preview}</span>
      ) : (
        <span className="text-muted-foreground/60 italic">Nothing written yet</span>
      ),
    enableSorting: false,
    meta: { label: "Preview", width: "fill", hideBelow: "md" },
  },
  {
    id: "labels",
    header: "Labels",
    cell: ({ row }) => <LabelsCell labels={row.original.labels} />,
    enableSorting: false,
    meta: { label: "Labels", width: "fit", hideBelow: "lg" },
  },
  {
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
  },
];

/// Notes as a data table (docs/skills/data-tables.md, client mode): every Note of this
/// Space is already in memory, so search, sorting and label filtering all run locally.
/// Global cross Space search stays in Cmd+K.
export function NotesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [sorting, setSorting] = useState<SortingState>(readStoredSorting);

  // Nested under ["entities", spaceId] so every rename/pin/trash invalidation refreshes it.
  const { data: summaries = [], isPending } = useQuery({
    queryKey: ["entities", spaceId, "note-summaries"],
    queryFn: () => listNoteSummaries(spaceId),
  });
  const { data: spaceLabels = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
  });

  const create = useMutation({
    // Empty title so the canvas opens with the title field focused and ready to type.
    mutationFn: () => createNote(spaceId, ""),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      openEntity(entity.id, spaceId);
    },
  });
  const createStatus = statusOf(create);
  const startNote = () => !create.isPending && create.mutate();

  const rows = useMemo<NoteRow[]>(() => {
    const labelsById = new Map(spaceLabels.map((l) => [l.id, l]));
    return summaries.map((summary) => ({
      summary,
      title: displayTitle(summary.entity),
      preview: notePreviewText(summary.preview, summary.entity.title),
      labels: summary.labelIds.flatMap((id) => labelsById.get(id) ?? []),
    }));
  }, [summaries, spaceLabels]);

  // Only labels some Note actually carries are worth offering as a filter.
  const filterFields = useMemo<FilterField[]>(() => {
    const used = spaceLabels.filter((l) => rows.some((r) => r.labels.includes(l)));
    if (used.length === 0) return [];
    return [
      {
        id: "labels",
        label: "Labels",
        icon: IconTag,
        options: used.map((l) => ({ value: l.id, label: l.name, icon: <LabelDot label={l} /> })),
      },
    ];
  }, [spaceLabels, rows]);

  const needle = query.trim().toLowerCase();
  const data = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!needle ||
            r.title.toLowerCase().includes(needle) ||
            r.preview.toLowerCase().includes(needle) ||
            matchesKey(r.summary.entity.key, query)) &&
          passesLabelFilters(r, filters),
      ),
    [rows, needle, filters],
  );

  const onSortingChange = (updater: Updater<SortingState>) => {
    const next = functionalUpdate(updater, sorting);
    setSorting(next);
    writeStoredSorting(next);
  };

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (row) => row.summary.entity.id,
    state: { sorting },
    onSortingChange,
    enableMultiSort: false,
  });

  const hasPinned = data.some((r) => r.summary.entity.pinned);
  const groups: DataTableGroup<NoteRow>[] | undefined = hasPinned
    ? [
        {
          id: "pinned",
          label: (
            <span className="flex items-center gap-1.5">
              <IconPin size={12} />
              Pinned
            </span>
          ),
          match: (r) => r.summary.entity.pinned,
        },
        { id: "rest", label: "All notes", match: () => true },
      ]
    : undefined;

  if (!isPending && rows.length === 0) {
    return (
      <div
        className="flex w-full flex-col gap-4"
        {...contextTarget("module-view", { spaceId, createLabel: "New Note", create: startNote })}
      >
        <h1 className="text-lg font-semibold">Notes</h1>
        <EmptyState
          icon={IconNotes}
          title="No notes in this Space yet"
          description="Anything worth writing down belongs here. Start one and it shows up in this table."
          action={{
            label: create.isError ? "Couldn't create note, try again" : "New Note",
            onClick: startNote,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex w-full flex-col gap-3"
      {...contextTarget("module-view", { spaceId, createLabel: "New Note", create: startNote })}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto flex items-baseline gap-2 text-lg font-semibold">
          Notes
          <span className="text-sm font-normal text-muted-foreground tabular-nums">
            {rows.length}
          </span>
        </h1>
        <Button
          variant={createStatus === "error" ? "destructive" : "secondary"}
          size="sm"
          className="gap-1.5"
          onClick={startNote}
        >
          <StatusButtonContent
            status={createStatus}
            icon={<IconPlus size={14} />}
            label="New Note"
            errorLabel="Couldn't create note, try again"
          />
        </Button>
      </div>

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
            placeholder="Filter notes"
            aria-label="Filter notes in this Space"
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
        <DataTable
          table={table}
          groups={groups}
          onRowClick={(row) => openEntity(row.summary.entity.id, spaceId)}
          onRowFocus={(row) => prefetchBlocks(queryClient, row.summary.entity.id)}
          rowContextTarget={(row) => entityTarget(row.summary.entity)}
        />
      ) : (
        !isPending && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-muted-foreground">No notes match this filter.</p>
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
        )
      )}
    </div>
  );
}

function TitleCell({ row }: { row: NoteRow }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <EntityIcon
        entity={row.summary.entity}
        size={16}
        className="mt-0.5 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.title}</span>
        {/* The preview column is hidden at narrow widths, so the title carries it instead. */}
        {row.preview && (
          <span className="truncate text-xs text-muted-foreground md:hidden">{row.preview}</span>
        )}
      </div>
    </div>
  );
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
