import { IconLink, IconSchool } from "@tabler/icons-react";
import type { ActiveFilter, FilterField } from "#/components/filter-menu.tsx";
import type { Label, PageSummary } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import {
  EDITED_FILTER_FIELD,
  editedWindows,
  labelFilterField,
  passesValueFilters,
} from "./list-table-shared";
import { notePreviewText, previewLines } from "./note-preview";

/// The rows of the Jots table and what they are filtered by, shared by the Jots page and
/// the view engine's Jot source.

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

export function toJotRows(summaries: PageSummary[], spaceLabels: Label[]): JotRow[] {
  const labelsById = new Map(spaceLabels.map((l) => [l.id, l]));
  return summaries.map((s) => toRow(s, labelsById));
}

/// The values a Jot has under a filter field. Labels and the edited windows can hold
/// several at once, so filters test membership.
export function jotFilterValue(row: JotRow, fieldId: string, now: number): string | string[] {
  switch (fieldId) {
    case "link":
      return row.refined ? "linked" : "unlinked";
    case "edited":
      return editedWindows(row.summary, now);
    case "labels":
      return row.labels.map((l) => l.id);
    case "course":
      return row.summary.session?.courseId ?? [];
    default:
      return [];
  }
}

export function passesJotFilters(row: JotRow, filters: ActiveFilter[], now: number): boolean {
  return passesValueFilters(row, filters, (r, fieldId) => jotFilterValue(r, fieldId, now));
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

export function jotFilterFields(rows: JotRow[], spaceLabels: Label[]): FilterField[] {
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
}
