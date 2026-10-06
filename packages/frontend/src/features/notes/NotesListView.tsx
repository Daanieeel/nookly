import { qk } from "#/lib/query-keys.ts";
import { IconNotes, IconPin, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ColumnDef,
  functionalUpdate,
  type SortingState,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { contextTarget } from "#/components/context-menu/registry.ts";
import type { DataTableGroup } from "#/components/data-table/data-table.tsx";
import {} from "#/components/data-table/data-table-column-header.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { type ActiveFilter, FilterMenu } from "#/components/filter-menu.tsx";
import { Button } from "@nookly/ui/components/button";
import {} from "@nookly/ui/components/input";
import { listLabels } from "#/lib/api/labels.ts";
import { createNote, listNoteSummaries } from "#/lib/api/notes.ts";
import type { Label, PageSummary } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import {} from "#/lib/relative-time.ts";
import {} from "#/lib/entity-key.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { type DataTableFeatures, dataTableFeatures } from "#/lib/table-features.ts";
import {
  editedColumn,
  labelsColumn,
  ListSearchInput,
  PageSummaryTable,
  matchesQuery,
  readStoredSorting,
  titleColumn,
  writeStoredSorting,
} from "./list-table-shared";
import { keyColumn } from "./key-column";
import { noteFilterFields, passesNoteFilters } from "./note-filters";
import { notePreviewText } from "./note-preview";
import {} from "#/lib/datetime.ts";
import {} from "#/lib/preferences.ts";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";

export interface NoteRow {
  summary: PageSummary;
  title: string;
  preview: string;
  labels: Label[];
}

const readSorting = () => readStoredSorting(STORAGE_KEYS.notesSort);
const writeSorting = (sorting: SortingState) => writeStoredSorting(STORAGE_KEYS.notesSort, sorting);

export const noteColumns: ColumnDef<DataTableFeatures, NoteRow>[] = [
  keyColumn<NoteRow>(),
  titleColumn<NoteRow>(TitleCell),
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
  labelsColumn<NoteRow>(),
  editedColumn<NoteRow>(),
];

/// Notes as a data table (docs/skills/data-tables.md, client mode): every Note of this
/// Space is already in memory, so search, sorting and filtering all run locally.
/// Global cross Space search stays in Cmd+K.
export function NotesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [sorting, setSorting] = useState<SortingState>(readSorting);

  // Nested under ["entities", spaceId] so every rename/pin/trash invalidation refreshes it.
  const { data: summaries = [], isPending } = useQuery({
    queryKey: qk.entities.noteSummaries(spaceId),
    queryFn: () => listNoteSummaries(spaceId),
  });
  const { data: spaceLabels = [] } = useQuery({
    queryKey: qk.labels.bySpace(spaceId),
    queryFn: () => listLabels(spaceId),
  });

  const create = useMutation({
    // Empty title so the canvas opens with the title field focused and ready to type.
    mutationFn: () => createNote(spaceId, ""),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(spaceId) });
      openEntity(entity.id, spaceId);
    },
  });
  const createStatus = statusOf(create);
  const startNote = () => !create.isPending && create.mutate();
  useCreateShortcut(startNote);

  const rows = useMemo<NoteRow[]>(() => {
    const labelsById = new Map(spaceLabels.map((l) => [l.id, l]));
    return summaries.map((summary) => ({
      summary,
      title: displayTitle(summary.entity),
      preview: notePreviewText(summary.preview, summary.entity.title),
      labels: summary.labelIds.flatMap((id) => labelsById.get(id) ?? []),
    }));
  }, [summaries, spaceLabels]);

  const filterFields = useMemo(() => noteFilterFields(rows, spaceLabels), [rows, spaceLabels]);

  // Time windows ("Past 7 days") are measured from the latest load, not every render.
  const now = useMemo(() => Date.now(), [summaries]);
  const needle = query.trim().toLowerCase();
  const data = useMemo(
    () => rows.filter((r) => matchesQuery(r, needle, query) && passesNoteFilters(r, filters, now)),
    [rows, needle, filters, now],
  );

  const onSortingChange = (updater: Updater<SortingState>) => {
    const next = functionalUpdate(updater, sorting);
    setSorting(next);
    writeSorting(next);
  };

  const table = useTable({
    features: dataTableFeatures,
    columns: noteColumns,
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
        <ListSearchInput
          query={query}
          onQueryChange={setQuery}
          placeholder="Filter notes"
          ariaLabel="Filter notes in this Space"
        />
        <div className="flex-1">
          <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
        </div>
      </div>

      {data.length > 0 ? (
        <PageSummaryTable table={table} spaceId={spaceId} groups={groups} />
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
