import { IconPin, IconSchool, IconTag } from "@tabler/icons-react";
import {
  type ActiveFilter,
  entityFilterOption,
  type FilterField,
} from "#/components/filter-menu.tsx";
import { LabelDot } from "#/components/label-chip.tsx";
import type { Entity, Label } from "#/lib/api/types.ts";
import { ageBucket } from "#/features/assignments/assignment-model.ts";
import { CREATED_FILTER_FIELD } from "#/features/tasks/shared-view-defs.tsx";
import { EDITED_FILTER_FIELD, editedWithin, passesRowFilters } from "./list-table-shared";
import type { NoteRow } from "./NotesListView";

const PINNED_FILTER_FIELD: FilterField = {
  id: "pinned",
  label: "Pinned",
  icon: IconPin,
  options: [
    { value: "pinned", label: "Pinned" },
    { value: "unpinned", label: "Not pinned" },
  ],
};

/// Whether `row` carries `value` for a filter field. Labels and Courses can hold
/// several values at once, so filters test membership, not equality.
function noteHas(row: NoteRow, fieldId: string, value: string, now: number): boolean {
  const { entity } = row.summary;
  switch (fieldId) {
    case "course":
      return row.summary.courses.some((c) => c.id === value);
    case "labels":
      return row.labels.some((l) => l.id === value);
    case "pinned":
      return entity.pinned === (value === "pinned");
    case "edited":
      return editedWithin(row.summary, value, now);
    case "created":
      return ageBucket(entity.createdAt, new Date(now)) === value;
    default:
      return false;
  }
}

export function passesNoteFilters(row: NoteRow, filters: ActiveFilter[], now: number): boolean {
  return passesRowFilters(row, filters, (r, fieldId, value) => noteHas(r, fieldId, value, now));
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
  return [...fields, PINNED_FILTER_FIELD, EDITED_FILTER_FIELD, CREATED_FILTER_FIELD];
}
