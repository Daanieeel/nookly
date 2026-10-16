import { type SortingState, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { Label, PageSummary } from "#/lib/api/types.ts";
import { dataTableFeatures } from "#/lib/table-features.ts";
import { noteColumns, toNoteRows } from "./NotesListView";
import { PageSummaryTable } from "./list-table-shared";

/// Newest edit first, whatever the Notes page is sorted by.
const BY_RECENCY: SortingState = [{ id: "edited", desc: true }];

/// A few Notes as the Notes page draws them, most recently edited on top, for a page that
/// rolls Notes up (a Course page).
export function RecentNotesTable({
  summaries,
  labels,
  spaceId,
  limit,
}: {
  summaries: PageSummary[];
  labels: Label[];
  spaceId: string;
  limit: number;
}) {
  const data = useMemo(() => {
    const recent = [...summaries]
      .sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt))
      .slice(0, limit);
    return toNoteRows(recent, labels);
  }, [summaries, labels, limit]);

  const table = useTable({
    features: dataTableFeatures,
    columns: noteColumns,
    data,
    getRowId: (row) => row.summary.entity.id,
    state: { sorting: BY_RECENCY },
    enableMultiSort: false,
  });
  return <PageSummaryTable table={table} spaceId={spaceId} />;
}
