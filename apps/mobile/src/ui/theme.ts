import { DARK, LIGHT, type Palette, RADIUS, SPACING, TEXT } from "@nookly/shared/tokens";
import { useColorScheme } from "react-native";

/// The desktop's design tokens (`@nookly/shared/tokens`, checked against
/// `packages/ui`), in both themes.
export interface Theme {
  dark: boolean;
  colors: Palette;
  radius: typeof RADIUS;
  space: (steps: number) => number;
  text: typeof TEXT;
}

export const FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  heading: "InterTight_600SemiBold",
} as const;

export function themeFor(dark: boolean): Theme {
  return {
    dark,
    colors: dark ? DARK : LIGHT,
    radius: RADIUS,
    space: (steps) => steps * SPACING,
    text: TEXT,
  };
}

export function useTheme(): Theme {
  return themeFor(useColorScheme() === "dark");
}
