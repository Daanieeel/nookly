import { useShortcut } from "#/hooks/use-shortcut.ts";
import { displayText } from "#/lib/shortcuts.ts";
import { qk } from "#/lib/query-keys.ts";
import {
  IconArrowRight,
  IconCalendarEvent,
  IconFeather,
  IconFileText,
  IconInbox,
  IconLink,
  IconPlus,
  IconSchool,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ColumnDef,
  functionalUpdate,
  type SortingState,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import type { DataTableGroup } from "#/components/data-table/data-table.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { type ActiveFilter, type FilterField } from "#/components/filter-menu.tsx";
import { ScrollingListPage } from "#/components/scrolling-list-page.tsx";
import { useQuickFilters } from "#/lib/quick-filters.ts";
import { NoMatchesNotice } from "#/components/module-view-header.tsx";
import { Button } from "@nookly/ui/components/button";
import {} from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { listLabels } from "#/lib/api/labels.ts";
import { listJotSummaries } from "#/lib/api/notes.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity, Label, PageSummary, SessionContext, Space } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import {} from "#/lib/relative-time.ts";
import {} from "#/lib/entity-key.ts";
import { pendingFilters } from "#/features/views/pending-filters.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { type DataTableFeatures, dataTableFeatures } from "#/lib/table-features.ts";
import { cn } from "@nookly/ui/lib/utils";
import {
  EDITED_FILTER_FIELD,
  editedColumn,
  editedWithin,
  labelsColumn,
  labelFilterField,
  ListFilterToolbar,
  PageSummaryTable,
  matchesQuery,
  passesRowFilters,
  readStoredSorting,
  titleColumn,
  writeStoredSorting,
} from "./list-table-shared";
import { prefetchBlocks } from "./blocks-query";
import { refineJotIntoNote } from "./refine-jot";
import { keyColumn } from "./key-column";
import { notePreviewText, previewLines } from "./note-preview";
import { formatClock, formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { preferences } from "#/lib/preferences.ts";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";

export interface JotRow {
  summary: PageSummary;
  /// What the Title column shows. An untitled Jot shows its first line instead, and
  /// an empty one shows nothing rather than a made up title.
  title: string;
  titled: boolean;
  preview: string;
  labels: Label[];
  /// Linked to a live (not trashed) Note, i.e. refined into it.
  refined: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

const readSorting = () => readStoredSorting(STORAGE_KEYS.jotsSort);
const writeSorting = (sorting: SortingState) => writeStoredSorting(STORAGE_KEYS.jotsSort, sorting);

/// Whether `row` carries `value` for a filter field. Fields like labels or the edited
/// window can hold several values at once, so filters test membership, not equality.
function rowHas(row: JotRow, fieldId: string, value: string, now: number): boolean {
  switch (fieldId) {
    case "link":
      return row.refined === (value === "linked");
    case "edited":
      return editedWithin(row.summary, value, now);
    case "labels":
      return row.labels.some((l) => l.id === value);
    case "course":
      return row.summary.session?.courseId === value;
    default:
      return false;
  }
}

function passesFilters(row: JotRow, filters: ActiveFilter[], now: number): boolean {
  return passesRowFilters(row, filters, (r, fieldId, value) => rowHas(r, fieldId, value, now));
}

interface Preset {
  id: string;
  label: string;
  icon: TablerIcon;
  filters: ActiveFilter[];
}

/// The two states of the inbox. It opens on the Jots still to refine; Show refined adds the
/// refined ones, grouped under the rest. While the filters are exactly one of these the chip
/// row stays hidden, and it shows as soon as a filter is added.
const PRESETS: Preset[] = [
  {
    id: "unrefined",
    label: "Unrefined",
    icon: IconInbox,
    filters: [{ fieldId: "link", operator: "is", values: ["unlinked"] }],
  },
  { id: "all", label: "Show refined", icon: IconFileText, filters: [] },
];

function filterKey(filters: ActiveFilter[]): string {
  return filters
    .map((f) => `${f.fieldId}:${f.operator}:${f.join ?? "and"}:${[...f.values].sort().join(",")}`)
    .sort()
    .join("|");
}

const PRESET_BY_KEY = new Map(PRESETS.map((p) => [filterKey(p.filters), p.id]));
const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/// With the refined Jots shown they sit under the ones still to refine, in a quieter group.
const REFINED_GROUPS: DataTableGroup<JotRow>[] = [
  { id: "todo", label: "To refine", match: (r) => !r.refined },
  { id: "refined", label: "Refined", match: () => true },
];

/// The Jots still to refine, which the Dashboard opens the page on.
export const UNREFINED_JOT_FILTERS: ActiveFilter[] = [
  { fieldId: "link", operator: "is", values: ["unlinked"] },
];

/// What the page opens with: filters another page asked for this visit (the Dashboard's
/// Jots links), else the last picked preset's filters, so it reopens on the same view.
export function initialJotFilters(): ActiveFilter[] {
  const requested = pendingFilters(STORAGE_KEYS.jotsPreset);
  if (requested) return requested;
  const id = preferences.get(STORAGE_KEYS.jotsPreset);
  return (PRESETS.find((p) => p.id === id) ?? PRESETS[0])?.filters ?? [];
}

/// Fields every row can be filtered by; Labels and Course join them when in use.
const BASE_FILTER_FIELDS: FilterField[] = [
  {
    id: "link",
    label: "Note",
    icon: IconLink,
    options: [
      { value: "linked", label: "Refined into a Note" },
      { value: "unlinked", label: "Not refined yet" },
    ],
  },
  EDITED_FILTER_FIELD,
];

export function toRow(summary: PageSummary, labelsById: Map<string, Label>): JotRow {
  const { entity } = summary;
  const labels = summary.labelIds.flatMap((id) => labelsById.get(id) ?? []);
  const refined = summary.linked.some((e) => !e.deletedAt);
  const base = { summary, labels, refined };
  if (entity.title.trim()) {
    const title = displayTitle(entity);
    return { ...base, title, titled: true, preview: notePreviewText(summary.preview, title) };
  }
  // An untitled Jot reads by its content: first line as the title, the rest as preview.
  const [first = "", ...rest] = previewLines(summary.preview);
  return { ...base, title: first, titled: false, preview: rest.join(" ") };
}

/// "Mon 10:00" within the past or coming week, "Sep 14 10:00" otherwise.
function formatSessionWhen(session: SessionContext, now = new Date()): string {
  const date = new Date(`${session.date}T00:00`);
  const near = Math.abs(now.getTime() - date.getTime()) < 6 * DAY;
  const day = near ? formatWeekday(session.date, "short") : formatShortDate(session.date, now);
  return `${day} ${formatClock(session.startTime.slice(0, 5))}`;
}

/// Jots as a data table (docs/skills/data-tables.md, client mode). A Jot is refined by
/// linking it to the Note it grew into; presets over the filter row split the two
/// states, with "Unrefined" (the capture inbox) selected on arrival.
export function JotsListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const setQuickJotOpen = useNavStore((s) => s.setQuickJotOpen);
  const jotKey = useShortcut("quickJot");
  useCreateShortcut(() => setQuickJotOpen(true));
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>(initialJotFilters);
  const quick = useQuickFilters(`${STORAGE_KEYS.jotsQuickFilters}:${spaceId}`);
  const [sorting, setSorting] = useState<SortingState>(readSorting);

  // Nested under ["entities", spaceId] so every rename/pin/trash invalidation refreshes it.
  const { data: summaries = [], isPending } = useQuery({
    queryKey: qk.entities.jotSummaries(spaceId),
    queryFn: () => listJotSummaries(spaceId),
  });
  const { data: spaceLabels = [] } = useQuery({
    queryKey: qk.labels.bySpace(spaceId),
    queryFn: () => listLabels(spaceId),
  });
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });

  const rows = useMemo<JotRow[]>(() => {
    const labelsById = new Map(spaceLabels.map((l) => [l.id, l]));
    return summaries.map((s) => toRow(s, labelsById));
  }, [summaries, spaceLabels]);

  const filterFields = useMemo<FilterField[]>(() => {
    const fields = [...BASE_FILTER_FIELDS];
    const labels = labelFilterField(spaceLabels, rows);
    if (labels) fields.push(labels);
    const courses = new Map<string, string>();
    for (const r of rows) {
      const s = r.summary.session;
      if (s?.courseId) courses.set(s.courseId, s.courseTitle ?? "Untitled Course");
    }
    if (courses.size > 0) {
      fields.push({
        id: "course",
        label: "Course",
        icon: IconSchool,
        options: [...courses].map(([value, label]) => ({ value, label })),
      });
    }
    return fields;
  }, [spaceLabels, rows]);

  // Time windows ("Past 7 days") are measured from the latest load, not every render.
  const now = useMemo(() => Date.now(), [summaries]);
  const refinedCount = useMemo(() => rows.filter((r) => r.refined).length, [rows]);
  const activePreset = PRESET_BY_KEY.get(filterKey(filters));
  const showingRefined = activePreset === "all";

  const needle = query.trim().toLowerCase();
  const data = useMemo(
    () => rows.filter((r) => matchesQuery(r, needle, query) && passesFilters(r, filters, now)),
    [rows, needle, filters, now],
  );

  const showPreview = data.some((r) => r.preview);
  const showSession = data.some((r) => r.summary.session);
  const columns = useMemo(
    () => buildColumns({ spaceId, spaces, queryClient, openEntity, showPreview, showSession }),
    [spaceId, spaces, queryClient, openEntity, showPreview, showSession],
  );

  const onSortingChange = (updater: Updater<SortingState>) => {
    const next = functionalUpdate(updater, sorting);
    setSorting(next);
    writeSorting(next);
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

  const newJotButton = (
    <Button variant="default" size="sm" className="gap-1.5" onClick={() => setQuickJotOpen(true)}>
      <IconPlus size={14} />
      New Jot
    </Button>
  );

  if (!isPending && rows.length === 0) {
    return (
      <div
        className="flex w-full flex-col gap-4 p-6"
        {...contextTarget("module-view", {
          spaceId,
          createLabel: "New Jot",
          create: () => setQuickJotOpen(true),
        })}
      >
        <h1 className="text-lg font-semibold">Jots</h1>
        <EmptyState
          icon={IconFeather}
          title="Nothing captured yet"
          description={
            jotKey
              ? `Press ${displayText(jotKey)} anywhere to jot a thought down. Refine it into a Note later.`
              : "Jot a thought down from anywhere. Refine it into a Note later."
          }
          action={{ label: "New Jot", onClick: () => setQuickJotOpen(true) }}
        />
      </div>
    );
  }

  return (
    <ScrollingListPage
      ready={!isPending}
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Jot",
        create: () => setQuickJotOpen(true),
      })}
      top={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto flex items-baseline gap-2 text-lg font-semibold">
              Jots
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                {rows.length}
              </span>
            </h1>
            {newJotButton}
          </div>

          <ListFilterToolbar
            afterSearch={
              <Button
                variant={showingRefined ? "default" : "ghost"}
                size="sm"
                aria-pressed={showingRefined}
                className="gap-1.5"
                onClick={() => {
                  const next = PRESET_BY_ID.get(showingRefined ? "unrefined" : "all");
                  if (!next) return;
                  setFilters(next.filters);
                  preferences.set(STORAGE_KEYS.jotsPreset, next.id);
                }}
              >
                <IconFileText size={14} />
                {showingRefined ? "Hide refined" : "Show refined"}
                {/* Muted on the quiet button; on the filled one it keeps the button's own text colour. */}
                <span
                  className={cn("text-xs tabular-nums", !showingRefined && "text-muted-foreground")}
                >
                  {refinedCount}
                </span>
              </Button>
            }
            hideChips={activePreset !== undefined}
            query={query}
            onQueryChange={setQuery}
            placeholder="Filter Jots"
            ariaLabel="Filter Jots in this Space"
            fields={filterFields}
            filters={filters}
            onFiltersChange={setFilters}
            quick={quick}
          />
        </>
      }
    >
      {data.length > 0 ? (
        <PageSummaryTable
          table={table}
          spaceId={spaceId}
          scrollX={false}
          groups={showingRefined ? REFINED_GROUPS : undefined}
          onRowKeyDown={(e, row) => {
            if (e.key.toLowerCase() !== "r" || e.metaKey || e.ctrlKey || e.altKey) return;
            if (row.refined || row.summary.entity.deletedAt) return;
            e.preventDefault();
            void refineJotIntoNote(row.summary.entity, queryClient);
          }}
        />
      ) : (
        !isPending && (
          <NoMatchesNotice
            text={
              activePreset === "unrefined" && !needle
                ? "Every Jot is refined into a Note. Nothing left to refine."
                : "Nothing matches this filter."
            }
            onClear={() => {
              setQuery("");
              setFilters([]);
            }}
          />
        )
      )}
    </ScrollingListPage>
  );
}

