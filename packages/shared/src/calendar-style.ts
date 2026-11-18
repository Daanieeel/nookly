/// How the calendar draws what is on it, once, for the desktop and the phone: the colors an
/// item takes, how a session, an entry and an exam differ, and how today is marked. The
/// desktop's classes (`features/sessions/calendar/SessionBlock.tsx`, `CalendarEntryBlock.tsx`,
/// `ExamCalendarItems.tsx`, `today-style.ts`) say the same in Tailwind; a test there reads
/// them against these numbers, so one cannot change without the other.

/// What an item of the calendar is.
export type CalendarKind = "session" | "calendar_entry" | "exam" | "study_block";

/// A named color of the theme, for an item whose Space has none.
export type ThemeToken = "primary" | "accent-purple" | "destructive";

/// The color an item takes: its Space's accent, else a color of the theme by what it is.
export type Accent = { color: string } | { token: ThemeToken };

export function itemAccent(kind: CalendarKind, spaceColor: string | undefined): Accent {
  if (spaceColor) return { color: spaceColor };
  if (kind === "session") return { token: "primary" };
  if (kind === "exam") return { token: "destructive" };
  return { token: "accent-purple" };
}

/// How a block is drawn in its color: an outline of this width in this share of the
/// color, a bar of `leftBar` points on the left, and a tint of `fillAlpha` behind it.
export interface Look {
  borderWidth: number;
  borderAlpha: number;
  leftBar: number;
  fillAlpha: number;
}

const OUTLINED: Look = { borderWidth: 2, borderAlpha: 1, leftBar: 0, fillAlpha: 0.06 };
const BARRED_ENTRY: Look = { borderWidth: 1, borderAlpha: 0.6, leftBar: 4, fillAlpha: 0.3 };
const BARRED_EXAM: Look = { borderWidth: 1, borderAlpha: 0.6, leftBar: 4, fillAlpha: 0.2 };

/// A block on the hours. A session is an outline with a faint tint (quieter than the rest);
/// an entry, a study block and an exam carry a bar and a stronger tint.
export function blockLook(kind: CalendarKind): Look {
  if (kind === "session") return OUTLINED;
  return kind === "exam" ? BARRED_EXAM : BARRED_ENTRY;
}

/// A line in the all day strip or a month's cell: a bar and a tint, except a session, which
/// keeps its outline.
export function allDayChipLook(kind: CalendarKind): Look {
  if (kind === "session") return OUTLINED;
  return { borderWidth: 0, borderAlpha: 1, leftBar: 4, fillAlpha: 0.25 };
}

/// A hex color with an opacity (`#rrggbbaa`); a color that is not a plain hex is left alone.
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `#${full}${byte.toString(16).padStart(2, "0")}`;
}

export type TodayColor = "primary" | "neutral";
export type TodayIntensity = "low" | "default" | "high";

/// How today is marked, from the `calendar.todayColor` and `calendar.todayIntensity`
/// settings: the color of its label and day number (`base`, a token of the theme) and how
/// strongly its column is tinted.
export interface TodayLook {
  base: "primary" | "foreground";
  columnAlpha: number;
}

const COLUMN_ALPHA = {
  primary: { low: 0.03, default: 0.05, high: 0.15 },
  neutral: { low: 0.03, default: 0.06, high: 0.14 },
} satisfies Record<TodayColor, Record<TodayIntensity, number>>;

export function todayLook(color: TodayColor, intensity: TodayIntensity): TodayLook {
  return {
    base: color === "primary" ? "primary" : "foreground",
    columnAlpha: COLUMN_ALPHA[color][intensity],
  };
}
