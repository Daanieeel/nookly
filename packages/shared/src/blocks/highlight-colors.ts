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

/// What the marker looks like behind the text, per color: a pale one in the light theme, and
/// a dimmed one over the page in the dark theme (`styles.css`, `.tiptap-content mark`, says
/// the same; a test there reads it against these).
export const HIGHLIGHT_BACKGROUNDS = {
  yellow: { light: "#fef08a", dark: "color-mix(in oklab, #facc15 38%, transparent)" },
  green: { light: "#bbf7d0", dark: "color-mix(in oklab, #4ade80 34%, transparent)" },
  blue: { light: "#bfdbfe", dark: "color-mix(in oklab, #60a5fa 38%, transparent)" },
  pink: { light: "#fbcfe8", dark: "color-mix(in oklab, #f472b6 38%, transparent)" },
  orange: { light: "#fed7aa", dark: "color-mix(in oklab, #fb923c 38%, transparent)" },
  purple: { light: "#ddd6fe", dark: "color-mix(in oklab, #a78bfa 40%, transparent)" },
} satisfies Record<HighlightColorId, { light: string; dark: string }>;

/// The text color on a light marker.
export const HIGHLIGHT_TEXT_ON_LIGHT = "#1c1917";

/// The stylesheet for highlights inside `scope` (a selector), for a light or a dark page.
export function highlightCss(scope: string, dark: boolean): string {
  const side = dark ? "dark" : "light";
  const rules = HIGHLIGHT_COLORS.map(({ id }) => {
    const selector =
      id === DEFAULT_HIGHLIGHT_COLOR ? `${scope} mark` : `${scope} mark[data-color="${id}"]`;
    const background = HIGHLIGHT_BACKGROUNDS[id][side];
    return id === DEFAULT_HIGHLIGHT_COLOR
      ? `${selector} { --mark-bg: ${background}; padding: 0.1em 0.4em; border-radius: 0.25rem; background: var(--mark-bg); color: ${dark ? "inherit" : HIGHLIGHT_TEXT_ON_LIGHT}; box-decoration-break: clone; }`
      : `${selector} { --mark-bg: ${background}; }`;
  });
  return rules.join("\n");
}
