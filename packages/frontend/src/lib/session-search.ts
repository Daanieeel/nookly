import type { SessionOccurrence } from "#/lib/api/types.ts";
import { formatClock, formatShortDate } from "#/lib/datetime.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/// The ways someone might write a day: `2026-03-10`, `Mar 10`, `10 March`, `Tuesday`.
function dateTerms(date: string): string[] {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return [date];
  const when = new Date(year, month - 1, day);
  const named = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", options).format(when);
  const monthLong = named({ month: "long" });
  const monthShort = named({ month: "short" });
  return [
    date,
    formatShortDate(date),
    `${monthShort} ${day}`,
    `${monthLong} ${day}`,
    `${day} ${monthShort}`,
    `${day} ${monthLong}`,
    named({ weekday: "long" }),
    named({ weekday: "short" }),
    String(year),
  ];
}

/// The ways someone might write a time: `17:45`, `5:45 pm`, `5:45pm`, `5pm`.
function timeTerms(hhmm: string): string[] {
  const [hour, minute] = hhmm.split(":").map(Number);
  if (hour === undefined || Number.isNaN(hour)) return [hhmm];
  const m = minute ?? 0;
  const hour12 = hour % 12 || 12;
  const period = hour >= 12 ? "pm" : "am";
  return [
    `${pad(hour)}:${pad(m)}`,
    `${hour}:${pad(m)}`,
    formatClock(hhmm),
    `${hour12}:${pad(m)} ${period}`,
    `${hour12}:${pad(m)}${period}`,
    ...(m === 0 ? [`${hour12}${period}`, `${hour12} ${period}`] : []),
  ];
}

/// Everything a session can be found by, for a picker or list that matches a typed word
/// against it: its course and title, its day written the usual ways, and when it starts
/// and ends. A session's title is only its course, so the day and time are what tell two
/// of them apart, and people type those.
export function sessionSearchText(session: SessionOccurrence): string {
  return [
    session.courseTitle ?? "",
    session.entity.title,
    ...dateTerms(session.date),
    ...timeTerms(session.startTime),
    ...timeTerms(session.endTime),
  ]
    .filter(Boolean)
    .join(" ");
}

/// Whether the words typed find the session: each word has to begin one of the words of
/// its search text (so `mar 10`, `tue 9am` or `physics 9:00` all work, while `mar 11` does
/// not drift onto another day). A blank query finds everything.
export function sessionMatches(session: SessionOccurrence, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const tokens = sessionSearchText(session).toLowerCase().split(/\s+/);
  return words.every((word) => tokens.some((token) => token.startsWith(word)));
}

/// How a session reads in a list: "Physics, Mar 10, 09:00". Its title is only its course.
export function sessionWhen(session: SessionOccurrence): string {
  const when = sessionTime(session);
  return session.courseTitle ? `${session.courseTitle}, ${when}` : when;
}

/// Just its day and start: "Mar 10, 09:00".
export function sessionTime(session: SessionOccurrence): string {
  return `${formatShortDate(session.date)}, ${formatClock(session.startTime)}`;
}
