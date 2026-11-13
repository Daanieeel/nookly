import {
  type ColorValue,
  DynamicColorIOS,
  Platform,
  PlatformColor,
  type TextStyle,
  type ViewStyle,
} from "react-native";

/// The phone's design tokens (D50): colour, spacing, radius, typography and depth, one
/// source for every base component, so the app stays consistent and feels native to iOS.
/// Touch sizes live in `touch.ts` and motion in `motion.ts`, beside these.

export type Scheme = "light" | "dark";

interface SemanticColor {
  /// The iOS system colour, which adapts to the scheme, contrast and elevation itself.
  ios: string;
  /// What it is elsewhere (Android, tests), per scheme.
  light: string;
  dark: string;
  /// Nookly's own dark value in place of the system's on iOS too.
  ownDark?: true;
}

/// The backmost background in dark mode, the desktop's `--background`: a deep charcoal,
/// not the system's black.
export const CHARCOAL = "#111111";

/// Surfaces, text and lines: iOS's own adaptive colours.
export const SEMANTIC = {
  /// A plain page.
  background: { ios: "systemBackground", light: "#ffffff", dark: CHARCOAL, ownDark: true },
  /// A page of grouped sections (Settings, an item's details), behind its surfaces.
  groupedBackground: {
    ios: "systemGroupedBackground",
    light: "#f2f2f7",
    dark: CHARCOAL,
    ownDark: true,
  },
  /// A grouped section, a sheet's list, a card: one step up from the page.
  surface: { ios: "secondarySystemGroupedBackground", light: "#ffffff", dark: "#1c1c1e" },
  /// Something on a surface: a field, a search bar, a raised card.
  surfaceRaised: { ios: "tertiarySystemGroupedBackground", light: "#f2f2f7", dark: "#2c2c2e" },
  label: { ios: "label", light: "#000000", dark: "#ffffff" },
  secondaryLabel: { ios: "secondaryLabel", light: "#3c3c4399", dark: "#ebebf599" },
  tertiaryLabel: { ios: "tertiaryLabel", light: "#3c3c434d", dark: "#ebebf54d" },
  /// The same two, solid, for a text field: iOS draws a field's colour's transparency twice.
  secondaryLabelSolid: { ios: "systemGray", light: "#8e8e93", dark: "#8e8e93" },
  tertiaryLabelSolid: { ios: "systemGray3", light: "#c7c7cc", dark: "#48484a" },
  separator: { ios: "separator", light: "#3c3c434a", dark: "#54545899" },
  /// A field's or a search bar's fill.
  fill: { ios: "tertiarySystemFill", light: "#7676801f", dark: "#7676803d" },
  /// A row under a finger.
  pressed: { ios: "systemFill", light: "#78788033", dark: "#7878805c" },
} satisfies Record<string, SemanticColor>;

export type SemanticName = keyof typeof SEMANTIC;

export function isSemanticName(name: string): name is SemanticName {
  return name in SEMANTIC;
}

/// A semantic colour for `scheme`: the adaptive system colour on iOS, a fixed one elsewhere.
export function semantic(name: SemanticName, scheme: Scheme): ColorValue {
  const color: SemanticColor = SEMANTIC[name];
  if (Platform.OS !== "ios") return color[scheme];
  return color.ownDark
    ? DynamicColorIOS({ light: PlatformColor(color.ios), dark: color.dark })
    : PlatformColor(color.ios);
}

/// A semantic colour as a plain hex for `scheme`, for what cannot take a system colour (an
/// icon).
export function semanticHex(name: SemanticName, scheme: Scheme): string {
  return SEMANTIC[name][scheme];
}

/// Nookly's own colours, from the desktop's tokens (`@nookly/ui/theme.css`): the accent and
/// what a status, a Space or a badge is tinted with.
export const TINT = {
  blue: { light: "#0070f3", dark: "#47a8ff" },
  green: { light: "#00873d", dark: "#00cb50" },
  pink: { light: "#d6336c", dark: "#ff4d8d" },
  purple: { light: "#9147d6", dark: "#c473fc" },
  yellow: { light: "#ab7a00", dark: "#ffcc47" },
  red: { light: "#e5484d", dark: "#ff6369" },
  gray: { light: "#8e8e93", dark: "#98989d" },
} satisfies Record<string, Record<Scheme, string>>;

export type TintName = keyof typeof TINT;

export function isTintName(name: string): name is TintName {
  return name in TINT;
}

/// A tint's colour, or `color` itself when it is a colour already (a Space's own).
export function tint(color: TintName | string, scheme: Scheme): string {
  return isTintName(color) ? TINT[color][scheme] : color;
}

/// `hex` (`#rrggbb`) at `alpha`, for a tinted badge's or chip's background.
export function withAlpha(hex: string, alpha: number): string {
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex.slice(0, 7)}${channel.toString(16).padStart(2, "0")}`;
}

/// How strong a tinted background is behind its icon, per scheme.
export const TINT_FILL = { light: 0.14, dark: 0.22 } as const;

/// Spacing on a 4 point grid, as iOS lays out its lists.
export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
} as const;

/// The room between a page's edge and its content.
export const GUTTER = SPACE.lg;

/// Corner radii. Every rounded thing also takes `CORNER`, iOS's continuous curve.
export const RADIUS = {
  /// An icon badge, as in Settings.
  badge: 7,
  /// A button, a field, a search bar, a pressed row.
  control: 10,
  /// A grouped section or a card.
  section: 12,
  /// A sheet's top corners.
  sheet: 16,
  pill: 999,
} as const;

export const CORNER: ViewStyle = { borderCurve: "continuous" };

/// iOS's text styles at the default Dynamic Type size; `Text` scales them with the
/// system's text size.
export const TYPE = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} satisfies Record<string, Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight">>;

export type TypeName = keyof typeof TYPE;

/// Inter as the phone loads it, one family per weight (`global.css`).
export const FACE = {
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_600SemiBold",
} as const;

/// Depth between surfaces: flat on the page, raised a little (a card on a page), floating
/// (a menu, a sheet over the page).
export const DEPTH = {
  flat: {},
  raised: {
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  floating: {
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} satisfies Record<string, ViewStyle>;

/// An icon badge: the icon in a tinted rounded square, as iOS's Settings draws them.
export const BADGE = { size: 30, icon: 17 } as const;

/// A segmented control's chosen segment: raised white on light, a lighter gray on dark, as
/// iOS draws it (it has no system colour of its own).
export const SEGMENT_THUMB = { light: "#ffffff", dark: "#636366" } as const;
