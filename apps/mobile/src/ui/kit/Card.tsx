import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewProps } from "react-native";
import { useSectionRadius } from "../sheet/in-sheet.ts";
import { CORNER, PRIMARY, elevation, withAlpha } from "../tokens.ts";
import { useScheme, useSemantic, useSurface } from "./scheme.ts";

/// A card for something to look at or open (a recipe, a bookmark, a deck): a raised surface
/// with rounded continuous corners, a hairline edge and the card depth. Given `onPress` it is
/// one big button that dims under the finger; its content clips to its corners.
export function Card({
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityRole,
  accent = false,
  radius: own,
  className,
  style,
  children,
  ...rest
}: ViewProps & {
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityRole?: "button" | "link";
  /// Marks the one that is next or current: the primary colour round it, a wash inside.
  accent?: boolean;
  /// A corner radius of its own, for a small one (a thumbnail).
  radius?: number;
  className?: string;
  children?: ReactNode;
}) {
  const scheme = useScheme();
  const surface = useSurface();
  const edge = useSemantic("separator");
  const sectionRadius = useSectionRadius();
  const radius = own ?? sectionRadius;
  const look = [
    CORNER,
    elevation("card", scheme),
    {
      backgroundColor: accent ? withAlpha(PRIMARY, 0.08) : surface,
      borderRadius: radius,
      borderWidth: accent ? 1 : StyleSheet.hairlineWidth,
      borderColor: accent ? withAlpha(PRIMARY, 0.7) : edge,
      overflow: "hidden",
    },
  ] as const;
  if (onPress || onLongPress) {
    return (
      <Pressable
        {...rest}
        accessibilityRole={accessibilityRole ?? "button"}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        className={className}
        style={({ pressed }) => [look, style, pressed && { opacity: 0.8 }]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View
      {...rest}
      accessibilityLabel={accessibilityLabel}
      className={className}
      style={[look, style]}
    >
      {children}
    </View>
  );
}
