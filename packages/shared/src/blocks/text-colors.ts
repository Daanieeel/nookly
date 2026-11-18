/// The colours a run of text can have, in the order the colour bar shows them. Text without a
/// colour has none stored, so there is no default among them.
export const TEXT_COLORS = [
  { id: "red", label: "Red", swatch: "#dc2626" },
  { id: "orange", label: "Orange", swatch: "#ea580c" },
  { id: "yellow", label: "Yellow", swatch: "#ca8a04" },
  { id: "green", label: "Green", swatch: "#16a34a" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "purple", label: "Purple", swatch: "#9333ea" },
  { id: "pink", label: "Pink", swatch: "#db2777" },
  { id: "gray", label: "Gray", swatch: "#6b7280" },
] as const;

export type TextColorId = (typeof TEXT_COLORS)[number]["id"];

/// The colour ids a stored page may name, as a regex alternation.
export const TEXT_COLOR_PATTERN = TEXT_COLORS.map((c) => c.id).join("|");

/// A stored colour, or null for anything this version does not know.
export function parseTextColor(value: string | null | undefined): TextColorId | null {
  return TEXT_COLORS.find((c) => c.id === value)?.id ?? null;
}
