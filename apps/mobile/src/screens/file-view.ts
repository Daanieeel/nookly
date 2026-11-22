import { z } from "zod";
import { ENTITY_FILTERS_NONE, ENTITY_FILTER_PICKS } from "../ui/entity-filters.tsx";

/// How a Space's files are shown, remembered on this phone, and how a saved Files View
/// (D74) reads and writes it, in the form the desktop's Files page keeps.

export const FILE_GROUPINGS = [
  { id: "none", label: "No grouping" },
  { id: "kind", label: "Kind" },
  { id: "added", label: "Date added" },
  { id: "label", label: "Label" },
  { id: "course", label: "Course" },
  { id: "attached", label: "Attached to" },
] as const;

export const FILE_ORDERINGS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "Name" },
] as const;

type Grouping = (typeof FILE_GROUPINGS)[number]["id"];
type Ordering = (typeof FILE_ORDERINGS)[number]["id"];

export const fileDisplaySchema = z.object({
  layout: z.enum(["grid", "list"]),
  grouping: z.enum(["none", "kind", "added", "label", "course", "attached"]),
  ordering: z.enum(["newest", "oldest", "name"]),
  /// Kinds and labels the list is narrowed to; empty means all.
  kinds: z.array(z.string()),
  labels: z.array(z.string()),
  ...ENTITY_FILTER_PICKS,
  /// Courses and the things files are attached to, narrowed to; a display saved before they
  /// existed reads as all.
  courses: z.array(z.string()).default([]),
  attached: z.array(z.string()).default([]),
  /// Only the files in no course and with no label, the desktop's Unsorted.
  unsorted: z.boolean().default(false),
  /// The labels picked on the shelf, every one on each file shown. A display saved before
  /// the shelf reads as nothing picked.
  shelf: z.array(z.string()).default([]),
});

export type FileDisplay = z.infer<typeof fileDisplaySchema>;

export const FILE_DEFAULT: FileDisplay = {
  layout: "grid",
  grouping: "none",
  ordering: "newest",
  kinds: [],
  labels: [],
  ...ENTITY_FILTERS_NONE,
  courses: [],
  attached: [],
  unsorted: false,
  shelf: [],
};

/// Each filter's name in a View, and where the phone keeps what it picks.
const FILTER_KEYS = [
  { fieldId: "kind", key: "kinds" },
  { fieldId: "labels", key: "labels" },
  { fieldId: "course", key: "courses" },
  { fieldId: "attached", key: "attached" },
  { fieldId: "pinned", key: "pinned" },
  { fieldId: "created", key: "created" },
  { fieldId: "updated", key: "updated" },
] as const;

/// Every option of a filter, to read an excluding one as the rest.
const EVERY = {
  pinned: ["pinned", "unpinned"],
  created: ["today", "week", "last", "earlier"],
  updated: ["today", "week", "last", "earlier"],
} satisfies Record<"pinned" | "created" | "updated", string[]>;

/// The `filing` filter's one value the phone shows as a switch.
const UNSORTED = "unsorted";

const storedView = z.object({
  query: z.string().catch(""),
  filters: z
    .array(z.object({ fieldId: z.string(), operator: z.string(), values: z.array(z.string()) }))
    .catch([]),
  display: z
    .object({
      layout: z.string(),
      grouping: z.string(),
      ordering: z.string(),
      shelf: z.array(z.string()),
    })
    .partial()
    .catch({}),
});

const viewText = z
  .string()
  .transform((raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  })
  .pipe(storedView.catch({ query: "", filters: [], display: {} }));

/// A saved Files View as this phone's display, and what of it the phone can't show.
export interface FileViewDisplay {
  display: FileDisplay;
  /// The search text the View keeps, when it has any.
  query?: string;
  ignored: string[];
}

/// A saved Files View as this phone's display. What it can't show is named in `ignored`, so
/// a person knows the list is wider than the View on the computer.
export function fileDisplayFromView(
  raw: string,
  all: { labelIds: string[]; kinds?: string[]; courseIds?: string[]; attachedIds?: string[] },
): FileViewDisplay {
  const stored = viewText.parse(raw);
  const display: FileDisplay = { ...FILE_DEFAULT };
  const ignored: string[] = [];
  for (const filter of stored.filters) {
    if (filter.fieldId === "filing") {
      if (filter.operator === "is" && filter.values.join() === UNSORTED) display.unsorted = true;
      else ignored.push("filing");
      continue;
    }
    const known = FILTER_KEYS.find((f) => f.fieldId === filter.fieldId);
    if (!known) {
      ignored.push(filter.fieldId);
      continue;
    }
    const every =
      known.key === "labels"
        ? all.labelIds
        : known.key === "kinds"
          ? (all.kinds ?? [])
          : known.key === "courses"
            ? (all.courseIds ?? [])
            : known.key === "attached"
              ? (all.attachedIds ?? [])
              : EVERY[known.key];
    display[known.key] =
      filter.operator === "isNot"
        ? every.filter((id) => !filter.values.includes(id))
        : filter.values;
  }
  const { layout, grouping, ordering, shelf } = stored.display;
  if (layout === "grid" || layout === "list") display.layout = layout;
  const g = FILE_GROUPINGS.find((x) => x.id === grouping);
  if (g) display.grouping = g.id satisfies Grouping;
  else if (grouping) ignored.push(`grouping by ${grouping}`);
  const o = FILE_ORDERINGS.find((x) => x.id === ordering);
  if (o) display.ordering = o.id satisfies Ordering;
  else if (ordering) ignored.push(`ordering by ${ordering}`);
  if (shelf) display.shelf = shelf;
  return { display, ...(stored.query && { query: stored.query }), ignored };
}

/// The settings of a Files View saved from this phone, in the form the desktop reads.
export function fileViewConfig(display: FileDisplay, query = ""): string {
  return JSON.stringify({
    ...(query.trim() && { query: query.trim() }),
    filters: [
      ...FILTER_KEYS.filter(({ key }) => display[key].length > 0).map(({ fieldId, key }) => ({
        fieldId,
        operator: "is",
        values: display[key],
      })),
      ...(display.unsorted ? [{ fieldId: "filing", operator: "is", values: [UNSORTED] }] : []),
    ],
    display: {
      layout: display.layout,
      grouping: display.grouping,
      ordering: display.ordering,
      shelf: display.shelf,
    },
  });
}
