import { IconFeather, IconNotes } from "@tabler/icons-react";
import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { EntityIcon } from "#/components/entity-icon.tsx";
import {
  type JotRow,
  jotFilterFields,
  jotFilterValue,
  toJotRows,
} from "#/features/notes/jot-rows.tsx";
import { noteFilterFields, noteFilterValue } from "#/features/notes/note-filters.tsx";
import { type NoteRow, toNoteRows } from "#/features/notes/note-rows.ts";
import { listLabels } from "#/lib/api/labels.ts";
import { listJotSummaries, listNoteSummaries } from "#/lib/api/notes.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Label, PageSummary } from "#/lib/api/types.ts";
import { formatDateTime } from "#/lib/datetime.ts";
import { qk } from "#/lib/query-keys.ts";
import { formatEditedAt } from "#/lib/relative-time.ts";
import {
  type BaseContext,
  keyField,
  labelsField,
  relatedField,
  spaceField,
  timestampField,
} from "../fields.tsx";
import type { ViewField, ViewSource } from "../types.ts";

/// Notes and Jots, as the view engine shows them. The fields mirror `NOTE_FIELDS` and
/// `JOT_FIELDS` in `src-tauri/src/db/views.rs`, and the option filters are the ones the
/// Notes and Jots pages offer.

export interface PageContext extends BaseContext {
  labels: Label[];
  /// When the "Last edited" windows are measured from: the latest load.
  now: number;
}

type PageRow = NoteRow | JotRow;

const entityOf = (row: PageRow) => row.summary.entity;

function pageFields<R extends PageRow>(): ViewField<R, PageContext>[] {
  return [
    keyField(entityOf),
    {
      id: "title",
      label: "Title",
      kind: "text",
      value: (row) => row.title || null,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <EntityIcon
            entity={row.summary.entity}
            size={14}
            className="shrink-0 text-muted-foreground"
          />
          {row.title ? (
            <span className="truncate">{row.title}</span>
          ) : (
            <span className="text-muted-foreground/60 italic">Nothing written yet</span>
          )}
        </span>
      ),
    },
    {
      id: "preview",
      label: "Preview",
      kind: "text",
      value: (row) => row.preview || null,
      cell: (row) => <span className="truncate text-muted-foreground">{row.preview}</span>,
    },
    labelsField(
      (row) => row.summary.labelIds,
      (row) => row.labels,
    ),
  ];
}

/// When the page was last written in, which every Notes and Jots table shows.
const editedField: ViewField<PageRow, PageContext> = {
  id: "edited",
  label: "Last edited",
  kind: "date",
  fit: true,
  value: (row) => row.summary.lastEditedAt,
  cell: (row) => (
    <time
      dateTime={row.summary.lastEditedAt}
      title={formatDateTime(row.summary.lastEditedAt)}
      className="text-xs text-muted-foreground tabular-nums"
    >
      {formatEditedAt(row.summary.lastEditedAt)}
    </time>
  ),
};

const commonTail: ViewField<PageRow, PageContext>[] = [
  editedField,
  spaceField(entityOf),
  timestampField("created", entityOf),
  timestampField("updated", entityOf),
];

export const NOTE_FIELDS: ViewField<NoteRow, PageContext>[] = [
  ...pageFields<NoteRow>(),
  relatedField({
    id: "course",
    label: "Course",
    // Linked to the Course directly, or written for one of its Sessions.
    relationship: "course-notes",
    lookup: (row: NoteRow) => row.summary.courses,
  }),
  {
    id: "pinned",
    label: "Pinned",
    kind: "enum",
    fit: true,
    value: (row) => (row.summary.entity.pinned ? "pinned" : "unpinned"),
    text: (row) => (row.summary.entity.pinned ? "Pinned" : "Not pinned"),
  },
  ...commonTail,
];