export function buildColumns({
  spaceId,
  spaces,
  queryClient,
  openEntity,
  showPreview = true,
  showSession = true,
}: {
  spaceId: string;
  spaces: Space[];
  queryClient: QueryClient;
  openEntity: (entityId: string, spaceId: string) => void;
  /// Columns nothing in the list fills are left out instead of showing empty space.
  showPreview?: boolean;
  showSession?: boolean;
}): ColumnDef<DataTableFeatures, JotRow>[] {
  const open = (entity: Entity) => (e: MouseEvent) => {
    // The row itself opens on click too; this chip opens something else.
    e.stopPropagation();
    openEntity(entity.id, entity.spaceId);
  };
  const prefetch = (entity: Entity) => () => prefetchBlocks(queryClient, entity.id);

  const columns: ColumnDef<DataTableFeatures, JotRow>[] = [
    keyColumn<JotRow>(),
    titleColumn<JotRow>(TitleCell),
    {
      id: "preview",
      accessorFn: (row) => row.preview,
      header: "Preview",
      cell: ({ row }) =>
        row.original.preview ? (
          <span className="block truncate text-muted-foreground">{row.original.preview}</span>
        ) : null,
      enableSorting: false,
      meta: { label: "Preview", width: "fill", hideBelow: "md" },
    },
    {
      id: "linked",
      header: "Note",
      cell: ({ row }) => {
        const [first, ...rest] = row.original.summary.linked;
        if (!first) return <RefineAction jot={row.original.summary.entity} />;
        const otherSpace =
          first.spaceId !== spaceId ? spaces.find((s) => s.id === first.spaceId) : undefined;
        return (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={open(first)}
                  onMouseEnter={prefetch(first)}
                  className={cn(
                    "flex h-6 max-w-44 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
                    first.deletedAt && "opacity-50",
                  )}
                >
                  <EntityIcon entity={first} size={12} className="shrink-0" />
                  <span className="truncate">{displayTitle(first)}</span>
                  {otherSpace && (
                    <span className="shrink-0 text-muted-foreground/70">in {otherSpace.name}</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>Open Note</TooltipContent>
            </Tooltip>
            {rest.length > 0 && (
              <span className="text-xs text-muted-foreground">+{rest.length}</span>
            )}
          </div>
        );
      },
      enableSorting: false,
      meta: { label: "Note", width: "fit", hideBelow: "md" },
    },
    {
      id: "session",
      header: "Session",
      cell: ({ row }) => {
        const session = row.original.summary.session;
        if (!session) return null;
        const name = session.courseTitle ?? displayTitle(session.entity);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={open(session.entity)}
                className={cn(
                  "flex h-6 max-w-52 items-center gap-1.5 rounded-sm border border-border px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
                  session.entity.deletedAt && "opacity-50",
                )}
              >
                <IconCalendarEvent size={12} className="shrink-0" />
                <span className="truncate">{name}</span>
                <span className="shrink-0 tabular-nums">· {formatSessionWhen(session)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Open Session</TooltipContent>
          </Tooltip>
        );
      },
      enableSorting: false,
      meta: { label: "Session", width: "fit", hideBelow: "lg" },
    },
    labelsColumn<JotRow>(),
    editedColumn<JotRow>(),
  ];
  return columns.filter(
    (c) => (c.id !== "preview" || showPreview) && (c.id !== "session" || showSession),
  );
}

/// The way out of the inbox: shows on the row's hover or focus, and `R` does the same
/// on a focused row. Creates the Note and opens it beside the Jot.
function RefineAction({ jot }: { jot: Entity }) {
  const queryClient = useQueryClient();
  const refine = useMutation({ mutationFn: () => refineJotIntoNote(jot, queryClient) });
  if (jot.deletedAt) return null;
  return (
    <div className="w-fit opacity-0 focus-within:opacity-100 [tr:focus-visible_&]:opacity-100 [tr:hover_&]:opacity-100">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1.5 px-1.5 text-xs"
            disabled={refine.isPending}
            onClick={(e) => {
              e.stopPropagation();
              refine.mutate();
            }}
          >
            <IconArrowRight size={12} />
            Refine
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Refine into New Note <kbd className="ml-1 font-sans">R</kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function TitleCell({ row }: { row: JotRow }) {
  const { entity } = row.summary;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <EntityIcon entity={entity} size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        {row.title ? (
          <span className={cn("truncate", row.titled && "font-medium")}>{row.title}</span>
        ) : (
          <span className="text-muted-foreground/60 italic">Nothing written yet</span>
        )}
        {/* The preview column is hidden at narrow widths, so the title carries it instead. */}
        {row.preview && (
          <span className="truncate text-xs text-muted-foreground @lg:hidden">{row.preview}</span>
        )}
      </div>
    </div>
  );
}
