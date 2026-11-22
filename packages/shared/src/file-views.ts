import { z } from "zod";

/// The view Files comes with: the files still to file (in no Course, with no label). Each
/// Space gets it once, on the first visit to Files; it is an ordinary view, so it can be
/// renamed, changed or deleted, and a deleted one does not come back.
export const UNSORTED_VIEW = {
  title: "Unsorted",
  config: JSON.stringify({
    filters: [{ fieldId: "filing", operator: "is", values: ["unsorted"] }],
    display: {},
  }),
};

const unsortedConfig = z.object({
  filters: z.tuple([
    z.object({
      fieldId: z.literal("filing"),
      operator: z.literal("is"),
      values: z.tuple([z.literal("unsorted")]),
    }),
  ]),
});

/// Whether a view's config is exactly the Unsorted one: one `filing is unsorted` filter.
export function isUnsortedView(config: string): boolean {
  try {
    return unsortedConfig.safeParse(JSON.parse(config)).success;
  } catch {
    return false;
  }
}

/// Whether a Space's Files views lack an Unsorted one: none titled so, none of that config.
export function needsUnsortedView(views: { title: string; config: string }[]): boolean {
  return !views.some((v) => v.title === UNSORTED_VIEW.title || isUnsortedView(v.config));
}
