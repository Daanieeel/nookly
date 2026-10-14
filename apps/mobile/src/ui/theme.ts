import { useUnstableNativeVariable } from "nativewind";
import { useColorScheme } from "react-native";
import { PAGE_BACKGROUND } from "./classes.ts";

/// A token's color as the stylesheet resolves it now (`@nookly/ui/theme.css`, dark by the
/// system setting), for what can't take a class: icons, spinners, the system pickers
/// and the navigation bars.
function useToken(name: string): string {
  // Missing (as in tests, which run without the stylesheet), it reads as the text color.
  return readVariable(name) ?? "currentColor";
}

/// TypeScript reads the web build's types, where this hook takes nothing; the native
/// build, the one the phone runs, takes the variable's name and returns its value.
const readVariable: (name: string) => string | undefined = useUnstableNativeVariable;

export interface Theme {
  dark: boolean;
  colors: {
    background: string;
    /// A page's background, `PAGE_BACKGROUND`'s color.
    page: string;
    foreground: string;
    border: string;
    primary: string;
    primaryForeground: string;
    mutedForeground: string;
    destructive: string;
    positive: string;
  };
}

export function useTheme(): Theme {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    colors: {
      background: useToken("background"),
      page: useToken(PAGE_BACKGROUND.replace(/^bg-/, "")),
      foreground: useToken("foreground"),
      border: useToken("border"),
      primary: useToken("primary"),
      primaryForeground: useToken("primary-foreground"),
      mutedForeground: useToken("muted-foreground"),
      destructive: useToken("destructive"),
      positive: useToken("accent-green"),
    },
  };
}
