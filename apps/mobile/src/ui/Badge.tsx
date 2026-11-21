import { badgeVariants } from "@nookly/ui/classes";
import type { VariantProps } from "class-variance-authority";
import { View, type ViewStyle } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { useScheme } from "./kit/scheme.ts";
import { Text } from "./Text.tsx";
import {
  PRIMARY,
  PRIMARY_GLOSS,
  SOLID,
  type SolidName,
  elevation,
  semanticHex,
  solidLook,
} from "./tokens.ts";

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface Look {
  fill?: string;
  edge?: string;
  text: string;
  depth?: ViewStyle;
}

/// A badge's colours and depth, the desktop's: the main colour glossy, the status colours
/// solid with a white label, the quiet ones on a raised or a gray fill.
function useLook(variant: BadgeVariant): Look {
  const scheme = useScheme();
  const label = semanticHex("label", scheme);
  const solid = (name: SolidName): Look => ({
    fill: SOLID[name][scheme],
    text: "#ffffff",
    depth: solidLook(SOLID[name][scheme], scheme),
  });
  switch (variant) {
    case "default":
    case "primary":
      return { fill: PRIMARY, text: "#ffffff", depth: PRIMARY_GLOSS };
    case "positive":
      return solid("positive");
    case "caution":
      return solid("caution");
    case "warning":
      return solid("warning");
    case "destructive":
      return solid("destructive");
    case "outline":
      return { edge: semanticHex("controlEdge", scheme), text: label };
    case "ghost":
      return { text: label };
    case "neutral":
      return { fill: semanticHex("fill", scheme), text: label };
    default:
      return {
        fill: semanticHex("raised", scheme),
        edge: semanticHex("controlEdge", scheme),
        text: label,
        depth: elevation("control", scheme),
      };
  }
}

/// The desktop's `Badge`, with its variants (`badgeVariants`) and the depth of its buttons.
export function Badge({
  label,
  variant = "secondary",
  size = "md",
}: {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md" | "lg";
}) {
  const look = useLook(variant);
  // The size and the shape come from the desktop's classes; what fills and edges it, from the look.
  const { box, text } = splitText(row(badgeVariants({ variant: "ghost", size })));
  return (
    <View
      className={cn(box, "self-start")}
      style={[{ backgroundColor: look.fill, borderColor: look.edge ?? "transparent" }, look.depth]}
    >
      <Text className={text} style={{ color: look.text }}>
        {label}
      </Text>
    </View>
  );
}

/// A Space's color as a dot, as next to items in the desktop's lists.
export function SpaceDot({ color }: { color: string }) {
  return <View className="size-2 rounded-full" style={{ backgroundColor: color }} />;
}
