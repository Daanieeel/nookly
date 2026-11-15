import { z } from "zod";
import { ENTITY_FILTERS_NONE, ENTITY_FILTER_PICKS } from "../ui/entity-filters.tsx";

/// How a Space's files are shown, remembered on this phone, and how a saved Files View
/// (D74) reads and writes it, in the form the desktop's Files page keeps.

export const FILE_GROUPINGS = [
  { id: "none", label: "No grouping" },
  { id: "kind", label: "Kind" },
  { id: "added", label: "Date added" },
  { id: "label", label: "Label" },
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
  grouping: z.enum(["none", "kind", "added", "label"]),
  ordering: z.enum(["newest", "oldest", "name"]),
  /// Kinds and labels the list is narrowed to; empty means all.
  kinds: z.array(z.string()),
  labels: z.array(z.string()),
  ...ENTITY_FILTER_PICKS,
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
  shelf: [],
};

/// Each filter's name in a View, and where the phone keeps what it picks.
const FILTER_KEYS = [
  { fieldId: "kind", key: "kinds" },
  { fieldId: "labels", key: "labels" },
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

const storedView = z.object({
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
  .pipe(storedView.catch({ filters: [], display: {} }));

/// A saved Files View as this phone's display, and what of it the phone can't show.
export interface FileViewDisplay {
  display: FileDisplay;
  ignored: string[];
}

/// A saved Files View as this phone's display. What it can't show is named in `ignored`, so
/// a person knows the list is wider than the View on the computer.
export function fileDisplayFromView(
  raw: string,
  all: { labelIds: string[]; kinds?: string[] },
): FileViewDisplay {
  const stored = viewText.parse(raw);
  const display: FileDisplay = { ...FILE_DEFAULT };
  const ignored: string[] = [];
  for (const filter of stored.filters) {
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
  return { display, ignored };
}

/// The settings of a Files View saved from this phone, in the form the desktop reads.
export function fileViewConfig(display: FileDisplay): string {
  return JSON.stringify({
    filters: FILTER_KEYS.filter(({ key }) => display[key].length > 0).map(({ fieldId, key }) => ({
      fieldId,
      operator: "is",
      values: display[key],
    })),
    display: {
      layout: display.layout,
      grouping: display.grouping,
      ordering: display.ordering,
      shelf: display.shelf,
    },
  });
}
