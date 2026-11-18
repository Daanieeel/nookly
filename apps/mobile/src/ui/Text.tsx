import { Text as NativeText, type TextProps } from "react-native";
import { cn } from "./classes.ts";

type Variant = "body" | "small" | "label" | "heading" | "title";
type Tone = "default" | "muted" | "primary" | "destructive" | "positive" | "caution";

/// The desktop's type scale: body text `text-sm`, small `text-xs`, labels medium,
/// headings in Inter Tight.
const VARIANTS = {
  body: "text-sm",
  small: "text-xs",
  label: "text-xs font-medium",
  heading: "text-base font-semibold",
  title: "font-heading text-xl",
} satisfies Record<Variant, string>;

const TONES = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-primary",
  destructive: "text-destructive",
  positive: "text-positive",
  caution: "text-caution",
} satisfies Record<Tone, string>;

/// Text in the app's type scale. It follows the system's text size (Dynamic Type).
export function Text({
  variant = "body",
  tone = "default",
  className,
  ...props
}: TextProps & { variant?: Variant; tone?: Tone; className?: string }) {
  return (
    <NativeText
      {...props}
      maxFontSizeMultiplier={2}
      className={cn("font-sans", VARIANTS[variant], TONES[tone], className)}
    />
  );
}
