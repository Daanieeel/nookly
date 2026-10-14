import { DARK, LIGHT, type Palette } from "@nookly/shared/tokens";
import { useColorScheme } from "react-native";

/// The desktop's colors in the current theme, for what can't take a class: icons,
/// the system pickers and the navigation bars. Everything else uses the desktop's
/// classes (`global.css`).
export interface Theme {
  dark: boolean;
  colors: Palette;
}

export function useTheme(): Theme {
  const dark = useColorScheme() === "dark";
  return { dark, colors: dark ? DARK : LIGHT };
}
