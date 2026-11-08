import { useShortcut } from "#/hooks/use-shortcut.ts";
import { displayText } from "#/lib/shortcuts.ts";
import { qk } from "#/lib/query-keys.ts";
import {
  IconCalendarEvent,
  IconCalendarWeek,
  IconFeather,
  IconFileText,
  IconInbox,
  IconLayoutList,
  IconPlus,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { contextTarget } from "#/components/context-menu/registry.ts";
import {} from "#/components/data-table/data-table-column-header.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import type { ActiveFilter } from "#/components/filter-menu.tsx";
import { ScrollingListPage } from "#/components/scrolling-list-page.tsx";
import { useQuickFilters } from "#/lib/quick-filters.ts";
import { Button } from "@nookly/ui/components/button";
import {} from "@nookly/ui/components/input";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { listLabels } from "#/lib/api/labels.ts";
import { listJotSummaries } from "#/lib/api/notes.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity, SessionContext, Space } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import {} from "#/lib/relative-time.ts";
import {} from "#/lib/entity-key.ts";
import { pendingFilters } from "#/features/views/pending-filters.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { type DataTableFeatures, dataTableFeatures } from "#/lib/table-features.ts";
import { cn } from "@nookly/ui/lib/utils";
import {
  editedColumn,
  labelsColumn,
  ListFilterToolbar,
  PageSummaryTable,
  matchesQuery,
  titleColumn,
} from "./list-table-shared";
import { type JotRow, jotFilterFields, passesJotFilters, toJotRows } from "./jot-rows";
import { PageViewTitle, usePageView } from "./use-page-view";
import { JOT_FIELDS } from "#/features/views/engine/sources/pages.tsx";
import { prefetchBlocks } from "./blocks-query";
import { keyColumn } from "./key-column";
import { formatClock, formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { preferences } from "#/lib/preferences.ts";
import { useCreateShortcut } from "#/hooks/use-create-shortcut.ts";

const DAY = 24 * 60 * 60 * 1000;

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
    .map((f) => `${f.fieldId}:${f.operator}:${f.join ?? "and"}:${[...f.values].sort().join(",")}`)
    .sort()
    .join("|");
}

const PRESET_BY_KEY = new Map(PRESETS.map((p) => [filterKey(p.filters), p.id]));

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
export function JotsListView({ spaceId, viewId }: { spaceId: string; viewId?: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const setQuickJotOpen = useNavStore((s) => s.setQuickJotOpen);
  const jotKey = useShortcut("quickJot");
  useCreateShortcut(() => setQuickJotOpen(true));
  const [query, setQuery] = useState("");
  const quick = useQuickFilters(`${STORAGE_KEYS.jotsQuickFilters}:${spaceId}`);

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

  const rows = useMemo(() => toJotRows(summaries, spaceLabels), [summaries, spaceLabels]);
  const filterFields = useMemo(() => jotFilterFields(rows, spaceLabels), [spaceLabels, rows]);

  // Time windows ("Past 7 days") are measured from the latest load, not every render.
  const now = useMemo(() => Date.now(), [summaries]);
  const fieldCtx = useMemo(
    () => ({ labels: spaceLabels, spaces: new Map(spaces.map((s) => [s.id, s])), now }),
    [spaceLabels, spaces, now],
  );
  const { view, filters, setFilters, sorting, onSortingChange, passes, conditionBar, saveBar } =
    usePageView({
      spaceId,
      module: "jots",
      viewId,
      sortKey: STORAGE_KEYS.jotsSort,
      initialFilters: initialJotFilters,
      fields: JOT_FIELDS,
      ctx: fieldCtx,
    });
  const presetCounts = useMemo(
    () =>
      new Map(
        PRESETS.map((p) => [p.id, rows.filter((r) => passesJotFilters(r, p.filters, now)).length]),
      ),
    [rows, now],
  );
  const activePreset = PRESET_BY_KEY.get(filterKey(filters));

  const needle = query.trim().toLowerCase();
  const data = rows.filter(
    (r) => matchesQuery(r, needle, query) && passesJotFilters(r, filters, now) && passes(r),
  );

  const columns = useMemo(
    () => buildColumns({ spaceId, spaces, queryClient, openEntity }),
    [spaceId, spaces, queryClient, openEntity],
  );

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
      <ShortcutKbd name="quickJot" />
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
      className="relative"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Jot",
        create: () => setQuickJotOpen(true),
      })}
      top={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PageViewTitle view={view} title="Jots" count={rows.length} />
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
                onClick={() => {
                  setFilters(preset.filters);
                  // On a View a preset is a change to it, not the page's own choice.
                  if (!view) preferences.set(STORAGE_KEYS.jotsPreset, preset.id);
                }}
              >
                <preset.icon size={14} />
                {preset.label}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {presetCounts.get(preset.id)}
                </span>
              </Button>
            ))}
          </div>

          <ListFilterToolbar
            query={query}
            onQueryChange={setQuery}
            placeholder="Filter Jots"
            ariaLabel="Filter Jots in this Space"
            fields={filterFields}
            filters={filters}
            onFiltersChange={setFilters}
            quick={quick}
            conditionBar={conditionBar}
          />
        </>
      }
    >
      {data.length > 0 ? (
        <PageSummaryTable table={table} spaceId={spaceId} scrollX={false} />
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
      {saveBar}
    </ScrollingListPage>
  );
}

export function buildColumns({
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
    labelsColumn<JotRow>(),
    editedColumn<JotRow>(),
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
          <span className="truncate text-xs text-muted-foreground @lg:hidden">{row.preview}</span>
        )}
      </div>
    </div>
  );
}
