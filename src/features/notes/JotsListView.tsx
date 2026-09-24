import {
  IconCalendarEvent,
  IconCalendarWeek,
  IconClock,
  IconFeather,
  IconFileText,
  IconInbox,
  IconLayoutList,
  IconLink,
  IconPlus,
  IconSchool,
  IconSearch,
  IconTag,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ColumnDef,
  functionalUpdate,
  type SortingState,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { type ActiveFilter, type FilterField, FilterMenu } from "@/components/filter-menu";
import { LabelChip, LabelDot } from "@/components/label-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listLabels } from "@/lib/api/labels";
import { listJotSummaries } from "@/lib/api/notes";
import { listSpaces } from "@/lib/api/spaces";
import type { Entity, Label, PageSummary, SessionContext, Space } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { formatEditedAt } from "@/lib/relative-time";
import { matchesKey } from "@/lib/entity-key";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useNavStore } from "@/lib/store/nav";
import { type DataTableFeatures, dataTableFeatures } from "@/lib/table-features";
import { cn } from "@/lib/utils";
import { prefetchBlocks } from "./blocks-query";
import { keyColumn } from "./key-column";
import { notePreviewText, previewLines } from "./note-preview";
import { formatClock, formatDateTime, formatShortDate, formatWeekday } from "@/lib/datetime";