export const JOT_FIELDS: ViewField<JotRow, PageContext>[] = [
  ...pageFields<JotRow>(),
  relatedField({
    id: "linked",
    label: "Refined into",
    relationship: "relates-to",
    lookup: (row: JotRow) => row.summary.linked.filter((e) => !e.deletedAt),
  }),
  relatedField({
    id: "session",
    label: "Session",
    relationship: "relates-to",
    lookup: (row: JotRow) => (row.summary.session ? [row.summary.session.entity] : []),
  }),
  {
    id: "course",
    label: "Course",
    kind: "entity",
    value: (row) => (row.summary.session?.courseId ? [row.summary.session.courseId] : []),
    text: (row) => row.summary.session?.courseTitle ?? "",
  },
  ...commonTail,
];

const combineSummaries = (results: UseQueryResult<PageSummary[]>[]) => ({
  data: results.flatMap((r) => r.data ?? []),
  isPending: results.some((r) => r.isPending),
});

/// A Space's Notes or Jots (every Space's for `null`), turned into the rows the pages show.
function usePageData<R extends PageRow>(
  spaceId: string | null,
  kind: "note" | "jot",
  toRows: (summaries: PageSummary[], labels: Label[]) => R[],
) {
  const spacesQuery = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaces = useMemo(() => spacesQuery.data ?? [], [spacesQuery.data]);
  const spaceIds = spaceId ? [spaceId] : spaces.map((s) => s.id);
  const summaries = useQueries({
    queries: spaceIds.map((id) =>
      kind === "note"
        ? { queryKey: qk.entities.noteSummaries(id), queryFn: () => listNoteSummaries(id) }
        : { queryKey: qk.entities.jotSummaries(id), queryFn: () => listJotSummaries(id) },
    ),
    combine: combineSummaries,
  });
  // Labels belong to one Space, so a cross-Space view goes without them, like Tasks.
  const { data: labels = [] } = useQuery({
    queryKey: qk.labels.bySpace(spaceId ?? ""),
    queryFn: () => listLabels(spaceId ?? ""),
    enabled: !!spaceId,
  });
  const items = useMemo(() => toRows(summaries.data, labels), [toRows, summaries.data, labels]);
  const ctx = useMemo<PageContext>(
    () => ({ labels, spaces: new Map(spaces.map((s) => [s.id, s])), now: Date.now() }),
    // A new load moves the windows on, so `items` is a dependency on purpose.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [labels, spaces, items],
  );
  const isPending = summaries.isPending || (!spaceId && spacesQuery.isPending);
  return { items, ctx, isPending };
}

function useNoteData(spaceId: string | null) {
  return usePageData(spaceId, "note", toNoteRows);
}

function useJotData(spaceId: string | null) {
  return usePageData(spaceId, "jot", toJotRows);
}

/// Last edited first, the way both pages open.
function byLastEdited<R extends PageRow>(rows: R[]): R[] {
  return [...rows].sort((a, b) => b.summary.lastEditedAt.localeCompare(a.summary.lastEditedAt));
}

export const noteSource: ViewSource<NoteRow, PageContext> = {
  type: "note",
  label: "Notes",
  itemLabel: "note",
  icon: IconNotes,
  entityOf,
  useData: useNoteData,
  fields: NOTE_FIELDS,
  filterFields: (ctx, rows) => noteFilterFields(rows, ctx.labels),
  filterValue: (row, fieldId, ctx) => noteFilterValue(row, fieldId, ctx.now),
  order: byLastEdited,
  defaultColumns: ["key", "title", "preview", "labels", "edited"],
};

export const jotSource: ViewSource<JotRow, PageContext> = {
  type: "jot",
  label: "Jots",
  itemLabel: "jot",
  icon: IconFeather,
  entityOf,
  useData: useJotData,
  fields: JOT_FIELDS,
  filterFields: (ctx, rows) => jotFilterFields(rows, ctx.labels),
  filterValue: (row, fieldId, ctx) => jotFilterValue(row, fieldId, ctx.now),
  order: byLastEdited,
  defaultColumns: ["key", "title", "preview", "linked", "session", "labels", "edited"],
};
