/// The colors of `packages/ui/src/styles.css`, for what can't take a class: icons and
/// the navigation bars on the phone, which styles everything else with the desktop's
/// classes through NativeWind. A test checks every value against the stylesheet, so the two can
/// never drift: change a color there, and this file has to follow.

export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  warning: string;
  warningForeground: string;
  border: string;
  input: string;
  ring: string;
  raised: string;
  accentBlue: string;
  accentGreen: string;
  accentPink: string;
  accentPurple: string;
  accentYellow: string;
  /// Success, as `text-positive`.
  positive: string;
  /// A warning that is not a failure, as `text-caution`.
  caution: string;
}

function palette(colors: Omit<Palette, "positive" | "caution">): Palette {
  return { ...colors, positive: colors.accentGreen, caution: colors.accentYellow };
}

export const LIGHT: Palette = palette({
  background: "#f2f2f2",
  foreground: "#0a0a0a",
  card: "#ffffff",
  cardForeground: "#0a0a0a",
  popover: "#f2f2f2",
  popoverForeground: "#0a0a0a",
  primary: "#0070f3",
  primaryForeground: "#ffffff",
  secondary: "#f2f2f2",
  secondaryForeground: "#0a0a0a",
  muted: "#f2f2f2",
  mutedForeground: "#666666",
  accent: "#ececec",
  accentForeground: "#0a0a0a",
  destructive: "#d6336c",
  destructiveForeground: "#ffffff",
  warning: "#c2410c",
  warningForeground: "#ffffff",
  border: "#e2e2e2",
  input: "#d4d4d4",
  ring: "#0070f3",
  raised: "#ffffff",
  accentBlue: "#0070f3",
  accentGreen: "#00873d",
  accentPink: "#d6336c",
  accentPurple: "#9147d6",
  accentYellow: "#ab7a00",
});

export const DARK: Palette = palette({
  background: "#000000",
  foreground: "#eeeeee",
  card: "#1a1a1a",
  cardForeground: "#eeeeee",
  popover: "#1a1a1a",
  popoverForeground: "#eeeeee",
  primary: "#0070f3",
  primaryForeground: "#ffffff",
  secondary: "#1a1a1a",
  secondaryForeground: "#eeeeee",
  muted: "#1a1a1a",
  mutedForeground: "#a0a0a0",
  accent: "#2a2a2a",
  accentForeground: "#eeeeee",
  destructive: "#ff4d8d",
  destructiveForeground: "#ffffff",
  warning: "#fb923c",
  warningForeground: "#0a0a0a",
  border: "#2a2a2a",
  input: "#3a3a3a",
  ring: "#0070f3",
  raised: "#333333",
  accentBlue: "#47a8ff",
  accentGreen: "#00cb50",
  accentPink: "#ff4d8d",
  accentPurple: "#c473fc",
  accentYellow: "#ffcc47",
});
