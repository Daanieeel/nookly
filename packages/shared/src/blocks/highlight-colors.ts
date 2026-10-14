/// The colours a highlight can have, in the order the colour bar shows them. Yellow is the
/// default and is stored as no colour at all.
export const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Yellow", swatch: "#fde047" },
  { id: "green", label: "Green", swatch: "#86efac" },
  { id: "blue", label: "Blue", swatch: "#93c5fd" },
  { id: "pink", label: "Pink", swatch: "#f9a8d4" },
  { id: "orange", label: "Orange", swatch: "#fdba74" },
  { id: "purple", label: "Purple", swatch: "#c4b5fd" },
] as const;

export type HighlightColorId = (typeof HIGHLIGHT_COLORS)[number]["id"];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorId = "yellow";

/// The colour ids a stored page may name, as a regex alternation.
export const HIGHLIGHT_COLOR_PATTERN = HIGHLIGHT_COLORS.map((c) => c.id).join("|");

/// A stored colour, or null for the default or anything this version does not know.
export function parseHighlightColor(value: string | null | undefined): HighlightColorId | null {
  const found = HIGHLIGHT_COLORS.find((c) => c.id === value);
  return found && found.id !== DEFAULT_HIGHLIGHT_COLOR ? found.id : null;
}
