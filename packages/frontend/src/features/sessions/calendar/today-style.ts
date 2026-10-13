import { useSetting } from "#/lib/settings/settings.ts";
import type { SettingValue } from "#/lib/settings/registry.ts";

type Color = SettingValue<"calendar.todayColor">;
type Intensity = SettingValue<"calendar.todayIntensity">;

export interface TodayStyle {
  /// Tint behind today's column in the week and day views.
  column: string;
  /// The weekday name above today's column.
  label: string;
  /// The circled day number.
  pill: string;
  /// The same, under the pointer.
  pillHover: string;
}

// Written out whole: the stylesheet only generates classes it can read in the source.
const COLUMN = {
  primary: { low: "bg-primary/3", default: "bg-primary/5", high: "bg-primary/15" },
  neutral: { low: "bg-foreground/3", default: "bg-foreground/6", high: "bg-foreground/14" },
} satisfies Record<Color, Record<Intensity, string>>;

const LOOK = {
  primary: {
    label: "font-medium text-primary",
    pill: "bg-primary font-medium text-primary-foreground",
    pillHover: "hover:bg-primary/90",
  },
  neutral: {
    label: "font-medium text-foreground",
    pill: "bg-foreground font-medium text-background",
    pillHover: "hover:bg-foreground/90",
  },
} satisfies Record<Color, Omit<TodayStyle, "column">>;

/// How today is marked in the calendar, from the two settings.
export function todayStyle(color: Color, intensity: Intensity): TodayStyle {
  return { column: COLUMN[color][intensity], ...LOOK[color] };
}

/// `todayStyle` for the current settings, following changes without a restart.
export function useTodayStyle(): TodayStyle {
  const [color] = useSetting("calendar.todayColor");
  const [intensity] = useSetting("calendar.todayIntensity");
  return todayStyle(color, intensity);
}
