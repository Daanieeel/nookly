import type { ComponentType } from "react";

/// One of the desktop's Tabler icons. The phone draws exactly the icons the desktop does.
export type GlyphIcon = ComponentType<{ size?: number; color?: string }>;

/// An interface icon, the desktop's own, in a plain colour.
export function Glyph({
  icon: Icon,
  size = 17,
  color,
}: {
  icon: GlyphIcon;
  size?: number;
  color: string;
}) {
  return <Icon size={size} color={color} />;
}
