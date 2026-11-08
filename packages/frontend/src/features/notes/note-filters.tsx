import { IconPin, IconSchool } from "@tabler/icons-react";
import {
  type ActiveFilter,
  entityFilterOption,
  type FilterField,
} from "#/components/filter-menu.tsx";
import type { Entity, Label } from "#/lib/api/types.ts";
import { ageBucket } from "#/features/assignments/assignment-model.ts";
import { CREATED_FILTER_FIELD } from "#/features/tasks/shared-view-defs.tsx";
import {
  EDITED_FILTER_FIELD,
  editedWindows,
  labelFilterField,
  passesValueFilters,
} from "./list-table-shared";
import type { NoteRow } from "./note-rows";

const PINNED_FILTER_FIELD: FilterField = {
  id: "pinned",
  label: "Pinned",
  icon: IconPin,
  options: [
    { value: "pinned", label: "Pinned" },
    { value: "unpinned", label: "Not pinned" },
  ],
};

/// The values a Note has under a filter field. Labels, Courses and the edited windows
/// can hold several at once, so filters test membership.
export function noteFilterValue(row: NoteRow, fieldId: string, now: number): string | string[] {
  const { entity } = row.summary;
  switch (fieldId) {
    case "course":
      return row.summary.courses.map((c) => c.id);
    case "labels":
      return row.labels.map((l) => l.id);
    case "pinned":
      return entity.pinned ? "pinned" : "unpinned";
    case "edited":
      return editedWindows(row.summary, now);
    case "created":
      return ageBucket(entity.createdAt, new Date(now));
    default:
      return [];
  }
}

export function passesNoteFilters(row: NoteRow, filters: ActiveFilter[], now: number): boolean {
  return passesValueFilters(row, filters, (r, fieldId) => noteFilterValue(r, fieldId, now));
}

/// Course and Labels are offered only when some Note carries one; Pinned and the
/// dates always are.
export function noteFilterFields(rows: NoteRow[], spaceLabels: Label[]): FilterField[] {
  const fields: FilterField[] = [];
  const courses = new Map<string, Entity>();
  for (const r of rows) {
    for (const c of r.summary.courses) courses.set(c.id, c);
  }
  if (courses.size > 0) {
    fields.push({
      id: "course",
      label: "Course",
      icon: IconSchool,
      options: [...courses.values()].map(entityFilterOption),
    });
  }
  const labels = labelFilterField(spaceLabels, rows);
  if (labels) fields.push(labels);
  return [...fields, PINNED_FILTER_FIELD, EDITED_FILTER_FIELD, CREATED_FILTER_FIELD];
}
