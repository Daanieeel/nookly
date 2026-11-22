import {
  type NoteGroupBy,
  type NoteGrouping,
  NO_COURSE_GROUP,
  PINNED_GROUP,
  continueNotes as continueBy,
  groupNotes as groupBy,
  noteGroupId as groupIdBy,
} from "@nookly/shared/note-groups";
import { displayTitle } from "#/lib/entity-title.ts";
import type { NoteRow } from "./NotesListView";

export { NO_COURSE_GROUP, PINNED_GROUP };

export interface NoteGroup {
  id: string;
  name: string;
  rows: NoteRow[];
}

const BY: NoteGrouping<NoteRow> = {
  pinned: (row) => row.summary.entity.pinned,
  courses: (row) =>
    row.summary.courses.map((course) => ({ id: course.id, title: displayTitle(course) })),
  labels: (row) => row.labels.map((label) => ({ id: label.id, title: label.name })),
  edited: (row) => row.summary.lastEditedAt,
};

/// The group a Note sits in: Pinned wins, then its first Course, else none.
export const noteGroupId = (row: NoteRow, groupBy?: NoteGroupBy): string =>
  groupIdBy(row, BY, groupBy);

/// Pinned first, then one group per Course (or label, or age) by name, then the rest; the same
/// grouping as the phone's (`@nookly/shared/note-groups`).
export const groupNotes = (rows: NoteRow[], by?: NoteGroupBy): NoteGroup[] =>
  groupBy(rows, BY, { groupBy: by }).map(({ id, name, notes }) => ({ id, name, rows: notes }));

/// The Notes to pick up again: the latest edits, newest first.
export const continueNotes = (rows: NoteRow[], limit = 4): NoteRow[] => continueBy(rows, BY, limit);
