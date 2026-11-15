import { DarkTheme, DefaultTheme } from "expo-router";
import { useMemo } from "react";
import { useTheme } from "../ui/theme.ts";

/// React Navigation's theme from Nookly's colours, the same object until they change: a
/// new one each render made every screen's container and bar render again on every page
/// change.
export function useNavigationTheme() {
  const theme = useTheme();
  const { dark } = theme;
  const { primary, background, page, foreground, border } = theme.colors;
  return useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary,
        // Behind every page: the sidebar's background, so the page's rounded corners only
        // ever show the sidebar's color around them. The pages paint their own (`Screen`).
        background,
        card: page,
        text: foreground,
        border,
      },
    };
  }, [dark, primary, background, page, foreground, border]);
}