interface JotRow {
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
const SORTABLE_COLUMNS = new Set(["key", "title", "edited"]);
const DEFAULT_SORTING: SortingState = [{ id: "edited", desc: true }];
const MAX_ROW_LABELS = 3;

/// Stored as `"<column>:<asc|desc>"`, e.g. `"edited:desc"`.
function readStoredSorting(): SortingState {
  try {
    const [id, dir] = (localStorage.getItem(STORAGE_KEYS.jotsSort) ?? "").split(":");
    if (SORTABLE_COLUMNS.has(id) && (dir === "asc" || dir === "desc")) {
      return [{ id, desc: dir === "desc" }];
    }
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return DEFAULT_SORTING;
}

function writeStoredSorting(sorting: SortingState) {
  try {
    const [first] = sorting;
    if (first) {
      localStorage.setItem(STORAGE_KEYS.jotsSort, `${first.id}:${first.desc ? "desc" : "asc"}`);
    } else {
      localStorage.removeItem(STORAGE_KEYS.jotsSort);
    }
  } catch {
    // Preference only; the table still works without it.
  }
}

const EDITED_WINDOWS = new Map([
  ["today", DAY],
  ["week", 7 * DAY],
  ["month", 30 * DAY],
]);

/// Whether `row` carries `value` for a filter field. Fields like labels or the edited
/// window can hold several values at once, so filters test membership, not equality.
function rowHas(row: JotRow, fieldId: string, value: string, now: number): boolean {
  switch (fieldId) {
    case "link":
      return row.refined === (value === "linked");
    case "edited": {
      const window = EDITED_WINDOWS.get(value);
      return window !== undefined && now - Date.parse(row.summary.lastEditedAt) < window;
    }
    case "labels":
      return row.labels.some((l) => l.id === value);
    case "course":
      return row.summary.session?.courseId === value;
    default:
      return false;
  }
}

/// "is" keeps rows matching any chosen value, "is not" keeps rows matching none.
function passesFilters(row: JotRow, filters: ActiveFilter[], now: number): boolean {
  return filters.every((f) => {
    const hit = f.values.some((v) => rowHas(row, f.fieldId, v, now));
    return f.operator === "is" ? hit : !hit;
  });
}

interface Preset {
  id: string;
  label: string;
  icon: TablerIcon;
  filters: ActiveFilter[];
}

/// One click views over the same table: each is just a saved filter set, so picking
/// one shows its chips in the filter row, ready to adjust.
const PRESETS: Preset[] = [
  {
    id: "unrefined",
    label: "Unrefined",
    icon: IconInbox,
    filters: [{ fieldId: "link", operator: "is", values: ["unlinked"] }],
  },
  {
    id: "refined",
    label: "Refined",
    icon: IconFileText,
    filters: [{ fieldId: "link", operator: "is", values: ["linked"] }],
  },
  {
    id: "week",
    label: "This week",
    icon: IconCalendarWeek,
    filters: [{ fieldId: "edited", operator: "is", values: ["week"] }],
  },
  { id: "all", label: "All", icon: IconLayoutList, filters: [] },
];

function filterKey(filters: ActiveFilter[]): string {
  return filters
    .map((f) => `${f.fieldId}:${f.operator}:${[...f.values].sort().join(",")}`)
    .sort()
    .join("|");
}

const PRESET_BY_KEY = new Map(PRESETS.map((p) => [filterKey(p.filters), p.id]));

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
  {
    id: "edited",
    label: "Last edited",
    icon: IconClock,
    options: [
      { value: "today", label: "Past day" },
      { value: "week", label: "Past 7 days" },
      { value: "month", label: "Past 30 days" },
    ],
  },
];

function toRow(summary: PageSummary, labelsById: Map<string, Label>): JotRow {
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
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilter[]>(PRESETS[0]?.filters ?? []);
  const [sorting, setSorting] = useState<SortingState>(readStoredSorting);

  // Nested under ["entities", spaceId] so every rename/pin/trash invalidation refreshes it.
  const { data: summaries = [], isPending } = useQuery({
    queryKey: ["entities", spaceId, "jot-summaries"],
    queryFn: () => listJotSummaries(spaceId),
  });
  const { data: spaceLabels = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  const rows = useMemo<JotRow[]>(() => {
    const labelsById = new Map(spaceLabels.map((l) => [l.id, l]));
    return summaries.map((s) => toRow(s, labelsById));
  }, [summaries, spaceLabels]);

  const filterFields = useMemo<FilterField[]>(() => {
    const fields = [...BASE_FILTER_FIELDS];
    const usedLabels = spaceLabels.filter((l) => rows.some((r) => r.labels.includes(l)));
    if (usedLabels.length > 0) {
      fields.push({
        id: "labels",
        label: "Labels",
        icon: IconTag,
        options: usedLabels.map((l) => ({
          value: l.id,
          label: l.name,
          icon: <LabelDot label={l} />,
        })),
      });
    }
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
  const presetCounts = useMemo(
    () =>
      new Map(
        PRESETS.map((p) => [p.id, rows.filter((r) => passesFilters(r, p.filters, now)).length]),
      ),
    [rows, now],
  );
  const activePreset = PRESET_BY_KEY.get(filterKey(filters));

  const needle = query.trim().toLowerCase();
  const data = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!needle ||
            r.title.toLowerCase().includes(needle) ||
            r.preview.toLowerCase().includes(needle) ||
            matchesKey(r.summary.entity.key, query)) &&
          passesFilters(r, filters, now),
      ),
    [rows, needle, filters, now],
  );

  const columns = useMemo(
    () => buildColumns({ spaceId, spaces, queryClient, openEntity }),
    [spaceId, spaces, queryClient, openEntity],
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

  const newJotButton = (
    <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setQuickJotOpen(true)}>
      <IconPlus size={14} />
      New Jot
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>J</Kbd>
      </KbdGroup>
    </Button>
  );

  if (!isPending && rows.length === 0) {
    return (
      <div
        className="flex w-full flex-col gap-4"
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
          description="Press ⌘J anywhere to jot a thought down. Refine it into a Note later."
          action={{ label: "New Jot", onClick: () => setQuickJotOpen(true) }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex w-full flex-col gap-3"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Jot",
        create: () => setQuickJotOpen(true),
      })}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto flex items-baseline gap-2 text-lg font-semibold">
          Jots
          <span className="text-sm font-normal text-muted-foreground tabular-nums">
            {rows.length}
          </span>
        </h1>
        {newJotButton}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant={activePreset === preset.id ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={activePreset === preset.id}
            className="gap-1.5"
            onClick={() => setFilters(preset.filters)}
          >
            <preset.icon size={14} />
            {preset.label}
            <span className="text-xs text-muted-foreground tabular-nums">
              {presetCounts.get(preset.id)}
            </span>
          </Button>
        ))}
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
            placeholder="Filter Jots"
            aria-label="Filter Jots in this Space"
            className="pl-8"
          />
        </div>
        <div className="flex-1">
          <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
        </div>
      </div>

      {data.length > 0 ? (
        <DataTable
          table={table}
          onRowClick={(row) => openEntity(row.summary.entity.id, spaceId)}
          onRowFocus={(row) => prefetchBlocks(queryClient, row.summary.entity.id)}
          rowContextTarget={(row) => entityTarget(row.summary.entity)}
        />
      ) : (
        !isPending && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {activePreset === "unrefined" && !needle
                ? "Every Jot is refined into a Note. Nothing left to refine."
                : "Nothing matches this filter."}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setFilters([]);
              }}
            >
              Show everything
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function buildColumns({
  spaceId,
  spaces,
  queryClient,
  openEntity,
}: {
  spaceId: string;
  spaces: Space[];
  queryClient: QueryClient;
  openEntity: (entityId: string, spaceId: string) => void;
}): ColumnDef<DataTableFeatures, JotRow>[] {
  const open = (entity: Entity) => (e: MouseEvent) => {
    // The row itself opens on click too; this chip opens something else.
    e.stopPropagation();
    openEntity(entity.id, entity.spaceId);
  };
  const prefetch = (entity: Entity) => () => prefetchBlocks(queryClient, entity.id);

  return [
    keyColumn<JotRow>(),
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
        ) : null,
      enableSorting: false,
      meta: { label: "Preview", width: "fill", hideBelow: "md" },
    },
    {
      id: "linked",
      header: "Refined into",
      cell: ({ row }) => {
        const [first, ...rest] = row.original.summary.linked;
        if (!first) return null;
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
      meta: { label: "Refined into", width: "fit", hideBelow: "md" },
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
