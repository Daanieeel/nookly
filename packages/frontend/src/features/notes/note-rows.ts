import type { Label, PageSummary } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { notePreviewText } from "./note-preview";

export interface NoteRow {
  summary: PageSummary;
  title: string;
  preview: string;
  labels: Label[];
}

/// The table rows of Notes, each with its title, preview and the labels it carries.
export function toNoteRows(summaries: PageSummary[], spaceLabels: Label[]): NoteRow[] {
  const labelsById = new Map(spaceLabels.map((l) => [l.id, l]));
  return summaries.map((summary) => ({
    summary,
    title: displayTitle(summary.entity),
    preview: notePreviewText(summary.preview, summary.entity.title),
    labels: summary.labelIds.flatMap((id) => labelsById.get(id) ?? []),
  }));
}
