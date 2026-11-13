import type { ReactNode } from "react";
import { View } from "react-native";
import {
  BADGE,
  CORNER,
  RADIUS,
  TINT_FILL,
  type TintName,
  tint as tintOf,
  withAlpha,
} from "../tokens.ts";
import { Glyph, type GlyphIcon } from "./Glyph.tsx";
import { useScheme } from "./scheme.ts";

/// An icon in a tinted rounded square, as iOS's Settings draws its rows: the desktop's icon
/// in the tint, on the tint faded. `icon` draws something of the user's own instead (a Space's
/// chosen icon, a status's mark), on the same square.
export function IconBadge({
  glyph,
  icon,
  tint = "blue",
  size = BADGE.size,
}: {
  glyph?: GlyphIcon;
  icon?: ReactNode;
  /// One of Nookly's tints, or a colour (`#rrggbb`) such as a Space's.
  tint?: TintName | string;
  size?: number;
}) {
  const scheme = useScheme();
  const color = tintOf(tint, scheme);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        CORNER,
        {
          width: size,
          height: size,
          borderRadius: RADIUS.badge * (size / BADGE.size),
          backgroundColor: withAlpha(color, TINT_FILL[scheme]),
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      {glyph ? <Glyph icon={glyph} size={size * (BADGE.icon / BADGE.size)} color={color} /> : icon}
    </View>
  );
}
