import { type CalendarKind, itemAccent, todayLook } from "@nookly/shared/calendar-style";
import { useSetting } from "../data/settings.ts";
import { useTheme } from "../ui/theme.ts";

/// The calendar's colors, resolved for this phone's theme: what color an item takes
/// (`@nookly/shared/calendar-style`, as on the desktop) and how today is marked.
export function useCalendarColors() {
  const theme = useTheme();
  const [todayColor] = useSetting("calendar.todayColor");
  const [todayIntensity] = useSetting("calendar.todayIntensity");
  const today = todayLook(todayColor, todayIntensity);
  const base = today.base === "primary" ? theme.colors.primary : theme.colors.foreground;
  return {
    /// The hour and day lines of the hours: a solid color, lighter than `border` in dark
    /// (a faded `border` goes black there).
    gridline: theme.colors.input,
    /// The color of an item of `kind` in a Space of `spaceColor`.
    accent(kind: CalendarKind, spaceColor: string | undefined): string {
      const accent = itemAccent(kind, spaceColor);
      if ("color" in accent) return accent.color;
      if (accent.token === "primary") return theme.colors.primary;
      if (accent.token === "destructive") return theme.colors.destructive;
      return theme.colors.accentPurple;
    },
    today: {
      /// Behind today's column.
      column: { base, alpha: today.columnAlpha },
      /// The weekday name over today's column.
      label: base,
      /// The circled day number, and what is written on it.
      pill: base,
      pillText: today.base === "primary" ? theme.colors.primaryForeground : theme.colors.background,
    },
  };
}
