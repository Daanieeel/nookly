import type { ComponentType } from "react";
import { type ColorValue, Platform } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

export type SymbolName = Extract<SymbolViewProps["name"], string>;

/// A Tabler icon, drawn where SF Symbols are not (Android, tests).
export type FallbackIcon = ComponentType<{ size?: number; color?: string }>;

/// An interface icon: the SF Symbol on iOS, its Tabler twin elsewhere.
export function Glyph({
  name,
  fallback: Fallback,
  size = 17,
  color,
  hex,
  weight = "medium",
}: {
  name: SymbolName;
  fallback: FallbackIcon;
  size?: number;
  /// The symbol's colour: a system colour or a tint.
  color: ColorValue;
  /// The same colour as a hex, for the fallback icon.
  hex: string;
  weight?: SymbolViewProps["weight"];
}) {
  const drawn = <Fallback size={size} color={hex} />;
  if (Platform.OS !== "ios") return drawn;
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      fallback={drawn}
    />
  );
}
