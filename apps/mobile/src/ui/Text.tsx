import { Text as NativeText, type TextProps } from "react-native";
import { FONT, useTheme } from "./theme.ts";

type Variant = "body" | "small" | "label" | "heading" | "title";
type Tone = "default" | "muted" | "primary" | "destructive" | "positive" | "caution";

const SIZES = {
  body: { size: "sm", font: FONT.regular },
  small: { size: "xs", font: FONT.regular },
  label: { size: "xs", font: FONT.medium },
  heading: { size: "base", font: FONT.semibold },
  title: { size: "xl", font: FONT.heading },
} satisfies Record<Variant, { size: keyof ReturnType<typeof useTheme>["text"]; font: string }>;

/// Text in the app's type scale. It follows the system's text size (Dynamic Type).
export function Text({
  variant = "body",
  tone = "default",
  style,
  ...props
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const theme = useTheme();
  const color = {
    default: theme.colors.foreground,
    muted: theme.colors.mutedForeground,
    primary: theme.colors.primary,
    destructive: theme.colors.destructive,
    positive: theme.colors.positive,
    caution: theme.colors.caution,
  }[tone];
  const { size, font } = SIZES[variant];
  return (
    <NativeText
      {...props}
      maxFontSizeMultiplier={2}
      style={[{ color, fontFamily: font, fontSize: theme.text[size] }, style]}
    />
  );
}
