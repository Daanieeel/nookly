/// How the Notes pages group a list, the same on the desktop and the phone: by Course (the
/// default), label, when last edited, or not at all. Pinned notes come first, except when
/// not grouping.

export const PINNED_GROUP = "pinned";
export const NO_COURSE_GROUP = "no-course";
export const NO_LABEL_GROUP = "no-label";
export const ALL_GROUP = "all";

/// What the Notes page can group by.
export type NoteGroupBy = "course" | "label" | "edited" | "none";
export const NOTE_GROUP_BYS: { id: NoteGroupBy; label: string }[] = [
  { id: "course", label: "Course" },
  { id: "label", label: "Label" },
  { id: "edited", label: "Last edited" },
  { id: "none", label: "None" },
];

/// What grouping needs of a note, however the page holds it.
export interface NoteGrouping<T> {
  pinned: (note: T) => boolean;
  /// The Courses it belongs to; a note of several sits under the first.
  courses: (note: T) => { id: string; title: string }[];
  /// The labels it carries; a note of several sits under the first by name.
  labels: (note: T) => { id: string; title: string }[];
  /// When it was last edited, as sortable text (an ISO time).
  edited: (note: T) => string;
}

export interface NoteGroup<T> {
  id: string;
  name: string;
  notes: T[];
}

const DAY = 86_400_000;
/// The "last edited" groups, newest first: how many days back each reaches.
const AGES = [
  { id: "today", name: "Today", days: 1 },
  { id: "week", name: "Past 7 days", days: 7 },
  { id: "month", name: "Past 30 days", days: 30 },
  { id: "older", name: "Older", days: Infinity },
];

const byName = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

/// The one place of a note in the grouping, its group's id: Pinned wins (when grouping),
/// then its first Course or label, else the group of none.
export function noteGroupId<T>(
  note: T,
  by: NoteGrouping<T>,
  groupBy: NoteGroupBy = "course",
  now: Date = new Date(),
): string {
  if (groupBy === "none") return ALL_GROUP;
  if (by.pinned(note)) return PINNED_GROUP;
  if (groupBy === "course") return by.courses(note)[0]?.id ?? NO_COURSE_GROUP;
  if (groupBy === "label") return [...by.labels(note)].sort(byName)[0]?.id ?? NO_LABEL_GROUP;
  const age = now.getTime() - new Date(by.edited(note)).getTime();
  return (AGES.find((a) => age < a.days * DAY) ?? AGES[AGES.length - 1])?.id ?? "older";
}

/// The groups for `groupBy`, in order, each with the notes that sit in it. Within a group
/// the latest edit comes first, unless `keepOrder` says the list is already in the order the
/// page was asked for. A list with only the group of none is one group, "All notes".
export function groupNotes<T>(
  notes: T[],
  by: NoteGrouping<T>,
  {
    keepOrder = false,
    groupBy = "course",
    now = new Date(),
  }: { keepOrder?: boolean; groupBy?: NoteGroupBy; now?: Date } = {},
): NoteGroup<T>[] {
  const named = new Map<string, string>();
  for (const note of notes) {
    const first =
      groupBy === "course"
        ? by.courses(note)[0]
        : groupBy === "label"
          ? [...by.labels(note)].sort(byName)[0]
          : undefined;
    if (first) named.set(first.id, first.title || "Untitled");
  }
  const sorted = [...named].map(([id, title]) => ({ id, title })).sort(byName);
  const groups: NoteGroup<T>[] =
    groupBy === "none"
      ? [{ id: ALL_GROUP, name: "All notes", notes: [] }]
      : [
          { id: PINNED_GROUP, name: "Pinned", notes: [] },
          ...(groupBy === "edited"
            ? AGES.map(({ id, name }): NoteGroup<T> => ({ id, name, notes: [] }))
            : sorted.map(({ id, title }): NoteGroup<T> => ({ id, name: title, notes: [] }))),
          ...(groupBy === "course"
            ? [{ id: NO_COURSE_GROUP, name: "No course", notes: [] }]
            : groupBy === "label"
              ? [{ id: NO_LABEL_GROUP, name: "No label", notes: [] }]
              : []),
        ];
  for (const note of notes) {
    groups.find((g) => g.id === noteGroupId(note, by, groupBy, now))?.notes.push(note);
  }
  const filled = groups.filter((g) => g.notes.length > 0);
  if (!keepOrder || groupBy === "none") {
    for (const group of filled) {
      group.notes.sort((a, b) => by.edited(b).localeCompare(by.edited(a)));
    }
  }
  const [only] = filled;
  return filled.length === 1 && (only?.id === NO_COURSE_GROUP || only?.id === NO_LABEL_GROUP)
    ? [{ ...only, name: "All notes" }]
    : filled;
}

/// The notes to pick up again: the latest edits, newest first.
export function continueNotes<T>(notes: T[], by: NoteGrouping<T>, limit = 4): T[] {
  return [...notes].sort((a, b) => by.edited(b).localeCompare(by.edited(a))).slice(0, limit);
}
