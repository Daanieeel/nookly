import { IconFileText, IconSchool, IconTag } from "@tabler/icons-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { entityFilterOption, type FilterField } from "#/components/filter-menu.tsx";
import { LabelChip, LabelDot } from "#/components/label-chip.tsx";
import { listLabels } from "#/lib/api/labels.ts";
import { listNoteSummaries } from "#/lib/api/notes.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity, Label, PageSummary, Space } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import {
  type BaseContext,
  dayField,
  relatedField,
  spaceField,
  timestampField,
  titleField,
} from "../fields.tsx";
import type { ViewField, ViewSource } from "../types.ts";

/// Notes, as the view engine shows them where a page embeds them, like a Course's Notes.

export interface NoteContext extends BaseContext {
  labelById: Map<string, Label>;
}

export function noteContext(labels: Label[], spaces: Space[]): NoteContext {
  return {
    labelById: new Map(labels.map((l) => [l.id, l])),
    spaces: new Map(spaces.map((s) => [s.id, s])),
  };
}

const entityOf = (note: PageSummary) => note.entity;

const labelsOf = (note: PageSummary, ctx: NoteContext) =>
  note.labelIds.flatMap((id) => ctx.labelById.get(id) ?? []);

const NOTE_FIELDS: ViewField<PageSummary, NoteContext>[] = [
  titleField(entityOf),
  // Linked to the Course directly, or written for one of its Sessions.
  relatedField({
    id: "course",
    label: "Course",
    relationship: "course-notes",
    lookup: (note) => note.courses,
  }),
  {
    id: "labels",
    label: "Labels",
    kind: "entity",
    value: (note) => note.labelIds,
    text: (note, ctx) =>
      labelsOf(note, ctx)
        .map((l) => l.name)
        .join(", "),
    cell: (note, ctx) => (
      <span className="flex min-w-0 items-center gap-1">
        {labelsOf(note, ctx).map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
      </span>
    ),
  },
  dayField("edited", "Edited", (note) => note.lastEditedAt),
  spaceField(entityOf),
  timestampField("created", entityOf),
  timestampField("updated", entityOf),
];

function useNoteData(spaceId: string | null) {
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const spaceIds = useMemo(
    () => (spaceId ? [spaceId] : spaces.map((s) => s.id)),
    [spaceId, spaces],
  );
  const notes = useQueries({
    queries: spaceIds.map((id) => ({
      queryKey: qk.entities.noteSummaries(id),
      queryFn: () => listNoteSummaries(id),
    })),
    combine: (results) => ({
      items: results.flatMap((r) => r.data ?? []),
      isPending: results.some((r) => r.isPending),
    }),
  });
  const labels = useQueries({
    queries: spaceIds.map((id) => ({
      queryKey: qk.labels.bySpace(id),
      queryFn: () => listLabels(id),
    })),
    combine: (results) => results.flatMap((r) => r.data ?? []),
  });
  const ctx = useMemo(() => noteContext(labels, spaces), [labels, spaces]);
  return { items: notes.items, ctx, isPending: notes.isPending };
}

export const noteSource: ViewSource<PageSummary, NoteContext> = {
  type: "note",
  label: "Notes",
  itemLabel: "note",
  icon: IconFileText,
  entityOf,
  useData: useNoteData,
  fields: NOTE_FIELDS,
  filterFields: (ctx, notes) => {
    const fields: FilterField[] = [];
    const courses = new Map<string, Entity>();
    for (const note of notes) for (const c of note.courses) courses.set(c.id, c);
    if (courses.size > 0) {
      fields.push({
        id: "course",
        label: "Course",
        icon: IconSchool,
        options: [...courses.values()].map(entityFilterOption),
      });
    }
    const labels = [...ctx.labelById.values()].filter((l) =>
      notes.some((n) => n.labelIds.includes(l.id)),
    );
    if (labels.length > 0) {
      fields.push({
        id: "labels",
        label: "Labels",
        icon: IconTag,
        options: labels.map((l) => ({ value: l.id, label: l.name, icon: <LabelDot label={l} /> })),
      });
    }
    return fields;
  },
  filterValue: (note, fieldId) => {
    if (fieldId === "course") return note.courses.map((c) => c.id);
    if (fieldId === "labels") return note.labelIds;
    return note.entity.spaceId;
  },
  // Most recently edited first, like the Notes page.
  order: (notes) => [...notes].sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt)),
  defaultColumns: ["title", "labels", "course", "edited"],
};
